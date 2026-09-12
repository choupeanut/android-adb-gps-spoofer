import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { assertCoordinates, assertNumber, MAX_ROUTE_POINTS } from './runtime-validation'
import type { RouteWaypoint } from './types'

export const MAX_GPX_BYTES = 5 * 1024 * 1024

/** Uniform endpoint-preserving sampling, including the exact last point. */
export function sampleRoute<T>(points: T[], max = MAX_ROUTE_POINTS): T[] {
  if (points.length <= max) return points
  return Array.from({ length: max }, (_, index) => points[Math.round(index * (points.length - 1) / (max - 1))])
}

export function parseGpx(content: unknown): RouteWaypoint[] {
  if (typeof content !== 'string' || new TextEncoder().encode(content).byteLength > MAX_GPX_BYTES) {
    throw new Error('GPX must be text no larger than 5 MiB')
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(content) || XMLValidator.validate(content) !== true) {
    throw new Error('Invalid GPX XML')
  }
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false }).parse(content)
  const gpx = parsed?.gpx
  if (!gpx) return []
  const array = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value]
  const points: any[] = []
  for (const track of array(gpx.trk)) {
    for (const segment of array(track?.trkseg)) { for (const point of array(segment?.trkpt)) points.push(point) }
  }
  for (const route of array(gpx.rte)) { for (const point of array(route?.rtept)) points.push(point) }
  if (!points.length) { for (const point of array(gpx.wpt)) points.push(point) }
  const numeric = (value: unknown): number => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) {
      throw new Error('Invalid GPX numeric value')
    }
    const number = Number(value)
    assertNumber(number, 'GPX numeric value')
    return number
  }
  const validated = points.map((point): RouteWaypoint => {
    const lat = numeric(point?.['@_lat'])
    const lng = numeric(point?.['@_lon'])
    assertCoordinates(lat, lng)
    return { lat, lng, altitude: point.ele == null ? 0 : numeric(point.ele) }
  })
  return sampleRoute(validated)
}
