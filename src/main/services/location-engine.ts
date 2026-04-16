import { AdbService } from './adb.service'
import { broadcast } from './broadcast'
import { applySpeedFluctuation, applyJitter } from './anti-detect'
import { haversineDistance, bearing, interpolatePoints } from '../utils/coordinates'
import { UPDATE_INTERVAL_MS, DEFAULT_ACCURACY } from '@shared/constants'
import { log } from '../logger'
import type { LocationUpdate, SpoofMode } from '@shared/types'

const GLIDE_MAX_KM = 1.0    // 1 km — beyond this, instant teleport
const GLIDE_SPEED_MS = 1.4  // walk speed for teleport glide

export class LocationEngine {
  private adb: AdbService
  private readonly serial: string
  private currentLocation: LocationUpdate | null = null
  private mode: SpoofMode = 'idle'
  private updateTimer: ReturnType<typeof setInterval> | null = null
  private backupTimer: ReturnType<typeof setInterval> | null = null
  private targetSerials: string[] = []
  /** Backpressure guard: skip tick if previous push still in-flight */
  private pushInFlight = false

  constructor(adb: AdbService, serial: string) {
    this.adb = adb
    this.serial = serial
  }

  getMode(): SpoofMode { return this.mode }
  getCurrentLocation(): LocationUpdate | null { return this.currentLocation }

  // ─── Teleport ─────────────────────────────────────────────────────────────

  async teleport(serials: string[], lat: number, lng: number): Promise<boolean> {
    this.targetSerials = serials
    this.mode = 'teleport'

    const from = this.currentLocation
    if (from) {
      const distKm = haversineDistance(from.lat, from.lng, lat, lng)
      if (distKm > 0.001 && distKm <= GLIDE_MAX_KM) {
        log('info', `[Teleport] gliding ${(distKm * 1000).toFixed(0)}m → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        this.notifyRenderer()
        this.glideTo(serials, from.lat, from.lng, lat, lng, () => {
          this.currentLocation = {
            lat, lng, altitude: 0, accuracy: DEFAULT_ACCURACY,
            bearing: 0, speed: 0, timestamp: Date.now()
          }
          this.startKeepAlive(serials)
        })
        return true
      }
    }

    // Instant teleport
    const loc: LocationUpdate = {
      lat, lng, altitude: 0, accuracy: DEFAULT_ACCURACY,
      bearing: 0, speed: 0, timestamp: Date.now()
    }
    this.currentLocation = loc

    log('info', `[Teleport] → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    const results = await Promise.all(serials.map((s) => this.adb.pushLocation(s, loc)))
    const success = results.every((r) => r)
    log(success ? 'ok' : 'error', `[Teleport] pushLocation ${success ? 'OK' : 'FAILED'}`)

    this.startKeepAlive(serials)
    this.notifyRenderer()
    return success
  }

  // ─── Glide ────────────────────────────────────────────────────────────────

  glideTo(
    serials: string[],
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
    onDone: () => void
  ): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.mode = 'teleport'

    const distKm = haversineDistance(fromLat, fromLng, toLat, toLng)
    if (distKm === 0) { onDone(); return }

    const brg = bearing(fromLat, fromLng, toLat, toLng)
    const stepKm = (GLIDE_SPEED_MS * UPDATE_INTERVAL_MS) / 1_000_000
    let progress = 0

    this.currentLocation = {
      lat: fromLat, lng: fromLng, altitude: 0,
      accuracy: DEFAULT_ACCURACY, bearing: brg, speed: GLIDE_SPEED_MS, timestamp: Date.now()
    }

    this.updateTimer = setInterval(async () => {
      progress = Math.min(1, progress + stepKm / distKm)

      const pos = interpolatePoints(fromLat, fromLng, toLat, toLng, progress)
      const loc: LocationUpdate = {
        lat: pos.lat, lng: pos.lng, altitude: 0,
        accuracy: DEFAULT_ACCURACY, bearing: brg, speed: GLIDE_SPEED_MS, timestamp: Date.now()
      }
      this.currentLocation = loc
      await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
      this.notifyRenderer()

      if (progress >= 1) {
        this.stopContinuousUpdate()
        onDone()
      }
    }, UPDATE_INTERVAL_MS)
  }

  // ─── Keep-alive (Teleport hold) ───────────────────────────────────────────

  private startKeepAlive(serials: string[]): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.mode = 'teleport'
    this.pushInFlight = false

    // Primary channel: push every 1s with backpressure guard
    this.updateTimer = setInterval(async () => {
      if (!this.currentLocation || this.targetSerials.length === 0) return
      if (this.mode !== 'teleport') return
      if (this.pushInFlight) return // skip if previous push still pending
      this.pushInFlight = true
      try {
        const loc = applyJitter({ ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() })
        await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
        this.notifyRenderer()
      } finally {
        this.pushInFlight = false
      }
    }, UPDATE_INTERVAL_MS)

    // Backup channel: independent push every 1s as safety net (was 2.5s)
    this.backupTimer = setInterval(async () => {
      if (!this.currentLocation || this.mode !== 'teleport') return
      const loc = applyJitter({ ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() })
      await Promise.race([
        Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc))),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]).catch(() => {})
    }, 1000)

    log('info', `[Teleport] keep-alive started for [${serials.join(', ')}]`)
  }

  // ─── Joystick ─────────────────────────────────────────────────────────────

  startContinuousUpdate(serials: string[]): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.pushInFlight = false
    log('info', `[Joystick] continuous update started for [${serials.join(', ')}]`)

    this.updateTimer = setInterval(async () => {
      if (!this.currentLocation || this.targetSerials.length === 0) return
      if (this.mode !== 'joystick') return
      if (this.pushInFlight) return // backpressure guard
      this.pushInFlight = true
      try {
        const loc: LocationUpdate = {
          ...this.currentLocation,
          speed: applySpeedFluctuation(this.currentLocation.speed),
          timestamp: Date.now()
        }
        this.currentLocation = loc
        await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
        this.notifyRenderer()
      } finally {
        this.pushInFlight = false
      }
    }, UPDATE_INTERVAL_MS)
  }

  stopContinuousUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
    }
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
      this.backupTimer = null
    }
    this.pushInFlight = false
  }

  updatePosition(lat: number, lng: number, brg: number, speed: number): void {
    this.currentLocation = {
      lat, lng,
      altitude: this.currentLocation?.altitude ?? 0,
      accuracy: DEFAULT_ACCURACY,
      bearing: brg,
      speed,
      timestamp: Date.now()
    }
  }

  setMode(mode: SpoofMode): void {
    if (this.mode !== mode) {
      log('info', `[Mode] ${this.mode} → ${mode}`)
    }
    this.mode = mode
    if (mode === 'idle') {
      this.stopContinuousUpdate()
    }
    this.notifyRenderer()
  }

  async stop(serials: string[]): Promise<void> {
    this.stopContinuousUpdate()
    this.mode = 'idle'
    log('info', `[Stop] removing test providers from [${serials.join(', ')}]`)
    await Promise.all(serials.map((s) => this.adb.removeTestProvider(s)))
    await Promise.all(serials.map((s) => this.adb.maybeRestoreMasterLocation(s)))
    this.currentLocation = null
    this.targetSerials = []
    this.notifyRenderer()
  }

  /**
   * Fire-and-forget graceful stop:
   * if real GPS is within 200 m of current mock position → walk there first,
   * then remove the test provider. Beyond 200 m → instant stop.
   */
  startGracefulStop(serials: string[], realLat: number, realLng: number): void {
    const from = this.currentLocation
    if (from) {
      const distKm = haversineDistance(from.lat, from.lng, realLat, realLng)
      if (distKm > 0.001 && distKm <= 1.0) {
        log('info', `[StopGraceful] walking ${(distKm * 1000).toFixed(0)} m back to real GPS`)
        this.glideTo(serials, from.lat, from.lng, realLat, realLng, () => {
          this.stop(serials).catch(() => {})
        })
        return
      }
    }
    this.stop(serials).catch(() => {})
  }

  private notifyRenderer(): void {
    broadcast('location-updated', {
      serial: this.serial,
      location: this.currentLocation,
      mode: this.mode
    })
  }

  dispose(): void {
    this.stopContinuousUpdate()
    this.pushInFlight = false
  }
}
