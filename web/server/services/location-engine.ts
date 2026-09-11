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
import { nextEventRevision } from '@shared/event-revision'

const GRACEFUL_STOP_GLIDE_MAX_KM = 1.0
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
  /** Invalidates async timer callbacks when a mode handoff stops the timers. */
  private generation = 0
  private deliveries = new Map<string, Set<Promise<boolean>>>()
  /** Backpressure guard: skip tick if previous push still in-flight (W2) */
  private pushInFlight = false

  constructor(adb: AdbService, serial: string) { this.adb = adb; this.serial = serial }

  getMode(): SpoofMode { return this.mode }
  getCurrentLocation(): LocationUpdate | null { return this.currentLocation }
  getTargetSerials(): string[] { return [...this.targetSerials] }

  async waitForDelivery(serial: string): Promise<void> {
    await Promise.all(this.deliveries.get(serial) ?? [])
  }

  private pushToTarget(serial: string, loc: LocationUpdate): Promise<boolean> {
    const pending = this.deliveries.get(serial) ?? new Set<Promise<boolean>>()
    // A slow device must not stall peer updates or queue stale positions.
    if (pending.size > 0) return Promise.resolve(false)
    this.deliveries.set(serial, pending)
    const task = this.adb.pushLocation(serial, loc).catch(() => false)
    pending.add(task)
    void task.finally(() => {
      pending.delete(task)
      if (pending.size === 0) this.deliveries.delete(serial)
    })
    return task
  }

  async teleport(serials: string[], lat: number, lng: number): Promise<boolean> {
    this.stopContinuousUpdate()
    const generation = this.generation
    this.targetSerials = serials
    this.mode = 'teleport'

    // Teleport is intentionally immediate. Gradual movement is reserved for
    // graceful stop and route transitions where the caller asks for it.
    const loc: LocationUpdate = {
      lat, lng, altitude: 0, accuracy: DEFAULT_ACCURACY,
      bearing: 0, speed: 0, timestamp: Date.now()
    }
    this.currentLocation = loc
    log('info', `[Teleport] → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    await Promise.all(serials.map((s) => this.waitForDelivery(s)))
    if (generation !== this.generation) return false
    const results = await Promise.all(serials.map((s) => this.pushToTarget(s, loc)))
    // W3: Check per-serial results and warn on failures
    results.forEach((ok, i) => {
      if (!ok) log('warn', `[Teleport] push failed for ${serials[i]}`)
    })
    if (generation !== this.generation) return results.every((r) => r)
    this.startKeepAlive(serials)
    this.notifyRenderer()
    return results.every((r) => r)
  }

  glideTo(serials: string[], fromLat: number, fromLng: number, toLat: number, toLng: number, onDone: () => void): void {
    this.stopContinuousUpdate()
    const generation = this.generation
    this.targetSerials = serials
    this.mode = 'teleport'
    const distKm = haversineDistance(fromLat, fromLng, toLat, toLng)
    if (distKm === 0) { onDone(); return }
    const brg = bearing(fromLat, fromLng, toLat, toLng)
    const stepKm = (GLIDE_SPEED_MS * UPDATE_INTERVAL_MS) / 1_000_000
    let progress = 0
    this.currentLocation = { lat: fromLat, lng: fromLng, altitude: 0, accuracy: DEFAULT_ACCURACY, bearing: brg, speed: GLIDE_SPEED_MS, timestamp: Date.now() }
    this.updateTimer = setInterval(async () => {
      if (generation !== this.generation) return
      progress = Math.min(1, progress + stepKm / distKm)
      const pos = interpolatePoints(fromLat, fromLng, toLat, toLng, progress)
      const loc: LocationUpdate = { lat: pos.lat, lng: pos.lng, altitude: 0, accuracy: DEFAULT_ACCURACY, bearing: brg, speed: GLIDE_SPEED_MS, timestamp: Date.now() }
      this.currentLocation = loc
      const targets = [...this.targetSerials]
      await Promise.all(targets.map((s) => this.pushToTarget(s, loc)))
      if (generation !== this.generation) return
      this.notifyRenderer()
      if (progress >= 1) {
        const completed = generation === this.generation
        this.stopContinuousUpdate()
        if (completed) onDone()
      }
    }, UPDATE_INTERVAL_MS)
  }

  private startKeepAlive(serials: string[]): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.mode = 'teleport'
    this.pushInFlight = false
    const generation = this.generation

    // Primary channel: push every 1s with backpressure guard (W2)
    this.updateTimer = setInterval(async () => {
      if (generation !== this.generation) return
      if (!this.currentLocation || this.mode !== 'teleport') return
      if (this.pushInFlight) return // W2: skip if previous push still pending
      this.pushInFlight = true
      try {
        const loc = applyJitter({ ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() })
        const targets = [...this.targetSerials]
        const results = await Promise.all(targets.map((s) => this.pushToTarget(s, loc)))
        results.forEach((ok, i) => { if (!ok) log('warn', `[KeepAlive] push failed for ${targets[i]}`) })
        if (generation !== this.generation || this.mode !== 'teleport') return
        this.notifyRenderer()
      } finally {
        this.pushInFlight = false
      }
    }, UPDATE_INTERVAL_MS)

    // Backup channel: independent push every 1s as safety net (was 2.5s, dual-channel)
    this.backupTimer = setInterval(async () => {
      if (generation !== this.generation) return
      if (!this.currentLocation || this.mode !== 'teleport') return
      const loc = applyJitter({ ...this.currentLocation, speed: 0, bearing: 0, timestamp: Date.now() })
      const targets = [...this.targetSerials]
      // Use Promise.race with timeout so backup never blocks forever
      await Promise.race([
        Promise.all(targets.map((s) => this.pushToTarget(s, loc))),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]).catch(() => {})
    }, 1000)
  }

  startContinuousUpdate(serials: string[]): void {
    this.stopContinuousUpdate()
    this.targetSerials = serials
    this.pushInFlight = false
    const generation = this.generation
    this.updateTimer = setInterval(async () => {
      if (generation !== this.generation) return
      if (!this.currentLocation || this.mode !== 'joystick') return
      if (this.pushInFlight) return // W2: backpressure guard
      this.pushInFlight = true
      try {
        const loc: LocationUpdate = { ...this.currentLocation, speed: applySpeedFluctuation(this.currentLocation.speed), timestamp: Date.now() }
        this.currentLocation = loc
        const targets = [...this.targetSerials]
        const results = await Promise.all(targets.map((s) => this.pushToTarget(s, loc)))
        results.forEach((ok, i) => { if (!ok) log('warn', `[Joystick] push failed for ${targets[i]}`) })
        if (generation !== this.generation || this.mode !== 'joystick') return
        this.notifyRenderer()
      } finally {
        this.pushInFlight = false
      }
    }, UPDATE_INTERVAL_MS)
  }

  stopContinuousUpdate(): void {
    this.generation += 1
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
    const generation = this.generation
    this.mode = 'idle'
    // W5: await removeTestProvider to prevent stale providers on restart
    await Promise.all(serials.map((s) => this.adb.removeTestProvider(s))).catch(() => {})
    await Promise.all(serials.map((s) => this.adb.maybeRestoreMasterLocation(s))).catch(() => {})
    if (generation !== this.generation) return
    this.currentLocation = null
    this.targetSerials = []
    this.notifyRenderer()
  }

  startGracefulStop(serials: string[], realLat: number, realLng: number): void {
    const from = this.currentLocation
    if (from) {
      const distKm = haversineDistance(from.lat, from.lng, realLat, realLng)
      if (distKm > 0.001 && distKm <= GRACEFUL_STOP_GLIDE_MAX_KM) {
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
      revision: nextEventRevision(),
      location: this.currentLocation,
      mode: this.mode
    })
  }

  dispose(): void { this.stopContinuousUpdate(); this.pushInFlight = false }
}
