import { AdbService } from './adb.service'
import { broadcast } from './broadcast'
import { applySpeedFluctuation, smoothBearing } from './anti-detect'
import { haversineDistance, bearing, interpolatePoints } from '../utils/coordinates'
import { DEFAULT_ACCURACY, UPDATE_INTERVAL_MS } from '@shared/constants'
import type { RouteWaypoint, LocationUpdate, SpoofMode } from '@shared/types'

const GLIDE_MAX_KM = 0.5  // 500 m — glide to route start if within this distance

export interface RouteState {
  waypoints: RouteWaypoint[]
  totalDistanceKm: number
  currentWaypointIndex: number
  progressFraction: number
  playing: boolean
  loop: boolean
  reverse: boolean
  wandering: boolean
  finishedNaturally: boolean
}

export class RouteEngine {
  private adb: AdbService
  private readonly serial: string
  private state: RouteState = {
    waypoints: [],
    totalDistanceKm: 0,
    currentWaypointIndex: 0,
    progressFraction: 0,
    playing: false,
    loop: false,
    reverse: false,
    wandering: false,
    finishedNaturally: false
  }
  private timer: ReturnType<typeof setInterval> | null = null
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private wanderTimer: ReturnType<typeof setTimeout> | null = null
  private currentLocation: LocationUpdate | null = null
  private targetSerials: string[] = []
  private speedMs = 1.4
  private wanderEnabled = false
  private wanderRadiusM = 100

  constructor(adb: AdbService, serial: string) {
    this.adb = adb
    this.serial = serial
  }

  setWaypoints(waypoints: RouteWaypoint[]): void {
    this.state.waypoints = waypoints
    this.state.totalDistanceKm = this.calcTotalDistance(waypoints)
    this.state.currentWaypointIndex = 0
    this.state.progressFraction = 0
    this.notifyRenderer()
  }

  setWanderEnabled(enabled: boolean, radiusM: number): void {
    this.wanderEnabled = enabled
    this.wanderRadiusM = radiusM
  }

  getState(): RouteState { return { ...this.state } }
  getCurrentLocation(): LocationUpdate | null { return this.currentLocation }

  async play(serials: string[], speedMs: number, fromLat?: number, fromLng?: number): Promise<void> {
    if (this.state.waypoints.length < 2) return
    this.stopWander()
    this.state.finishedNaturally = false
    this.targetSerials = serials
    this.speedMs = speedMs
    this.state.playing = true
    this.stopKeepAlive()

    const firstWp = this.state.waypoints[0]

    // Glide from current position to first waypoint if within threshold
    if (fromLat !== undefined && fromLng !== undefined) {
      const distKm = haversineDistance(fromLat, fromLng, firstWp.lat, firstWp.lng)
      if (distKm > 0.001 && distKm <= GLIDE_MAX_KM) {
        this.currentLocation = {
          lat: fromLat, lng: fromLng, altitude: firstWp.altitude ?? 0,
          accuracy: DEFAULT_ACCURACY, bearing: 0, speed: speedMs, timestamp: Date.now()
        }
        this.notifyRenderer()
        this.startGlideToStart(fromLat, fromLng, firstWp, () => {
          this.startTimer()
          this.notifyRenderer()
        })
        return
      }
    }

    // Start immediately from first waypoint
    if (!this.currentLocation) {
      this.currentLocation = {
        lat: firstWp.lat, lng: firstWp.lng, altitude: firstWp.altitude ?? 0,
        accuracy: DEFAULT_ACCURACY, bearing: 0, speed: speedMs, timestamp: Date.now()
      }
    }
    this.startTimer()
    this.notifyRenderer()
  }

  /** Pause: stop route movement but stay at current position with a keep-alive push. */
  pause(): void {
    this.state.playing = false
    this.stopTimer()
    this.startKeepAlive()
    this.notifyRenderer()
  }

  /** Instant stop — clears state and removes test providers immediately. */
  stop(): void {
    this.stopWander()
    this.state.finishedNaturally = false
    this.state.playing = false
    this.state.currentWaypointIndex = 0
    this.state.progressFraction = 0
    this.stopTimer()
    this.stopKeepAlive()
    const serials = this.targetSerials
    this.currentLocation = null
    this.targetSerials = []
    this.notifyRenderer()
    Promise.all(serials.map((s) => this.adb.removeTestProvider(s))).catch(() => {})
  }

  /**
   * Graceful stop: walk to realLat/realLng at the given speed, then remove test providers.
   * No distance cap — walks at any distance.
   * Fire-and-forget — returns immediately while glide continues in background.
   */
  returnToRealGps(realLat: number, realLng: number, speedMs: number): void {
    this.stopWander()
    this.state.finishedNaturally = false
    const from = this.currentLocation
    this.state.playing = false
    this.state.currentWaypointIndex = 0
    this.state.progressFraction = 0
    this.stopTimer()
    this.stopKeepAlive()

    const cleanup = (): void => {
      const serials = this.targetSerials
      this.currentLocation = null
      this.targetSerials = []
      Promise.all(serials.map((s) => this.adb.removeTestProvider(s))).catch(() => {})
      this.notifyRenderer()
    }

    if (!from) { cleanup(); return }

    const distKm = haversineDistance(from.lat, from.lng, realLat, realLng)
    if (distKm <= 0.001) { cleanup(); return }

    this.speedMs = speedMs
    this.notifyRenderer()
    this.glideBack(from.lat, from.lng, realLat, realLng, cleanup)
  }

  setLoop(loop: boolean): void { this.state.loop = loop }
  setReverse(reverse: boolean): void { this.state.reverse = reverse }
  setSpeed(speedMs: number): void { this.speedMs = speedMs }

  // ─── Private ──────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => this.tick(), UPDATE_INTERVAL_MS)
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAliveTimer = setInterval(async () => {
      if (!this.currentLocation || this.targetSerials.length === 0) return
      const loc: LocationUpdate = { ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() }
      await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
      this.notifyRenderer()
    }, UPDATE_INTERVAL_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private startWander(): void {
    const lastWp = this.state.waypoints[this.state.waypoints.length - 1]
    if (!lastWp) { this.pause(); return }
    this.state.wandering = true
    this.state.playing = false
    this.stopTimer()
    // Keep mock provider alive while waiting between wander glides
    this.startKeepAlive()
    this.notifyRenderer()
    this.scheduleNextWander(lastWp.lat, lastWp.lng)
  }

  private scheduleNextWander(centerLat: number, centerLng: number): void {
    const waitMs = (5 + Math.random() * 20) * 1000
    this.wanderTimer = setTimeout(() => {
      if (!this.state.wandering) return
      const from = this.currentLocation
      if (!from) return
      // Stop keep-alive before gliding (glideBack manages its own interval)
      this.stopKeepAlive()
      const target = this.randomPointInRadius(centerLat, centerLng, this.wanderRadiusM)
      this.glideBack(from.lat, from.lng, target.lat, target.lng, () => {
        if (this.state.wandering) {
          // Restart keep-alive while waiting for next wander point
          this.startKeepAlive()
          this.scheduleNextWander(centerLat, centerLng)
        }
      })
    }, waitMs)
  }

  private stopWander(): void {
    this.state.wandering = false
    if (this.wanderTimer) {
      clearTimeout(this.wanderTimer)
      this.wanderTimer = null
    }
  }

  private randomPointInRadius(lat: number, lng: number, radiusM: number): { lat: number; lng: number } {
    const radiusDeg = radiusM / 111320
    const angle = Math.random() * 2 * Math.PI
    const r = Math.sqrt(Math.random()) * radiusDeg
    return {
      lat: lat + r * Math.cos(angle),
      lng: lng + r * Math.sin(angle) / Math.cos(lat * Math.PI / 180)
    }
  }

  private startGlideToStart(
    fromLat: number, fromLng: number,
    to: RouteWaypoint,
    onDone: () => void
  ): void {
    const distKm = haversineDistance(fromLat, fromLng, to.lat, to.lng)
    const brg = bearing(fromLat, fromLng, to.lat, to.lng)
    const stepKm = (this.speedMs * UPDATE_INTERVAL_MS) / 1_000_000
    let progress = 0

    this.stopTimer()
    this.timer = setInterval(async () => {
      progress = Math.min(1, progress + stepKm / distKm)
      const pos = interpolatePoints(fromLat, fromLng, to.lat, to.lng, progress)
      const loc: LocationUpdate = {
        lat: pos.lat, lng: pos.lng, altitude: to.altitude ?? 0,
        accuracy: DEFAULT_ACCURACY, bearing: brg, speed: this.speedMs, timestamp: Date.now()
      }
      this.currentLocation = loc
      await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
      this.notifyRenderer()

      if (progress >= 1) {
        clearInterval(this.timer!)
        this.timer = null
        onDone()
      }
    }, UPDATE_INTERVAL_MS)
  }

  /** Walk from current position to a target coordinate, then call onDone. */
  private glideBack(
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
    onDone: () => void
  ): void {
    const distKm = haversineDistance(fromLat, fromLng, toLat, toLng)
    if (distKm === 0) { onDone(); return }

    const brg = bearing(fromLat, fromLng, toLat, toLng)
    const stepKm = (this.speedMs * UPDATE_INTERVAL_MS) / 1_000_000
    let progress = 0

    this.timer = setInterval(async () => {
      progress = Math.min(1, progress + stepKm / distKm)
      const pos = interpolatePoints(fromLat, fromLng, toLat, toLng, progress)
      const loc: LocationUpdate = {
        lat: pos.lat, lng: pos.lng, altitude: 0,
        accuracy: DEFAULT_ACCURACY, bearing: brg, speed: this.speedMs, timestamp: Date.now()
      }
      this.currentLocation = loc
      await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
      this.notifyRenderer()

      if (progress >= 1) {
        this.stopTimer()
        onDone()
      }
    }, UPDATE_INTERVAL_MS)
  }

  private async tick(): Promise<void> {
    if (!this.state.playing || !this.currentLocation) return

    const wp = this.state.waypoints
    if (wp.length < 2) return

    const currentSpeed = applySpeedFluctuation(this.speedMs)
    const stepKm = (currentSpeed * UPDATE_INTERVAL_MS) / 1000 / 1000

    const idx = this.state.currentWaypointIndex
    const fromIdx = this.state.reverse ? idx + 1 : idx
    const toIdx = this.state.reverse ? idx : idx + 1

    if (toIdx >= wp.length || fromIdx < 0) {
      if (this.state.loop) {
        this.state.currentWaypointIndex = 0
        this.state.progressFraction = 0
      } else {
        this.state.finishedNaturally = true
        if (this.wanderEnabled) {
          this.startWander()
        } else {
          this.pause()
        }
      }
      return
    }

    const from = wp[fromIdx]
    const to = wp[toIdx]
    const segDistKm = haversineDistance(from.lat, from.lng, to.lat, to.lng)

    if (segDistKm === 0) {
      this.state.currentWaypointIndex += this.state.reverse ? -1 : 1
      return
    }

    this.state.progressFraction += stepKm / segDistKm

    // Clamp to 1 and compute position BEFORE advancing to the next segment.
    // Without clamping, progress resets to 0 first, then interpolate(from, to, 0) = from,
    // causing the position to snap back to the segment's start point.
    const clampedProgress = Math.min(1, this.state.progressFraction)
    const pos = interpolatePoints(from.lat, from.lng, to.lat, to.lng, clampedProgress)
    const brg = bearing(from.lat, from.lng, to.lat, to.lng)
    const smoothedBearing = this.currentLocation
      ? smoothBearing(this.currentLocation.bearing, brg)
      : brg

    const loc: LocationUpdate = {
      lat: pos.lat,
      lng: pos.lng,
      altitude: (from.altitude ?? 0) + ((to.altitude ?? 0) - (from.altitude ?? 0)) * clampedProgress,
      accuracy: DEFAULT_ACCURACY,
      bearing: smoothedBearing,
      speed: currentSpeed,
      timestamp: Date.now()
    }

    this.currentLocation = loc
    await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
    this.notifyRenderer()

    // Advance segment index after pushing location so the position is correct this tick.
    if (this.state.progressFraction >= 1) {
      this.state.progressFraction = 0
      this.state.currentWaypointIndex += this.state.reverse ? -1 : 1
    }
  }

  private calcTotalDistance(waypoints: RouteWaypoint[]): number {
    let total = 0
    for (let i = 0; i < waypoints.length - 1; i++) {
      total += haversineDistance(
        waypoints[i].lat, waypoints[i].lng,
        waypoints[i + 1].lat, waypoints[i + 1].lng
      )
    }
    return total
  }

  private notifyRenderer(): void {
    broadcast('route-updated', {
      serial: this.serial,
      state: this.state,
      location: this.currentLocation
    })
    // Always send location-updated so renderer can reset mode to idle when location clears
    broadcast('location-updated', {
      serial: this.serial,
      location: this.currentLocation,
      mode: (this.currentLocation ? 'route' : 'idle') as SpoofMode
    })
  }

  dispose(): void {
    this.stopTimer()
    this.stopKeepAlive()
    this.stopWander()
  }
}
