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
  lastUsedAt: string
}

export type SavedLocationMutationErrorCode = 'invalid-id' | 'invalid-name' | 'not-found'

export type SavedLocationMutationResult =
  | { ok: true; location: SavedLocation }
  | { ok: false; code: SavedLocationMutationErrorCode; message: string }

export type GoogleMapsLinkErrorCode =
  | 'unsupported-url'
  | 'no-coordinates'
  | 'invalid-coordinates'
  | 'redirect-rejected'
  | 'too-many-redirects'
  | 'timeout'
  | 'network-error'

export type GoogleMapsLinkResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; code: GoogleMapsLinkErrorCode; message: string }

export interface WifiIpHistoryEntry {
  ip: string
  port: number
  useCount: number
  lastUsedAt: string
}

export interface TileProviderConfig {
  id: string
  label: string
  url: string
  attribution: string
  maxZoom?: number
  subdomains?: string
}

export interface RouteWaypoint {
  lat: number
  lng: number
  altitude?: number
}

export type RouteMode = 'manual' | 'road-network'
export type RouteProfile = 'walk' | 'cycle' | 'drive'
export type RoutePlanStatus = 'idle' | 'planning' | 'success' | 'error'

export interface RoutePlanRoadRequest {
  controlPoints: RouteWaypoint[]
  profile: RouteProfile
  loop: boolean
}

export interface RoutePlanLegSummary {
  fromIndex: number
  toIndex: number
  distanceKm: number
  durationSec: number
  connectorStartKm: number
  connectorEndKm: number
  snappedStart: {
    lat: number
    lng: number
  }
  snappedEnd: {
    lat: number
    lng: number
  }
}

export interface RoutePlanRoadResponse {
  plannedWaypoints: RouteWaypoint[]
  totalDistanceKm: number
  totalDurationSec: number
  legSummaries: RoutePlanLegSummary[]
  warnings: string[]
}

export type SpeedMode = 'walk' | 'cycle' | 'drive' | 'hsr' | 'plane' | 'custom'
export type SpoofMode = 'idle' | 'teleport' | 'joystick' | 'route'

export interface CooldownEntry {
  distanceKm: number
  waitMinutes: number
}
