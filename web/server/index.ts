/**
 * Android ADB GPS Spoofer — Standalone Web Server
 * Express HTTP + WebSocket, no Electron dependencies.
 */
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import cors from 'cors'
import { resolve, join } from 'path'
import { mkdirSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'

import { addBroadcastListener } from './broadcast'
import { log, getLogs } from './logger'
import { DeviceManager } from './services/device-manager'
import { DeviceEngineManager } from './services/device-engine-manager'
import { Database } from './services/db'

import type { RouteWaypoint } from '@shared/types'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

// ─── Services ──────────────────────────────────────────────────────────────
const deviceManager = new DeviceManager()
const engineManager = new DeviceEngineManager(deviceManager.adbService)
const db = new Database()

deviceManager.onDevicesChanged((connectedSerials) => {
  engineManager.pruneDisconnected(connectedSerials)
})

// ─── Handler registry (same as Electron IPC) ──────────────────────────────
const handlers = new Map<string, (...args: any[]) => any>()

function handle(channel: string, handler: (...args: any[]) => any): void {
  handlers.set(channel, handler)
}

// ─── Register all handlers ─────────────────────────────────────────────────

// Device
handle('get-devices', () => ({
  devices: deviceManager.getDevices(),
  activeDevice: deviceManager.getActiveDevice()
}))

handle('set-active-device', (serial: string) => {
  deviceManager.setActiveDevice(serial)
  return true
})

handle('test-adb', (serial: string) => deviceManager.adbService.testConnection(serial))
handle('enable-mock-location', async (serial: string) => {
  // Apply WiFi stability hardening before enabling mock location
  await deviceManager.adbService.hardenWifiConnection(serial)
  const result = await deviceManager.adbService.enableMockLocation(serial)
  if (result.ok) {
    await deviceManager.adbService.maybeDisableMasterLocationForSpoof(serial)
  }
  return result
})
handle('get-real-location', (serial: string) => deviceManager.adbService.getRealLocation(serial))

handle('get-all-real-locations', async () => {
  const devices = deviceManager.getDevices()
  const results: Record<string, { lat: number; lng: number } | null> = {}
  await Promise.all(
    devices.filter((d) => d.status === 'connected').map(async (d) => {
      results[d.serial] = await deviceManager.adbService.getRealLocation(d.serial)
    })
  )
  return results
})

handle('get-device-state', (serial: string) => engineManager.getDeviceState(serial))

handle('get-all-device-states', () => {
  const devices = deviceManager.getDevices()
  const results: Record<string, { mode: string; playing: boolean; wandering: boolean }> = {}
  for (const d of devices.filter((dev) => dev.status === 'connected')) {
    results[d.serial] = engineManager.getDeviceState(d.serial)
  }
  return results
})

// Location
handle('teleport', async (serials: string[], lat: number, lng: number) => {
  const results = await Promise.all(
    serials.map(async (serial) => {
      const { location, route } = engineManager.getEngines(serial)
      route.stopForStay()
      return location.teleport([serial], lat, lng)
    })
  )
  return results.every(Boolean)
})

handle('start-joystick', (serials: string[]) => {
  for (const serial of serials) {
    const { location, route } = engineManager.getEngines(serial)
    const routeLocation = route.getCurrentLocation()
    if (routeLocation) {
      location.updatePosition(
        routeLocation.lat,
        routeLocation.lng,
        routeLocation.bearing,
        routeLocation.speed
      )
    }
    route.stopForStay()
    location.setMode('joystick')
    location.startContinuousUpdate([serial])
  }
  return true
})

handle('stop-joystick', (serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) {
    const pair = engineManager.peekEngines(serial)
    if (pair && pair.location.getMode() === 'joystick') {
      pair.location.setMode('idle')
      pair.location.stopContinuousUpdate()
    }
  }
  return true
})

handle('update-position', (lat: number, lng: number, brg: number, speed: number, serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) {
    const pair = engineManager.peekEngines(serial)
    if (pair && pair.location.getMode() === 'joystick') {
      pair.location.updatePosition(lat, lng, brg, speed)
    }
  }
  return true
})

handle('stop-spoofing', async (serials: string[]) => {
  await Promise.all(serials.map(async (serial) => {
    const { location, route } = engineManager.getEngines(serial)
    route.stopForStay()
    await location.stop([serial])
  }))
  return true
})

handle('stop-spoofing-graceful', (serials: string[], realLat: number, realLng: number) => {
  for (const serial of serials) {
    const { location, route } = engineManager.getEngines(serial)
    route.stopForStay()
    location.startGracefulStop([serial], realLat, realLng)
  }
  return true
})

handle('get-location-state', (serial?: string) => {
  if (!serial) {
    const firstSerial = engineManager.getActiveSerials()[0]
    if (!firstSerial) return { location: null, mode: 'idle' }
    const { location } = engineManager.getEngines(firstSerial)
    return { location: location.getCurrentLocation(), mode: location.getMode() }
  }
  const { location } = engineManager.getEngines(serial)
  return { location: location.getCurrentLocation(), mode: location.getMode() }
})

handle('stop-all', async (mode: 'stay' | 'graceful' | 'immediate') => {
  const targets = engineManager.getActiveSerials()
  await engineManager.stopAll(mode)
  if (mode !== 'stay') {
    await Promise.all(targets.map((serial) => deviceManager.adbService.maybeRestoreMasterLocation(serial)))
  }
  return true
})

// WiFi ADB
handle('connect-wifi', async (ip: string, port?: number) => {
  log('info', `[Handler] connect-wifi ${ip}:${port ?? 5555}`)
  const ok = await deviceManager.adbService.connectWifi(ip, port)
  log('info', `[Handler] connect-wifi result: ${ok}`)
  if (ok) {
    // Force immediate poll + retry after 2s for devices that initially appear offline
    await deviceManager.forcePoll()
    setTimeout(() => deviceManager.forcePoll(), 2000)
  }
  return ok
})

handle('enable-tcpip', async (serial: string) => {
  const success = await deviceManager.adbService.enableTcpip(serial)
  if (success) {
    const ip = await deviceManager.adbService.getDeviceIp(serial)
    return { success, ip }
  }
  return { success: false, ip: null }
})

// Route
handle('route-set-waypoints', (waypoints: RouteWaypoint[], serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) engineManager.getEngines(serial).route.setWaypoints(waypoints)
  return true
})

handle('route-play', async (serials: string[], speedMs: number, fromLat?: number, fromLng?: number) => {
  await Promise.all(serials.map((serial) => {
    const { location, route } = engineManager.getEngines(serial)
    location.stopContinuousUpdate()
    location.setMode('idle')
    return route.play([serial], speedMs, fromLat, fromLng)
  }))
  return true
})

handle('route-pause', (serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) engineManager.peekEngines(serial)?.route.pause()
  return true
})

handle('route-stop', async (serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  await Promise.all(
    targets.map(async (serial) => {
      const pair = engineManager.peekEngines(serial)
      if (!pair) return
      await pair.route.stopAndAwaitCleanup()
      await deviceManager.adbService.maybeRestoreMasterLocation(serial)
    })
  )
  return true
})

/** Stop route but stay at current spoofed position (transfer to location engine keep-alive). */
handle('route-stop-stay', async (serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  const results = await Promise.all(
    targets.map(async (serial) => {
      const pair = engineManager.peekEngines(serial)
      if (!pair) return false
      const currentLoc = pair.route.getCurrentLocation()
      pair.route.stopForStay()
      if (!currentLoc) return true
      pair.location.updatePosition(currentLoc.lat, currentLoc.lng, currentLoc.bearing, 0)
      return pair.location.teleport([serial], currentLoc.lat, currentLoc.lng)
    })
  )
  return results.every(Boolean)
})

handle('route-return-to-gps', (realLat: number, realLng: number, speedMs: number, serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) engineManager.peekEngines(serial)?.route.returnToRealGps(realLat, realLng, speedMs)
  return true
})

handle('route-set-loop', (loop: boolean, serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) engineManager.peekEngines(serial)?.route.setLoop(loop)
  return true
})

handle('route-get-state', (serial?: string) => {
  if (!serial) {
    const firstSerial = engineManager.getActiveSerials()[0]
    if (!firstSerial) return null
    return engineManager.getEngines(firstSerial).route.getState()
  }
  return engineManager.getEngines(serial).route.getState()
})

handle('route-set-wander', (enabled: boolean, radiusM: number, serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) engineManager.peekEngines(serial)?.route.setWanderEnabled(enabled, radiusM)
  return true
})

handle('route-set-speed', (speedMs: number, serials?: string[]) => {
  const targets = serials ?? engineManager.getActiveSerials()
  for (const serial of targets) engineManager.peekEngines(serial)?.route.setSpeed(speedMs)
  return true
})

// Saved locations
handle('locations-get-saved', () => db.getSavedLocations())
handle('locations-get-history', () => db.getHistory())
handle('locations-save', (name: string, lat: number, lng: number) => db.addSavedLocation(name, lat, lng))
handle('locations-delete', (id: number) => { db.deleteSavedLocation(id); return true })
handle('locations-add-history', (lat: number, lng: number) => { db.addHistory(lat, lng); return true })

// Session
handle('get-session', () => db.getSession())
handle('save-session', (data: Record<string, unknown>) => {
  const current = db.getSession() ?? {}
  db.saveSession({ ...current, ...data })
  return true
})

// Logs
handle('get-logs', () => getLogs())

// GPX parse (server-side)
handle('import-gpx', () => {
  // Web client must send GPX content via parse endpoint (no Electron dialog)
  return null
})

// ─── Restore session from previous run ────────────────────────────────────
const savedSession = db.getSession()
if (savedSession) {
  const firstSerial = engineManager.getActiveSerials()[0]
  if (firstSerial) {
    const { route } = engineManager.getEngines(firstSerial)
    if (Array.isArray(savedSession.waypoints) && (savedSession.waypoints as any[]).length > 0) {
      route.setWaypoints(savedSession.waypoints as any)
    }
    if (typeof savedSession.speedMs === 'number') route.setSpeed(savedSession.speedMs)
    if (typeof savedSession.loop === 'boolean') route.setLoop(savedSession.loop)
    if (typeof savedSession.wanderEnabled === 'boolean') {
      route.setWanderEnabled(savedSession.wanderEnabled, (savedSession.wanderRadiusM as number) ?? 100)
    }
  }
  log('info', '[Session] restored from SQLite')
}

// ─── Express ──────────────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// REST API — wraps all registered handlers
app.post('/api/call', async (req, res) => {
  const { channel, args } = req.body
  const handler = handlers.get(channel)
  if (!handler) {
    res.status(404).json({ error: `Unknown channel: ${channel}` })
    return
  }
  try {
    const result = await handler(...(args ?? []))
    res.json({ result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GPX upload endpoint
app.post('/api/gpx/parse', (req, res) => {
  try {
    const { content } = req.body
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const parsed = parser.parse(content)
    const gpx = parsed.gpx
    if (!gpx) { res.json([]); return }

    const waypoints: RouteWaypoint[] = []
    const trk = gpx.trk
    if (trk) {
      const trkArray = Array.isArray(trk) ? trk : [trk]
      for (const track of trkArray) {
        const trkseg = track.trkseg
        const segments = Array.isArray(trkseg) ? trkseg : [trkseg]
        for (const seg of segments) {
          const trkpts = seg?.trkpt
          if (!trkpts) continue
          const pts = Array.isArray(trkpts) ? trkpts : [trkpts]
          for (const pt of pts) {
            const lat = parseFloat(pt['@_lat']), lng = parseFloat(pt['@_lon'])
            if (!isNaN(lat) && !isNaN(lng))
              waypoints.push({ lat, lng, altitude: pt.ele ? parseFloat(pt.ele) : 0 })
          }
        }
      }
    }
    if (waypoints.length === 0 && gpx.wpt) {
      const wpts = Array.isArray(gpx.wpt) ? gpx.wpt : [gpx.wpt]
      for (const wpt of wpts) {
        const lat = parseFloat(wpt['@_lat']), lng = parseFloat(wpt['@_lon'])
        if (!isNaN(lat) && !isNaN(lng))
          waypoints.push({ lat, lng, altitude: wpt.ele ? parseFloat(wpt.ele) : 0 })
      }
    }
    if (waypoints.length > 1000) {
      const step = Math.ceil(waypoints.length / 1000)
      res.json(waypoints.filter((_, i) => i % step === 0))
      return
    }
    res.json(waypoints)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// Return the client's LAN IP (useful for auto-filling ADB connect)
app.get('/api/client-ip', (req, res) => {
  let ip = req.headers['x-forwarded-for'] as string | undefined
  if (ip) ip = ip.split(',')[0].trim()
  if (!ip) ip = req.socket.remoteAddress ?? ''
  // Strip IPv6-mapped IPv4 prefix
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  res.json({ ip })
})

// Serve static client build
// Hashed assets → immutable 1-year cache; index.html → no cache
const clientDist = resolve(__dirname, '../client')
app.use(express.static(clientDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    } else if (/\.(js|css|woff2?|ttf|png|jpg|svg|ico|webp)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  }
}))
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.sendFile(join(clientDist, 'index.html'))
})

// ─── HTTP + WebSocket server ──────────────────────────────────────────────
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

// Wire broadcast → WebSocket clients
const clients = new Set<WebSocket>()
addBroadcastListener((channel: string, data: unknown) => {
  const msg = JSON.stringify({ type: 'event', channel, data })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
})

wss.on('connection', (ws, req) => {
  clients.add(ws)
  const clientIp = req.socket.remoteAddress ?? 'unknown'
  log('info', `[WS] client connected: ${clientIp} (total: ${clients.size})`)

  // Send initial state
  const firstSerial = engineManager.getActiveSerials()[0]
  const initLoc = firstSerial ? engineManager.getEngines(firstSerial).location : null
  const initRoute = firstSerial ? engineManager.getEngines(firstSerial).route : null

  ws.send(JSON.stringify({
    type: 'init',
    data: {
      devices: deviceManager.getDevices(),
      activeDevice: deviceManager.getActiveDevice(),
      location: initLoc?.getCurrentLocation() ?? null,
      mode: initLoc?.getMode() ?? 'idle',
      route: initRoute?.getState() ?? null
    }
  }))

  ws.on('message', async (raw) => {
    let msgId: string | undefined
    try {
      const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
      const { id, channel, args } = msg
      msgId = id
      if (!channel || !id) {
        ws.send(JSON.stringify({ type: 'error', id, error: 'Missing channel or id' }))
        return
      }
      const handler = handlers.get(channel)
      if (!handler) {
        ws.send(JSON.stringify({ type: 'response', id, error: `Unknown channel: ${channel}` }))
        return
      }
      const result = await handler(...(args ?? []))
      ws.send(JSON.stringify({ type: 'response', id, result }))
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'response', id: msgId, error: err?.message ?? 'Unknown error' }))
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    log('info', `[WS] client disconnected (total: ${clients.size})`)
  })
  ws.on('error', () => clients.delete(ws))
})

server.listen(PORT, '0.0.0.0', () => {
  log('ok', `[Server] Android ADB GPS Spoofer Web listening on http://0.0.0.0:${PORT}`)
})

async function gracefulShutdown(signal: string) {
  log('info', `[Server] ${signal} received — cleaning up test providers…`)
  try { await engineManager.stopAll('immediate') } catch { /* best effort */ }
  engineManager.dispose()
  deviceManager.dispose()
  server.close()
  process.exit(0)
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
