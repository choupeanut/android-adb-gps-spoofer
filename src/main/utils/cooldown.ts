import { COOLDOWN_TABLE } from '@shared/constants'
import { haversineDistance } from './coordinates'

export function getCooldownMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 0

  for (let i = 0; i < COOLDOWN_TABLE.length; i++) {
    if (distanceKm <= COOLDOWN_TABLE[i].distanceKm) {
      if (i === 0) {
        return (distanceKm / COOLDOWN_TABLE[0].distanceKm) * COOLDOWN_TABLE[0].waitMinutes
      }
      const prev = COOLDOWN_TABLE[i - 1]
      const curr = COOLDOWN_TABLE[i]
      const ratio = (distanceKm - prev.distanceKm) / (curr.distanceKm - prev.distanceKm)
      return prev.waitMinutes + ratio * (curr.waitMinutes - prev.waitMinutes)
    }
  }

  return COOLDOWN_TABLE[COOLDOWN_TABLE.length - 1].waitMinutes
}

export function getCooldownBetweenPoints(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { distanceKm: number; waitMinutes: number } {
  const distanceKm = haversineDistance(lat1, lng1, lat2, lng2)
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    waitMinutes: Math.round(getCooldownMinutes(distanceKm) * 10) / 10
  }
}
