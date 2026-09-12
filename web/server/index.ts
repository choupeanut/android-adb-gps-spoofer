import { registerEngineHandlers } from '@shared/engine-handlers'
/**
 * Android ADB GPS Spoofer — Standalone Web Server
 * Express HTTP + WebSocket, no Electron dependencies.
 */
import express from 'express'
import { createServer, type IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import cors from 'cors'
import { resolve, join } from 'path'
import { mkdirSync } from 'fs'
import { parseGpx } from '../../src/shared/gpx'

import { addBroadcastListener } from './broadcast'
import { log, getLogs } from './logger'
import { DeviceManager } from './services/device-manager'
import { DeviceEngineManager } from './services/device-engine-manager'
import { Database } from './services/db'
import { RoutePlannerService } from './services/route-planner'

import { resolveGoogleMapsLink } from '@shared/google-maps-link'
import type { RoutePlanRoadRequest, RouteWaypoint } from '@shared/types'
import { nextEventRevision } from '@shared/event-revision'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
const WEB_AUTH_TOKEN = process.env.WEB_AUTH_TOKEN
const WEB_CORS_ORIGIN = process.env.WEB_CORS_ORIGIN
mkdirSync(DATA_DIR, { recursive: true })

function isAuthorized(request: Pick<IncomingMessage, 'headers' | 'url'>): boolean {
  if (!WEB_AUTH_TOKEN) return true

  const authorization = request.headers.authorization
  if (authorization === `Bearer ${WEB_AUTH_TOKEN}`) return true

  const token = new URL(request.url ?? '/', 'http://localhost').searchParams.get('token')
  return token === WEB_AUTH_TOKEN
}

// ─── Services ──────────────────────────────────────────────────────────────
const deviceManager = new DeviceManager()
const engineManager = new DeviceEngineManager(deviceManager.adbService)
const db = new Database()
const routePlanner = new RoutePlannerService()

if (!WEB_AUTH_TOKEN) {
  log('warn', '[Server] WEB_AUTH_TOKEN is not configured; web API access is unauthenticated')
}

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
registerEngineHandlers(handle, engineManager,
  (serial) => deviceManager.adbService.maybeRestoreMasterLocation(serial))

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

handle('route-plan-road-network', async (request: RoutePlanRoadRequest) => {
  return routePlanner.planRoadNetwork(request)
})

// Saved locations
handle('maps-resolve-link', (url: string) => resolveGoogleMapsLink(url))
handle('locations-get-saved', () => db.getSavedLocations())
handle('locations-get-history', () => db.getHistory())
handle('locations-save', (name: string, lat: number, lng: number) => db.addSavedLocation(name, lat, lng))
handle('locations-rename', (id: number, name: string) => db.renameSavedLocation(id, name))
handle('locations-touch', (id: number) => db.touchSavedLocation(id))
handle('locations-delete', (id: number) => { db.deleteSavedLocation(id); return true })
handle('locations-add-history', (lat: number, lng: number) => { db.addHistory(lat, lng); return true })

// Wi-Fi IP history
handle('wifi-ip-history-get', () => db.getWifiIpHistory())
handle('wifi-ip-history-record', (ip: string, port: number) => db.recordWifiIp(ip, port))
handle('wifi-ip-history-delete', (ip: string, port: number) => { db.deleteWifiIp(ip, port); return true })

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
    if (typeof savedSession.fixedSpeed === 'boolean') route.setFixedSpeed(savedSession.fixedSpeed)
    if (typeof savedSession.loop === 'boolean') route.setLoop(savedSession.loop)
    if (typeof savedSession.wanderEnabled === 'boolean') {
      route.setWanderEnabled(savedSession.wanderEnabled, (savedSession.wanderRadiusM as number) ?? 100)
    }
  }
  log('info', '[Session] restored from SQLite')
}

// ─── Express ──────────────────────────────────────────────────────────────
const app = express()
app.use(cors(WEB_CORS_ORIGIN ? { origin: WEB_CORS_ORIGIN } : { origin: false }))
app.use(express.json({ limit: '10mb' }))
app.use('/api', (req, res, next) => {
  if (isAuthorized(req)) {
    next()
    return
  }
  res.status(401).json({ error: 'Unauthorized' })
})

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
    res.json(parseGpx(req.body?.content))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// App version
app.get('/api/version', (_req, res) => {
  res.json({ version: process.env.APP_VERSION || 'dev' })
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
const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: (info, done) => {
    if (isAuthorized(info.req)) {
      done(true)
      return
    }
    done(false, 401, 'Unauthorized')
  }
})

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
  const serial = deviceManager.getActiveDevice() ?? firstSerial
  const initPair = serial ? engineManager.getEngines(serial) : null
  const initRoute = initPair?.route ?? null
  const routeLocation = initRoute?.getCurrentLocation() ?? null
  const initLocation = routeLocation ?? initPair?.location.getCurrentLocation() ?? null
  const initMode = routeLocation ? 'route' : initPair?.location.getMode() ?? 'idle'
  const revision = nextEventRevision()

  ws.send(JSON.stringify({
    type: 'init',
    data: {
      devices: deviceManager.getDevices(),
      activeDevice: deviceManager.getActiveDevice(),
      serial,
      revision,
      location: initLocation,
      mode: initMode,
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
