import { registerEngineHandlers } from '@shared/engine-handlers'
import { ipcMain, app } from 'electron'
import { DeviceManager } from '../services/device-manager'
import { DeviceEngineManager } from '../services/device-engine-manager'
import { Database } from '../services/db'
import { RoutePlannerService } from '../services/route-planner'
import { registerGpxHandlers } from './gpx.ipc'
import { registerHandler } from '../server/index'
import { getLogs, getLogDir } from '../logger'
import { log } from '../logger'
import { resolveGoogleMapsLink } from '@shared/google-maps-link'
import type { RoutePlanRoadRequest } from '@shared/types'

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

  // Preserve route membership and retry reconnect setup on every device poll
  deviceManager.onDevicesChanged((connectedSerials) => {
    engineManager.pruneDisconnected(connectedSerials)
  })

  registerEngineHandlers(handle, engineManager,
    (serial) => deviceManager.adbService.maybeRestoreMasterLocation(serial))

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

  // ─── Route planning ─────────────────────────────────────────

  handle('route-plan-road-network', async (request: RoutePlanRoadRequest) => {
    return routePlanner.planRoadNetwork(request)
  })

  // ─── Saved locations ─────────────────────────────────────────────────────

  handle('maps-resolve-link', (url: string) => resolveGoogleMapsLink(url))

  handle('locations-get-saved',   () => db.getSavedLocations())
  handle('locations-get-history', () => db.getHistory())

  handle('locations-save', (name: string, lat: number, lng: number) =>
    db.addSavedLocation(name, lat, lng))

  handle('locations-rename', (id: number, name: string) =>
    db.renameSavedLocation(id, name))

  handle('locations-touch', (id: number) => db.touchSavedLocation(id))

  handle('locations-delete', (id: number) => {
    db.deleteSavedLocation(id)
    return true
  })

  handle('locations-add-history', (lat: number, lng: number) => {
    db.addHistory(lat, lng)
    return true
  })

  // ─── Wi-Fi IP history ────────────────────────────────────────────────────

  handle('wifi-ip-history-get', () => db.getWifiIpHistory())

  handle('wifi-ip-history-record', (ip: string, port: number) => {
    return db.recordWifiIp(ip, port)
  })

  handle('wifi-ip-history-delete', (ip: string, port: number) => {
    db.deleteWifiIp(ip, port)
    return true
  })

  // ─── Session ──────────────────────────────────────────────────────────────
  handle('get-session', () => db.getSession())
  handle('save-session', (data: Record<string, unknown>) => {
    const current = db.getSession() ?? {}
    db.saveSession({ ...current, ...data })
    return true
  })

  // ─── Logs ─────────────────────────────────────────────────────────────────
  handle('get-logs', () => getLogs())
  handle('get-log-dir', () => getLogDir())
}
