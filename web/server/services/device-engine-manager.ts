/**
 * Standalone DeviceEngineManager — manages per-device LocationEngine + RouteEngine pairs.
 * W1 fix: tracks engine state snapshots for auto-restore after WiFi reconnection.
 */
import { AdbService } from './adb.service'
import { LocationEngine } from './location-engine'
import { RouteEngine } from './route-engine'
import { log } from '../logger'
import type { LocationUpdate, SpoofMode } from '@shared/types'

export interface DeviceEngines {
  location: LocationEngine
  route: RouteEngine
}

/** Snapshot of engine state for restoration after reconnect (W1) */
interface EngineSnapshot {
  locationMode: SpoofMode
  locationUpdate: LocationUpdate | null
  targetSerials: string[]
  routePlaying: boolean
  routeSpeedMs: number
}

export class DeviceEngineManager {
  private engines = new Map<string, DeviceEngines>()
  private adb: AdbService
  /** W1: State snapshots preserved when devices disconnect, keyed by serial */
  private snapshots = new Map<string, EngineSnapshot>()
  /** Track which serials were connected last poll cycle */
  private previousConnected = new Set<string>()

  constructor(adb: AdbService) { this.adb = adb }

  getEngines(serial: string): DeviceEngines {
    let pair = this.engines.get(serial)
    if (!pair) {
      log('info', `[EngineManager] creating engines for device ${serial}`)
      pair = { location: new LocationEngine(this.adb, serial), route: new RouteEngine(this.adb, serial) }
      this.engines.set(serial, pair)
    }
    return pair
  }

  peekEngines(serial: string): DeviceEngines | undefined {
    return this.engines.get(serial)
  }

  removeDevice(serial: string): void {
    const pair = this.engines.get(serial)
    if (pair) {
      // W1: Save state snapshot before disposing for possible reconnect restore
      const locMode = pair.location.getMode()
      const locUpdate = pair.location.getCurrentLocation()
      if (locMode !== 'idle' && locUpdate) {
        this.snapshots.set(serial, {
          locationMode: locMode,
          locationUpdate: locUpdate,
          targetSerials: pair.location.getTargetSerials(),
          routePlaying: pair.route.getState().playing,
          routeSpeedMs: pair.route.getSpeedMs()
        })
        log('info', `[EngineManager] snapshot saved for ${serial} (mode=${locMode})`)
      }
      log('info', `[EngineManager] disposing engines for device ${serial}`)
      pair.location.dispose()
      pair.route.dispose()
      this.engines.delete(serial)
    }
  }

  getActiveSerials(): string[] {
    return Array.from(this.engines.keys())
  }

  getDeviceState(serial: string): { mode: string; playing: boolean; wandering: boolean } {
    const pair = this.engines.get(serial)
    if (!pair) return { mode: 'idle', playing: false, wandering: false }
    const routeState = pair.route.getState()
    const locMode = pair.location.getMode()
    return {
      mode: routeState.playing ? 'route' : locMode,
      playing: routeState.playing,
      wandering: routeState.wandering ?? false
    }
  }

  async stopAll(mode: 'stay' | 'graceful' | 'immediate'): Promise<void> {
    const tasks: Promise<void>[] = []
    for (const [serial, pair] of this.engines) {
      tasks.push(this.stopDevice(serial, pair, mode))
    }
    await Promise.all(tasks)
  }

  private async stopDevice(serial: string, pair: DeviceEngines, mode: 'stay' | 'graceful' | 'immediate'): Promise<void> {
    pair.route.stop()
    switch (mode) {
      case 'stay':
        if (pair.location.getCurrentLocation()) {
          const loc = pair.location.getCurrentLocation()!
          await pair.location.teleport([serial], loc.lat, loc.lng)
        }
        break
      case 'graceful': {
        const realLoc = await this.adb.getRealLocation(serial)
        if (realLoc) pair.location.startGracefulStop([serial], realLoc.lat, realLoc.lng)
        else await pair.location.stop([serial])
        break
      }
      case 'immediate':
        await pair.location.stop([serial])
        break
    }
  }

  pruneDisconnected(connectedSerials: Set<string>): void {
    // Prune engines for disconnected devices (snapshot is saved in removeDevice)
    for (const serial of this.engines.keys()) {
      if (!connectedSerials.has(serial)) this.removeDevice(serial)
    }

    // W1: Detect serials that transitioned offline → connected and auto-restore
    for (const serial of connectedSerials) {
      if (!this.previousConnected.has(serial) && this.snapshots.has(serial)) {
        const snap = this.snapshots.get(serial)!
        this.snapshots.delete(serial)
        log('info', `[EngineManager] device ${serial} reconnected — restoring mock provider`)
        this.restoreDevice(serial, snap).catch((err) =>
          log('error', `[EngineManager] restore failed for ${serial}: ${err.message}`)
        )
      }
    }

    this.previousConnected = new Set(connectedSerials)
  }

  /**
   * W1: Restore mock provider and engine state after WiFi reconnection.
   * Also applies WiFi hardening to prevent future disconnects.
   */
  private async restoreDevice(serial: string, snap: EngineSnapshot): Promise<void> {
    // Harden WiFi connection to prevent sleep-related drops
    await this.adb.hardenWifiConnection(serial)

    // Re-enable mock location
    const result = await this.adb.enableMockLocation(serial)
    if (!result.ok) {
      log('error', `[EngineManager] enableMockLocation failed on restore for ${serial}: ${result.log.join('; ')}`)
      return
    }

    const serials = snap.targetSerials.length > 0 ? snap.targetSerials : [serial]
    const engines = this.getEngines(serial)

    if (snap.locationUpdate) {
      // Restore teleport position + keep-alive
      await engines.location.teleport(serials, snap.locationUpdate.lat, snap.locationUpdate.lng)
      log('info', `[EngineManager] restored location for ${serial}: ${snap.locationUpdate.lat.toFixed(6)}, ${snap.locationUpdate.lng.toFixed(6)}`)
    }
  }

  dispose(): void {
    for (const [, pair] of this.engines) {
      pair.location.dispose()
      pair.route.dispose()
    }
    this.engines.clear()
    this.snapshots.clear()
    this.previousConnected.clear()
  }
}
