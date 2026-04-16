import { AdbService } from './adb.service'
import { LocationEngine } from './location-engine'
import { RouteEngine } from './route-engine'
import { log } from '../logger'

export interface DeviceEngines {
  location: LocationEngine
  route: RouteEngine
}

/**
 * Manages per-device LocationEngine + RouteEngine pairs.
 * Engines are lazily created on first use and cleaned up when devices disconnect.
 */
export class DeviceEngineManager {
  private engines = new Map<string, DeviceEngines>()
  private adb: AdbService

  constructor(adb: AdbService) {
    this.adb = adb
  }

  /**
   * Get or create the engine pair for a device serial.
   */
  getEngines(serial: string): DeviceEngines {
    let pair = this.engines.get(serial)
    if (!pair) {
      log('info', `[EngineManager] creating engines for device ${serial}`)
      pair = {
        location: new LocationEngine(this.adb, serial),
        route: new RouteEngine(this.adb, serial)
      }
      this.engines.set(serial, pair)
    }
    return pair
  }

  /**
   * Get existing engine pair without creating. Returns undefined if not found.
   */
  peekEngines(serial: string): DeviceEngines | undefined {
    return this.engines.get(serial)
  }

  /**
   * Clean up engines for a disconnected device.
   */
  removeDevice(serial: string): void {
    const pair = this.engines.get(serial)
    if (pair) {
      log('info', `[EngineManager] disposing engines for device ${serial}`)
      pair.location.dispose()
      pair.route.dispose()
      this.engines.delete(serial)
    }
  }

  /**
   * Get all active device serials that have engines.
   */
  getActiveSerials(): string[] {
    return Array.from(this.engines.keys())
  }

  /**
   * Get per-device state snapshot for the UI.
   */
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

  /**
   * Stop all engines across all devices.
   */
  async stopAll(mode: 'stay' | 'graceful' | 'immediate'): Promise<void> {
    const tasks: Promise<void>[] = []
    for (const [serial, pair] of this.engines) {
      tasks.push(this.stopDevice(serial, pair, mode))
    }
    await Promise.all(tasks)
  }

  private async stopDevice(
    serial: string,
    pair: DeviceEngines,
    mode: 'stay' | 'graceful' | 'immediate'
  ): Promise<void> {
    const routeLoc = pair.route.getCurrentLocation()

    switch (mode) {
      case 'stay':
        pair.route.stopForStay()
        // Keep mock GPS at current position — just stop movement, keep-alive continues via teleport hold
        if (routeLoc || pair.location.getCurrentLocation()) {
          // Re-teleport to current position to start keep-alive
          const loc = routeLoc ?? pair.location.getCurrentLocation()!
          await pair.location.teleport([serial], loc.lat, loc.lng)
        }
        break
      case 'graceful': {
        pair.route.stopForStay()
        if (routeLoc) {
          pair.location.updatePosition(routeLoc.lat, routeLoc.lng, routeLoc.bearing, routeLoc.speed)
        }
        // Walk back to real GPS
        const realLoc = await this.adb.getRealLocation(serial)
        if (realLoc) {
          pair.location.startGracefulStop([serial], realLoc.lat, realLoc.lng)
        } else {
          await pair.location.stop([serial])
        }
        break
      }
      case 'immediate':
        await pair.route.stopAndAwaitCleanup()
        await pair.location.stop([serial])
        break
    }
  }

  /**
   * Clean up engines for serials that are no longer connected.
   */
  pruneDisconnected(connectedSerials: Set<string>): void {
    for (const serial of this.engines.keys()) {
      if (!connectedSerials.has(serial)) {
        this.removeDevice(serial)
      }
    }
  }

  dispose(): void {
    for (const [, pair] of this.engines) {
      pair.location.dispose()
      pair.route.dispose()
    }
    this.engines.clear()
  }
}
