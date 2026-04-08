/**
 * Standalone LocationEngine — uses standalone broadcast, anti-detect, coordinates.
 * Hardened for WiFi ADB stability: backpressure guard, dual-channel push, micro-jitter.
 */
import { AdbService } from './adb.service'
import { broadcast } from '../broadcast'
import { applySpeedFluctuation } from './anti-detect'
import { haversineDistance, bearing, interpolatePoints } from './coordinates'
import { UPDATE_INTERVAL_MS, DEFAULT_ACCURACY } from '@shared/constants'
import { log } from '../logger'
import type { LocationUpdate, SpoofMode } from '@shared/types'

const GLIDE_MAX_KM = 1.0
const GLIDE_SPEED_MS = 1.4
/** Gaussian-like micro-jitter sigma in degrees (~1.7m at equator) */
const JITTER_SIGMA = 0.000015

/** Apply micro-jitter to prevent Android from detecting a "provider loop" (W7) */
function applyJitter(loc: LocationUpdate): LocationUpdate {
  const jitterLat = (Math.random() + Math.random() + Math.random() - 1.5) * JITTER_SIGMA
  const jitterLng = (Math.random() + Math.random() + Math.random() - 1.5) * JITTER_SIGMA
  return {
    ...loc,
    lat: loc.lat + jitterLat,
    lng: loc.lng + jitterLng,
    accuracy: DEFAULT_ACCURACY + Math.random() * 5
  }
}

export class LocationEngine {
  private adb: AdbService
  private readonly serial: string
  private currentLocation: LocationUpdate | null = null
  private mode: SpoofMode = 'idle'
  private updateTimer: ReturnType<typeof setInterval> | null = null
  private backupTimer: ReturnType<typeof setInterval> | null = null
  private targetSerials: string[] = []
  /** Backpressure guard: skip tick if previous push still in-flight (W2) */
  private pushInFlight = false

  constructor(adb: AdbService, serial: string) { this.adb = adb; this.serial = serial }

  getMode(): SpoofMode { return this.mode }
  getCurrentLocation(): LocationUpdate | null { return this.currentLocation }
  getTargetSerials(): string[] { return [...this.targetSerials] }

  async teleport(serials: string[], lat: number, lng: number): Promise<boolean> {
    this.targetSerials = serials
    this.mode = 'teleport'

    const from = this.currentLocation
    if (from) {
      const distKm = haversineDistance(from.lat, from.lng, lat, lng)
      if (distKm > 0.001 && distKm <= GLIDE_MAX_KM) {
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

    const loc: LocationUpdate = {
      lat, lng, altitude: 0, accuracy: DEFAULT_ACCURACY,
      bearing: 0, speed: 0, timestamp: Date.now()
    }
    this.currentLocation = loc
    log('info', `[Teleport] → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    const results = await Promise.all(serials.map((s) => this.adb.pushLocation(s, loc)))
    // W3: Check per-serial results and warn on failures
    results.forEach((ok, i) => {
      if (!ok) log('warn', `[Teleport] push failed for ${serials[i]}`)
    })
    this.startKeepAlive(serials)
    this.notifyRenderer()
    return results.every((r) => r)
  }

  glideTo(serials: string[], fromLat: number, fromLng: number, toLat: number, toLng: number, onDone: () => void): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.mode = 'teleport'
    const distKm = haversineDistance(fromLat, fromLng, toLat, toLng)
    if (distKm === 0) { onDone(); return }
    const brg = bearing(fromLat, fromLng, toLat, toLng)
    const stepKm = (GLIDE_SPEED_MS * UPDATE_INTERVAL_MS) / 1_000_000
    let progress = 0
    this.currentLocation = { lat: fromLat, lng: fromLng, altitude: 0, accuracy: DEFAULT_ACCURACY, bearing: brg, speed: GLIDE_SPEED_MS, timestamp: Date.now() }
    this.updateTimer = setInterval(async () => {
      progress = Math.min(1, progress + stepKm / distKm)
      const pos = interpolatePoints(fromLat, fromLng, toLat, toLng, progress)
      const loc: LocationUpdate = { lat: pos.lat, lng: pos.lng, altitude: 0, accuracy: DEFAULT_ACCURACY, bearing: brg, speed: GLIDE_SPEED_MS, timestamp: Date.now() }
      this.currentLocation = loc
      await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
      this.notifyRenderer()
      if (progress >= 1) { this.stopContinuousUpdate(); onDone() }
    }, UPDATE_INTERVAL_MS)
  }

  private startKeepAlive(serials: string[]): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.mode = 'teleport'
    this.pushInFlight = false

    // Primary channel: push every 1s with backpressure guard (W2)
    this.updateTimer = setInterval(async () => {
      if (!this.currentLocation || this.mode !== 'teleport') return
      if (this.pushInFlight) return // W2: skip if previous push still pending
      this.pushInFlight = true
      try {
        const loc = applyJitter({ ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() })
        const results = await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
        results.forEach((ok, i) => { if (!ok) log('warn', `[KeepAlive] push failed for ${this.targetSerials[i]}`) })
        this.notifyRenderer()
      } finally {
        this.pushInFlight = false
      }
    }, UPDATE_INTERVAL_MS)

    // Backup channel: independent push every 2.5s as safety net (dual-channel)
    this.backupTimer = setInterval(async () => {
      if (!this.currentLocation || this.mode !== 'teleport') return
      const loc = applyJitter({ ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() })
      // Use Promise.race with timeout so backup never blocks forever
      await Promise.race([
        Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc))),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]).catch(() => {})
    }, 2500)
  }

  startContinuousUpdate(serials: string[]): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.pushInFlight = false
    this.updateTimer = setInterval(async () => {
      if (!this.currentLocation || this.mode !== 'joystick') return
      if (this.pushInFlight) return // W2: backpressure guard
      this.pushInFlight = true
      try {
        const loc: LocationUpdate = { ...this.currentLocation, speed: applySpeedFluctuation(this.currentLocation.speed), timestamp: Date.now() }
        this.currentLocation = loc
        const results = await Promise.all(this.targetSerials.map((s) => this.adb.pushLocation(s, loc)))
        results.forEach((ok, i) => { if (!ok) log('warn', `[Joystick] push failed for ${this.targetSerials[i]}`) })
        this.notifyRenderer()
      } finally {
        this.pushInFlight = false
      }
    }, UPDATE_INTERVAL_MS)
  }

  stopContinuousUpdate(): void {
    if (this.updateTimer) { clearInterval(this.updateTimer); this.updateTimer = null }
    if (this.backupTimer) { clearInterval(this.backupTimer); this.backupTimer = null }
    this.pushInFlight = false
  }

  updatePosition(lat: number, lng: number, brg: number, speed: number): void {
    this.currentLocation = { lat, lng, altitude: this.currentLocation?.altitude ?? 0, accuracy: DEFAULT_ACCURACY, bearing: brg, speed, timestamp: Date.now() }
  }

  setMode(mode: SpoofMode): void {
    this.mode = mode
    if (mode === 'idle') this.stopContinuousUpdate()
    this.notifyRenderer()
  }

  async stop(serials: string[]): Promise<void> {
    this.stopContinuousUpdate()
    this.mode = 'idle'
    // W5: await removeTestProvider to prevent stale providers on restart
    await Promise.all(serials.map((s) => this.adb.removeTestProvider(s))).catch(() => {})
    this.currentLocation = null
    this.targetSerials = []
    this.notifyRenderer()
  }

  startGracefulStop(serials: string[], realLat: number, realLng: number): void {
    const from = this.currentLocation
    if (from) {
      const distKm = haversineDistance(from.lat, from.lng, realLat, realLng)
      if (distKm > 0.001 && distKm <= 1.0) {
        this.glideTo(serials, from.lat, from.lng, realLat, realLng, () => {
          this.stop(serials).catch(() => {})
        })
        return
      }
    }
    this.stop(serials).catch(() => {})
  }

  private notifyRenderer(): void {
    broadcast('location-updated', { serial: this.serial, location: this.currentLocation, mode: this.mode })
  }

  dispose(): void { this.stopContinuousUpdate(); this.pushInFlight = false }
}
