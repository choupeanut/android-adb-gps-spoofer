import { assertBoolean, assertCoordinates, assertNumber, assertWaypoints, MAX_CONTROL_POINTS } from '../../../src/shared/runtime-validation'
import { sampleRoute } from '../../../src/shared/gpx'
import { haversineDistance } from './coordinates'
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
const MAX_GEOMETRY_POINTS = 100_000
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
    if (!request || !Array.isArray(request.controlPoints) || request.controlPoints.length < 2) {
      throw new Error('Road-network mode requires at least 2 control points')
    }
    assertWaypoints(request.controlPoints, MAX_CONTROL_POINTS)
    assertBoolean(request.loop)
    if (!['walk', 'cycle', 'drive'].includes(request.profile)) throw new Error('Invalid route profile')
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error('Routing API timeout'))
      }, ROUTE_TIMEOUT_MS)
    })
    try {
      return await Promise.race([this.planValidated(request, controller.signal), deadline])
    } finally {
      clearTimeout(timeout)
      controller.abort()
    }
  }

  private async planValidated(request: RoutePlanRoadRequest, signal: AbortSignal): Promise<RoutePlanRoadResponse> {
    const legs = buildLegPairs(request.controlPoints.length, request.loop)
    const warnings: string[] = []
    const summaries: RoutePlanLegSummary[] = []
    const mergedWaypoints: RouteWaypoint[] = []

    let totalDistanceKm = 0
    let totalDurationSec = 0

    for (const [fromIndex, toIndex] of legs) {
      if (signal.aborted) throw new Error('Routing API timeout')
      const from = request.controlPoints[fromIndex]
      const to = request.controlPoints[toIndex]
      const plannedLeg = await this.planLeg(from, to, fromIndex, toIndex, request.profile, signal)
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

    assertNumber(totalDistanceKm, 'total route distance', 0)
    assertNumber(totalDurationSec, 'total route duration', 0)
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
    profile: RouteProfile,
    signal: AbortSignal
  ): Promise<PlannedLeg> {
    const osrmProfile = OSRM_PROFILE_MAP[profile]
    const url = `${this.baseUrl}/route/v1/${osrmProfile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false&annotations=false`

    let body: any
    let status = 0
    try {
      const res = await this.fetchImpl(url, { signal })
      status = res.status
      body = await res.json()
      if (signal.aborted) throw new Error('Routing API timeout')
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
    }

    if (body?.code !== 'Ok' || !Array.isArray(body?.routes) || body.routes.length === 0) {
      throw new Error(`No route found between control points #${fromIndex + 1} and #${toIndex + 1}`)
    }

    const route = body.routes[0]
    const coordinates = route?.geometry?.coordinates as Array<[number, number]> | undefined
    if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > MAX_GEOMETRY_POINTS) {
      throw new Error(`Invalid route geometry between control points #${fromIndex + 1} and #${toIndex + 1}`)
    }

    for (const coordinate of coordinates) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error('Invalid route geometry')
      assertCoordinates(coordinate[1], coordinate[0])
    }
    if (route.distance != null) assertNumber(route.distance, 'route distance', 0)
    if (route.duration != null) assertNumber(route.duration, 'route duration', 0)

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

    for (const coordinate of sampleRoute(coordinates)) {
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

  const steps = Math.min(MAX_PLANNED_POINTS - 1, Math.max(1, Math.ceil(distanceM / CONNECTOR_STEP_M)))
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
  return sampleRoute(points, maxPoints)
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
