import { ipcMain, app } from 'electron'
import { DeviceManager } from '../services/device-manager'
import { DeviceEngineManager } from '../services/device-engine-manager'
import { Database } from '../services/db'
import { RoutePlannerService } from '../services/route-planner'
import { registerGpxHandlers } from './gpx.ipc'
import { registerHandler } from '../server/index'
import { getLogs, getLogDir } from '../logger'
import { log } from '../logger'
import type { RoutePlanRoadRequest, RouteWaypoint } from '@shared/types'

/**
 * Register a handler for both Electron IPC and WebSocket.
 * The IPC handler receives (_event, ...args); the web handler receives (...args) directly.
 */
function handle(channel: string, handler: (...args: any[]) => any): void {
  // Electron IPC: first arg is the event object
  ipcMain.handle(channel, (_event, ...args) => handler(...args))
  // WebSocket: receives args directly (no event object)
  registerHandler(channel, handler)
}

export function registerIpcHandlers(deviceManager: DeviceManager): void {
  const engineManager = new DeviceEngineManager(deviceManager.adbService)
  const routePlanner = new RoutePlannerService()

  let db: Database
  try {
    db = new Database()
  } catch (err: any) {
    // SQLite failure must not prevent IPC registration — ADB features still work
    log('error', `[IPC] Database init failed: ${err.message}`)
    db = new Database(true) // graceful no-op stub
  }

  // Prune engines when devices disconnect
  deviceManager.onDevicesChanged((connectedSerials) => {
    engineManager.pruneDisconnected(connectedSerials)
  })

  registerGpxHandlers()

  // ─── App info ─────────────────────────────────────────────────────────────

  ipcMain.handle('get-app-version', () => app.getVersion())

  // ─── Device ──────────────────────────────────────────────────────────────

  handle('get-devices', () => ({
    devices: deviceManager.getDevices(),
    activeDevice: deviceManager.getActiveDevice()
  }))

  handle('set-active-device', (serial: string) => {
    deviceManager.setActiveDevice(serial)
    return true
  })

  // ─── ADB test ─────────────────────────────────────────────────────────────

  handle('test-adb', async (serial: string) => {
    return deviceManager.adbService.testConnection(serial)
  })

  handle('get-adb-diagnostics', () => {
    return deviceManager.adbService.getDiagnostics()
  })

  // ─── Mock location setup ─────────────────────────────────────────────────

  handle('enable-mock-location', async (serial: string) => {
    await deviceManager.adbService.hardenWifiConnection(serial)
    const result = await deviceManager.adbService.enableMockLocation(serial)
    if (result.ok) {
      await deviceManager.adbService.maybeDisableMasterLocationForSpoof(serial)
    }
    return result
  })

  // ─── Real GPS read ────────────────────────────────────────────────────────

  handle('get-real-location', async (serial: string) => {
    return deviceManager.adbService.getRealLocation(serial)
  })

  // Fetch real GPS for ALL connected devices at once
  handle('get-all-real-locations', async () => {
    const devices = deviceManager.getDevices()
    const results: Record<string, { lat: number; lng: number } | null> = {}
    await Promise.all(
      devices
        .filter((d) => d.status === 'connected')
        .map(async (d) => {
          results[d.serial] = await deviceManager.adbService.getRealLocation(d.serial)
        })
    )
    return results
  })

  // Per-device spoofing state (for UI status dots)
  handle('get-device-state', async (serial: string) => {
    return engineManager.getDeviceState(serial)
  })

  // All device states at once
  handle('get-all-device-states', async () => {
    const devices = deviceManager.getDevices()
    const results: Record<string, { mode: string; playing: boolean; wandering: boolean }> = {}
    for (const d of devices.filter((dev) => dev.status === 'connected')) {
      results[d.serial] = engineManager.getDeviceState(d.serial)
    }
    return results
  })

  // ─── Location (per-device dispatch) ──────────────────────────────────────

  handle('teleport', async (serials: string[], lat: number, lng: number) => {
    const results = await Promise.all(
      serials.map(async (serial) => {
        const { location, route } = engineManager.getEngines(serial)
        // Stop any active route before teleporting to prevent timer conflicts.
        route.stopForStay()
        return location.teleport([serial], lat, lng)
      })
    )
    return results.every(Boolean)
  })

  handle('start-joystick', async (serials: string[]) => {
    for (const serial of serials) {
      const { location, route } = engineManager.getEngines(serial)
      
      // Transfer current location from route engine to location engine before stopping
      const routeLocation = route.getCurrentLocation()
      if (routeLocation) {
        // Set the location in the location engine so joystick can continue from paused position
        location.updatePosition(
          routeLocation.lat,
          routeLocation.lng,
          routeLocation.bearing,
          routeLocation.speed
        )
      }
      
      // Stop any active route before joystick to prevent timer conflicts.
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
    await Promise.all(
      serials.map(async (serial) => {
        const { location, route } = engineManager.getEngines(serial)
        route.stopForStay()
        await location.stop([serial])
      })
    )
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

  // ─── Stop All (new) ──────────────────────────────────────────────────────

  handle('stop-all', async (mode: 'stay' | 'graceful' | 'immediate') => {
    const targets = engineManager.getActiveSerials()
    await engineManager.stopAll(mode)
    if (mode !== 'stay') {
      await Promise.all(targets.map((serial) => deviceManager.adbService.maybeRestoreMasterLocation(serial)))
    }
    return true
  })

  // ─── Wi-Fi ADB ────────────────────────────────────────────────────────────

  handle('connect-wifi', async (ip: string, port?: number) => {
    const result = await deviceManager.adbService.connectWifi(ip, port)
    if (result.ok) {
      // Force immediate poll + retry after 2s for devices that initially appear offline
      await deviceManager.forcePoll()
      setTimeout(() => deviceManager.forcePoll(), 2000)
    }
    return result
  })

  handle('enable-tcpip', async (serial: string) => {
    const success = await deviceManager.adbService.enableTcpip(serial)
    if (success) {
      const ip = await deviceManager.adbService.getDeviceIp(serial)
      return { success, ip }
    }
    return { success: false, ip: null }
  })

  // ─── Route (per-device dispatch) ─────────────────────────────────────────

  handle('route-set-waypoints', (waypoints: RouteWaypoint[], serials?: string[]) => {
    const targets = serials ?? engineManager.getActiveSerials()
    for (const serial of targets) {
      const { route } = engineManager.getEngines(serial)
      route.setWaypoints(waypoints)
    }
    return true
  })

  handle('route-plan-road-network', async (request: RoutePlanRoadRequest) => {
    return routePlanner.planRoadNetwork(request)
  })

  handle('route-play', async (
    serials: string[],
    speedMs: number,
    fromLat?: number,
    fromLng?: number
  ) => {
    await Promise.all(
      serials.map((serial) => {
        const { location, route } = engineManager.getEngines(serial)
        // Stop the location engine keep-alive before starting route to prevent timer conflicts.
        location.stopContinuousUpdate()
        location.setMode('idle')
        return route.play([serial], speedMs, fromLat, fromLng)
      })
    )
    return true
  })

  handle('route-pause', (serials?: string[]) => {
    const targets = serials ?? engineManager.getActiveSerials()
    for (const serial of targets) {
      const pair = engineManager.peekEngines(serial)
      if (pair) pair.route.pause()
    }
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
        // Transfer position to location engine and start teleport keep-alive
        pair.location.updatePosition(currentLoc.lat, currentLoc.lng, currentLoc.bearing, 0)
        return pair.location.teleport([serial], currentLoc.lat, currentLoc.lng)
      })
    )
    return results.every(Boolean)
  })

  handle('route-return-to-gps', (
    realLat: number, realLng: number, speedMs: number, serials?: string[]
  ) => {
    const targets = serials ?? engineManager.getActiveSerials()
    for (const serial of targets) {
      const pair = engineManager.peekEngines(serial)
      if (pair) pair.route.returnToRealGps(realLat, realLng, speedMs)
    }
    return true
  })

  handle('route-set-loop', (loop: boolean, serials?: string[]) => {
    const targets = serials ?? engineManager.getActiveSerials()
    for (const serial of targets) {
      const pair = engineManager.peekEngines(serial)
      if (pair) pair.route.setLoop(loop)
    }
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
    for (const serial of targets) {
      const pair = engineManager.peekEngines(serial)
      if (pair) pair.route.setWanderEnabled(enabled, radiusM)
    }
    return true
  })

  handle('route-set-speed', (speedMs: number, serials?: string[]) => {
    const targets = serials ?? engineManager.getActiveSerials()
    for (const serial of targets) {
      const pair = engineManager.peekEngines(serial)
      if (pair) pair.route.setSpeed(speedMs)
    }
    return true
  })

  handle('route-set-fixed-speed', (enabled: boolean, serials?: string[]) => {
    const targets = serials ?? engineManager.getActiveSerials()
    for (const serial of targets) {
      const pair = engineManager.peekEngines(serial)
      if (pair) pair.route.setFixedSpeed(enabled)
    }
    return true
  })

  // ─── Saved locations ─────────────────────────────────────────────────────

  handle('locations-get-saved',   () => db.getSavedLocations())
  handle('locations-get-history', () => db.getHistory())

  handle('locations-save', (name: string, lat: number, lng: number) =>
    db.addSavedLocation(name, lat, lng))

  handle('locations-delete', (id: number) => {
    db.deleteSavedLocation(id)
    return true
  })

  handle('locations-add-history', (lat: number, lng: number) => {
    db.addHistory(lat, lng)
    return true
  })

  // ─── Session ──────────────────────────────────────────────────────────────
  handle('get-session', () => db.getSession())
  handle('save-session', (data: Record<string, unknown>) => {
    db.saveSession(data)
    return true
  })

  // ─── Logs ─────────────────────────────────────────────────────────────────
  handle('get-logs', () => getLogs())
  handle('get-log-dir', () => getLogDir())
}
