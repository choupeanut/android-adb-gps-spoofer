import { isValidCoordinates } from './coordinate-validation'
import type { LocationUpdate, RouteWaypoint } from './types'

export const MAX_ROUTE_POINTS = 2500
export const MAX_CONTROL_POINTS = 100

export function assertNumber(value: unknown, label: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}`)
  }
}

export function assertCoordinates(lat: unknown, lng: unknown): void {
  if (!isValidCoordinates(lat as number, lng as number)) throw new Error('Invalid coordinates')
}

export function assertSerial(serial: unknown): asserts serial is string {
  if (typeof serial !== 'string' || serial.length > 256 || !/^[A-Za-z0-9_.:\[\]-]+$/.test(serial)) {
    throw new Error('Invalid device serial')
  }
}

export function assertSerials(serials: unknown): asserts serials is string[] {
  if (!Array.isArray(serials) || serials.length > 100) throw new Error('Invalid device serials')
  serials.forEach(assertSerial)
}

export function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid boolean')
}

export function assertWaypoints(value: unknown, max = MAX_ROUTE_POINTS): asserts value is RouteWaypoint[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid route points')
  for (const point of value) {
    if (!point || typeof point !== 'object') throw new Error('Invalid route point')
    assertCoordinates(point.lat, point.lng)
    if (point.altitude !== undefined) assertNumber(point.altitude, 'altitude')
  }
}

export function assertLocationUpdate(serial: unknown, loc: LocationUpdate): void {
  assertSerial(serial)
  if (!loc || typeof loc !== 'object') throw new Error('Invalid location update')
  assertCoordinates(loc.lat, loc.lng)
  assertNumber(loc.altitude, 'altitude')
  assertNumber(loc.accuracy, 'accuracy', 0)
  assertNumber(loc.bearing, 'bearing')
  assertNumber(loc.speed, 'speed', 0)
  assertNumber(loc.timestamp, 'timestamp', 0, Number.MAX_SAFE_INTEGER)
}
