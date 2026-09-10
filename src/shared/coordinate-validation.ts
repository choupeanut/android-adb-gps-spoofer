const COMPLETE_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

export function isValidCoordinates(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng)
}

export function parseCoordinateInput(value: string): number | null {
  const trimmed = value.trim()
  if (!COMPLETE_NUMBER.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** A pasted pair always uses latitude, longitude order, regardless of the field. */
export function parseCoordinatePair(value: string): { lat: number; lng: number } | null {
  const trimmed = value.trim()
  const parts = trimmed.includes(',') ? trimmed.split(',') : trimmed.split(/\s+/)
  if (parts.length !== 2) return null
  const lat = parseCoordinateInput(parts[0])
  const lng = parseCoordinateInput(parts[1])
  if (lat === null || lng === null || !isValidCoordinates(lat, lng)) return null
  return { lat, lng }
}
