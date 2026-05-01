import type { LocationUpdate } from '../../shared/types'

const JITTER_SIGMA = 0.00009 // ~10 m at equator
const SPEED_FLUCTUATION_RATIO = 0.05 // ±5%

function gaussianRandom(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function applyJitter(loc: LocationUpdate): LocationUpdate {
  return {
    ...loc,
    lat: loc.lat + gaussianRandom() * JITTER_SIGMA,
    lng: loc.lng + gaussianRandom() * JITTER_SIGMA,
    accuracy: Math.max(3, Math.min(25, loc.accuracy + (Math.random() - 0.5) * 10)),
  }
}

export function applySpeedFluctuation(baseSpeed: number): number {
  if (baseSpeed === 0) return 0
  const fluctuation = 1 + (Math.random() * 2 - 1) * SPEED_FLUCTUATION_RATIO
  return Math.max(0.1, baseSpeed * fluctuation)
}

export function smoothBearing(current: number, target: number, factor = 0.3): number {
  let diff = target - current
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  let result = current + diff * factor
  if (result < 0) result += 360
  if (result >= 360) result -= 360
  return result
}
