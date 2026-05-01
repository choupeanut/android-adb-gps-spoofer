/**
 * Standalone anti-detect — pure math, no Electron dependencies.
 * Copied from src/main/services/anti-detect.ts
 */

const SPEED_FLUCTUATION_RATIO = 0.05 // ±5%

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
