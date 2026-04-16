import { contextBridge, ipcRenderer } from 'electron'
import type { RouteWaypoint } from '../shared/types'

export type GpsSpoofApi = typeof api

const api = {
  // Device
  getDevices: () => ipcRenderer.invoke('get-devices'),
  setActiveDevice: (serial: string) => ipcRenderer.invoke('set-active-device', serial),
  testAdb: (serial: string) => ipcRenderer.invoke('test-adb', serial),
  enableMockLocation: (serial: string) => ipcRenderer.invoke('enable-mock-location', serial),
  getRealLocation: (serial: string) => ipcRenderer.invoke('get-real-location', serial),
  getAllRealLocations: () => ipcRenderer.invoke('get-all-real-locations'),
  getDeviceState: (serial: string) => ipcRenderer.invoke('get-device-state', serial),
  getAllDeviceStates: () => ipcRenderer.invoke('get-all-device-states'),

  // Location — all action calls now accept serials[] for multi-device
  teleport: (serials: string[], lat: number, lng: number) =>
    ipcRenderer.invoke('teleport', serials, lat, lng),
  startJoystick: (serials: string[]) => ipcRenderer.invoke('start-joystick', serials),
  stopJoystick: () => ipcRenderer.invoke('stop-joystick'),
  updatePosition: (lat: number, lng: number, bearing: number, speed: number) =>
    ipcRenderer.invoke('update-position', lat, lng, bearing, speed),
  stopSpoofing: (serials: string[]) => ipcRenderer.invoke('stop-spoofing', serials),
  stopSpoofingGraceful: (serials: string[], realLat: number, realLng: number) =>
    ipcRenderer.invoke('stop-spoofing-graceful', serials, realLat, realLng),
  getLocationState: () => ipcRenderer.invoke('get-location-state'),
  stopAll: (mode: 'stay' | 'graceful' | 'immediate') =>
    ipcRenderer.invoke('stop-all', mode),

  // Route
  routeSetWaypoints: (waypoints: RouteWaypoint[], serials?: string[]) =>
    ipcRenderer.invoke('route-set-waypoints', waypoints, serials),
  routePlay: (serials: string[], speedMs: number, fromLat?: number, fromLng?: number) =>
    ipcRenderer.invoke('route-play', serials, speedMs, fromLat, fromLng),
  routePause: () => ipcRenderer.invoke('route-pause'),
  routeStop: () => ipcRenderer.invoke('route-stop'),
  routeStopStay: () => ipcRenderer.invoke('route-stop-stay'),
  routeReturnToGps: (realLat: number, realLng: number, speedMs: number) =>
    ipcRenderer.invoke('route-return-to-gps', realLat, realLng, speedMs),
  routeSetLoop: (loop: boolean) => ipcRenderer.invoke('route-set-loop', loop),
  routeGetState: () => ipcRenderer.invoke('route-get-state'),
  routeSetWander: (enabled: boolean, radiusM: number) =>
    ipcRenderer.invoke('route-set-wander', enabled, radiusM),
  routeSetSpeed: (speedMs: number) =>
    ipcRenderer.invoke('route-set-speed', speedMs),

  // GPX
  importGpx: () => ipcRenderer.invoke('import-gpx'),

  // Wi-Fi ADB
  connectWifi: (ip: string, port?: number) => ipcRenderer.invoke('connect-wifi', ip, port),
  enableTcpip: (serial: string) => ipcRenderer.invoke('enable-tcpip', serial),

  // Saved locations
  getSavedLocations: () => ipcRenderer.invoke('locations-get-saved'),
  saveLocation: (name: string, lat: number, lng: number) =>
    ipcRenderer.invoke('locations-save', name, lat, lng),
  deleteLocation: (id: number) => ipcRenderer.invoke('locations-delete', id),
  getLocationHistory: () => ipcRenderer.invoke('locations-get-history'),
  addLocationHistory: (lat: number, lng: number) =>
    ipcRenderer.invoke('locations-add-history', lat, lng),

  // Events
  onDevicesChanged: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on('devices-changed', handler)
    return () => ipcRenderer.removeListener('devices-changed', handler)
  },
  onLocationUpdated: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on('location-updated', handler)
    return () => ipcRenderer.removeListener('location-updated', handler)
  },
  onRouteUpdated: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on('route-updated', handler)
    return () => ipcRenderer.removeListener('route-updated', handler)
  },

  // Session
  getSession: () => ipcRenderer.invoke('get-session'),
  saveSession: (data: Record<string, unknown>) => ipcRenderer.invoke('save-session', data),

  // Logs
  getLogs: () => ipcRenderer.invoke('get-logs'),
  onLogEntry: (callback: (entry: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: unknown): void => callback(entry)
    ipcRenderer.on('log-entry', handler)
    return () => ipcRenderer.removeListener('log-entry', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
