import type { CooldownEntry } from './types'

export const SPEED_PRESETS = {
  walk: 1.4,
  cycle: 5.14, // 18.5 km/h
  drive: 11.0,
  hsr: 83.3,
  plane: 250.0,
  custom: 1.4
} as const

// GPS update interval - faster prevents jump back to real GPS
// 500ms = 2 updates/sec (aggressive anti-jumping)
export const UPDATE_INTERVAL_MS = 500

export const ADB_POLL_INTERVAL_MS = 3000

export const MOCK_LOCATION_PORT = 7219

export const DEFAULT_ACCURACY = 10

export const COOLDOWN_TABLE: CooldownEntry[] = [
  { distanceKm: 1, waitMinutes: 0.5 },
  { distanceKm: 2, waitMinutes: 1 },
  { distanceKm: 5, waitMinutes: 2 },
  { distanceKm: 10, waitMinutes: 5 },
  { distanceKm: 25, waitMinutes: 10 },
  { distanceKm: 50, waitMinutes: 20 },
  { distanceKm: 100, waitMinutes: 30 },
  { distanceKm: 250, waitMinutes: 45 },
  { distanceKm: 500, waitMinutes: 60 },
  { distanceKm: 750, waitMinutes: 80 },
  { distanceKm: 1000, waitMinutes: 100 },
  { distanceKm: 1500, waitMinutes: 120 }
]
