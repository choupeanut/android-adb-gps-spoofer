export interface LocationUpdate {
  lat: number
  lng: number
  altitude: number
  accuracy: number
  bearing: number
  speed: number
  timestamp: number
}

export interface DeviceInfo {
  serial: string
  model: string
  androidVersion: string
  connectionType: 'usb' | 'wifi'
  status: 'connected' | 'unauthorized' | 'offline'
  mockLocationActive: boolean
}

export interface AdbDiagnostics {
  adbPath: string
  adbVersion?: string
  bundledPath?: string
  bundledExists: boolean
  usingBundled: boolean
  usingSystemAdb: boolean
}

export interface AdbConnectResult extends AdbDiagnostics {
  ok: boolean
  message: string
  stdout?: string
  stderr?: string
}

export interface SavedLocation {
  id: number
  name: string
  lat: number
  lng: number
  createdAt: string
}

export interface RouteWaypoint {
  lat: number
  lng: number
  altitude?: number
}

export type SpeedMode = 'walk' | 'cycle' | 'drive' | 'hsr' | 'plane' | 'custom'
export type SpoofMode = 'idle' | 'teleport' | 'joystick' | 'route'

export interface CooldownEntry {
  distanceKm: number
  waitMinutes: number
}
