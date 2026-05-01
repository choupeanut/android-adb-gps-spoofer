import { haversineDistance } from '../utils/coordinates'
import type {
  RoutePlanLegSummary,
  RoutePlanRoadRequest,
  RoutePlanRoadResponse,
  RouteProfile,
  RouteWaypoint
} from '@shared/types'

const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org'
const ROUTE_TIMEOUT_MS = 8000
const MAX_PLANNED_POINTS = 2500
const CONNECTOR_STEP_M = 25
const CONNECTOR_WARN_KM = 0.1

const OSRM_PROFILE_MAP: Record<RouteProfile, string> = {
  walk: 'walking',
  cycle: 'cycling',
  drive: 'driving'
}

const PROFILE_SPEED_MS: Record<RouteProfile, number> = {
  walk: 1.4,
  cycle: 4.8,
  drive: 13.8
}

type FetchJsonResponse = {
  ok: boolean
  status: number
  json: () => Promise<any>
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<FetchJsonResponse>

interface PlannedLeg {
  waypoints: RouteWaypoint[]
  summary: RoutePlanLegSummary
}

export class RoutePlannerService {
  constructor(
    private readonly baseUrl = DEFAULT_OSRM_BASE_URL,
    private readonly fetchImpl: FetchLike = defaultFetch
  ) {}

  async planRoadNetwork(request: RoutePlanRoadRequest): Promise<RoutePlanRoadResponse> {
    if (!Array.isArray(request.controlPoints) || request.controlPoints.length < 2) {
      throw new Error('Road-network mode requires at least 2 control points')
    }

    const legs = buildLegPairs(request.controlPoints.length, request.loop)
    const warnings: string[] = []
    const summaries: RoutePlanLegSummary[] = []
    const mergedWaypoints: RouteWaypoint[] = []

    let totalDistanceKm = 0
    let totalDurationSec = 0

    for (const [fromIndex, toIndex] of legs) {
      const from = request.controlPoints[fromIndex]
      const to = request.controlPoints[toIndex]
      const plannedLeg = await this.planLeg(from, to, fromIndex, toIndex, request.profile)
      summaries.push(plannedLeg.summary)

      totalDistanceKm += plannedLeg.summary.distanceKm
      totalDurationSec += plannedLeg.summary.durationSec

      if (plannedLeg.summary.connectorStartKm >= CONNECTOR_WARN_KM) {
        warnings.push(
          `Control point #${fromIndex + 1} is ${plannedLeg.summary.connectorStartKm.toFixed(2)} km away from nearest routed road segment`
        )
      }
      if (plannedLeg.summary.connectorEndKm >= CONNECTOR_WARN_KM) {
        warnings.push(
          `Control point #${toIndex + 1} is ${plannedLeg.summary.connectorEndKm.toFixed(2)} km away from nearest routed road segment`
        )
      }

      appendUnique(mergedWaypoints, from)
      for (const waypoint of plannedLeg.waypoints) {
        appendUnique(mergedWaypoints, waypoint)
      }
      appendUnique(mergedWaypoints, to)
    }

    const plannedWaypoints = downsample(mergedWaypoints, MAX_PLANNED_POINTS)
    if (plannedWaypoints.length < 2) {
      throw new Error('Road-network planner returned an empty route')
    }

    return {
      plannedWaypoints,
      totalDistanceKm,
      totalDurationSec,
      legSummaries: summaries,
      warnings
    }
  }

  private async planLeg(
    from: RouteWaypoint,
    to: RouteWaypoint,
    fromIndex: number,
    toIndex: number,
    profile: RouteProfile
  ): Promise<PlannedLeg> {
    const osrmProfile = OSRM_PROFILE_MAP[profile]
    const url = `${this.baseUrl}/route/v1/${osrmProfile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false&annotations=false`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)

    let body: any
    let status = 0
    try {
      const res = await this.fetchImpl(url, { signal: controller.signal })
      status = res.status
      body = await res.json()
      if (!res.ok) {
        throw new Error(body?.message || `Routing API error (${res.status})`)
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('Routing API timeout')
      }
      if (status === 429) {
        throw new Error('Routing API rate-limited (429)')
      }
      throw new Error(`Route planning failed: ${error?.message || 'unknown error'}`)
    } finally {
      clearTimeout(timeout)
    }

    if (body?.code !== 'Ok' || !Array.isArray(body?.routes) || body.routes.length === 0) {
      throw new Error(`No route found between control points #${fromIndex + 1} and #${toIndex + 1}`)
    }

    const route = body.routes[0]
    const coordinates = route?.geometry?.coordinates as Array<[number, number]> | undefined
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error(`Invalid route geometry between control points #${fromIndex + 1} and #${toIndex + 1}`)
    }

    const snappedStart: RouteWaypoint = { lat: coordinates[0][1], lng: coordinates[0][0] }
    const snappedEnd: RouteWaypoint = {
      lat: coordinates[coordinates.length - 1][1],
      lng: coordinates[coordinates.length - 1][0]
    }

    const connectorStart = buildConnector(from, snappedStart)
    const connectorEnd = buildConnector(snappedEnd, to)

    const legWaypoints: RouteWaypoint[] = []

    for (const point of connectorStart.slice(1)) {
      appendUnique(legWaypoints, point)
    }

    for (const coordinate of coordinates) {
      appendUnique(legWaypoints, { lat: coordinate[1], lng: coordinate[0] })
    }

    for (const point of connectorEnd.slice(1)) {
      appendUnique(legWaypoints, point)
    }

    const connectorStartKm = haversineDistance(from.lat, from.lng, snappedStart.lat, snappedStart.lng)
    const connectorEndKm = haversineDistance(snappedEnd.lat, snappedEnd.lng, to.lat, to.lng)
    const connectorDistanceKm = connectorStartKm + connectorEndKm
    const connectorDurationSec = (connectorDistanceKm * 1000) / PROFILE_SPEED_MS[profile]

    const summary: RoutePlanLegSummary = {
      fromIndex,
      toIndex,
      distanceKm: (route.distance ?? 0) / 1000 + connectorDistanceKm,
      durationSec: (route.duration ?? 0) + connectorDurationSec,
      connectorStartKm,
      connectorEndKm,
      snappedStart: { lat: snappedStart.lat, lng: snappedStart.lng },
      snappedEnd: { lat: snappedEnd.lat, lng: snappedEnd.lng }
    }

    return {
      waypoints: legWaypoints,
      summary
    }
  }
}

function buildLegPairs(totalPoints: number, loop: boolean): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < totalPoints - 1; i++) {
    pairs.push([i, i + 1])
  }
  if (loop && totalPoints > 1) {
    pairs.push([totalPoints - 1, 0])
  }
  return pairs
}

function buildConnector(from: RouteWaypoint, to: RouteWaypoint): RouteWaypoint[] {
  const distanceKm = haversineDistance(from.lat, from.lng, to.lat, to.lng)
  const distanceM = distanceKm * 1000
  if (distanceM <= 1) {
    return [from, to]
  }

  const steps = Math.max(1, Math.ceil(distanceM / CONNECTOR_STEP_M))
  const points: RouteWaypoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t
    })
  }
  return points
}

function downsample(points: RouteWaypoint[], maxPoints: number): RouteWaypoint[] {
  if (points.length <= maxPoints) return points

  const step = Math.ceil(points.length / maxPoints)
  const sampled = points.filter((_, i) => i % step === 0)
  const last = points[points.length - 1]
  if (!isSamePoint(sampled[sampled.length - 1], last)) {
    sampled.push(last)
  }
  return sampled
}

function appendUnique(target: RouteWaypoint[], point: RouteWaypoint): void {
  if (target.length === 0 || !isSamePoint(target[target.length - 1], point)) {
    target.push(point)
  }
}

function isSamePoint(a: RouteWaypoint | undefined, b: RouteWaypoint | undefined): boolean {
  if (!a || !b) return false
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7
}

const defaultFetch: FetchLike = async (url, init) => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available')
  }
  return fetch(url, init)
}
