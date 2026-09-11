import type { LocationUpdate, RouteWaypoint, SpoofMode } from './types'

export interface RouteControl {
  setWaypoints(points: RouteWaypoint[]): void
  getState(): { waypoints: RouteWaypoint[]; playing: boolean; wandering: boolean; loop: boolean }
  getCurrentLocation(): LocationUpdate | null
  waitForDelivery(serial: string): Promise<void>
  setTargets(ready: string[], members: string[]): void
  play(serials: string[], speed: number, lat?: number, lng?: number): Promise<void>
  pause(): void
  stopForStay(): void
  stopAndAwaitCleanup(): Promise<void>
  returnToRealGps(lat: number, lng: number, speed: number): void
  setLoop(value: boolean): void
  setWanderEnabled(enabled: boolean, radius: number): void
  setSpeed(speed: number): void
  setFixedSpeed(enabled: boolean): void
  dispose(): void
}
export interface LocationControl {
  getMode(): SpoofMode
  getCurrentLocation(): LocationUpdate | null
  waitForDelivery(serial: string): Promise<void>
  setMode(mode: SpoofMode): void
  updatePosition(lat: number, lng: number, bearing: number, speed: number): void
  teleport(serials: string[], lat: number, lng: number): Promise<boolean>
  stop(serials: string[]): Promise<void>
  startGracefulStop(serials: string[], lat: number, lng: number): void
  startContinuousUpdate(serials: string[]): void
  stopContinuousUpdate(): void
  dispose(): void
}
interface RecoveryAdb {
  hardenWifiConnection(serial: string): Promise<unknown>
  enableMockLocation(serial: string): Promise<{ ok: boolean }>
  maybeDisableMasterLocationForSpoof(serial: string): Promise<unknown>
  maybeRestoreMasterLocation(serial: string): Promise<unknown>
  removeTestProvider(serial: string): Promise<unknown>
  getRealLocation(serial: string): Promise<{ lat: number; lng: number } | null>
}
interface Group<R> { route: R; members: Set<string>; ready: Set<string> }

/** Owns route groups and reconnection; runtime adapters only supply engines and ADB. */
export class SharedDeviceEngineManager<L extends LocationControl, R extends RouteControl> {
  private engines = new Map<string, { location: L; route: R }>()
  private groups = new Map<R, Group<R>>()
  private connected: Set<string> | null = null
  private recovery = new Map<string, symbol>()
  private pending = new Map<string, Promise<void>>()
  private heldLocations = new Map<string, LocationUpdate>()
  private draining = new Map<string, Promise<void>>()
  private disposed = false
  private revisions = new Map<string, number>()

  constructor(
    private adb: RecoveryAdb,
    private createLocation: (serial: string) => L,
    private createRoute: (serial: string) => R,
    private warn: (message: string) => void
  ) {}

  getEngines(serial: string): { location: L; route: R } {
    let pair = this.engines.get(serial)
    if (!pair) {
      pair = { location: this.createLocation(serial), route: this.createRoute(serial) }
      this.engines.set(serial, pair)
    }
    return pair
  }
  peekEngines(serial: string): { location: L; route: R } | undefined { return this.engines.get(serial) }
  getActiveSerials(): string[] { return [...this.engines.keys()] }
  getRoutes(serials = this.getActiveSerials()): R[] {
    return [...new Set(serials.map((serial) => this.engines.get(serial)?.route).filter((r): r is R => !!r))]
  }
  private sync(group: Group<R>): void {
    group.route.setTargets([...group.ready], [...group.members])
  }

  /** Remove one member without stopping its peers; invalidate recovery before any await. */
  detachRoute(serial: string): LocationUpdate | null {
    this.revisions.set(serial, (this.revisions.get(serial) ?? 0) + 1)
    this.recovery.delete(serial)
    this.heldLocations.delete(serial)
    const pair = this.engines.get(serial)
    if (!pair) return null
    const route = pair.route
    const loc = route.getCurrentLocation()
    const drain = Promise.all([this.draining.get(serial), route.waitForDelivery(serial)]).then(() => {})
    this.draining.set(serial, drain)
    void drain.finally(() => {
      if (this.draining.get(serial) === drain) this.draining.delete(serial)
    })
    const group = this.groups.get(route)
    if (group) {
      group.members.delete(serial)
      group.ready.delete(serial)
      this.sync(group)
      if (group.members.size === 0) {
        route.dispose()
        this.groups.delete(route)
      }
      pair.route = this.createRoute(serial)
    } else {
      route.stopForStay()
    }
    return loc
  }

  async settleRecovery(serial: string): Promise<void> {
    const location = this.engines.get(serial)?.location.waitForDelivery(serial)
    await Promise.all([this.pending.get(serial), this.draining.get(serial), location])
  }

  removeDevice(serial: string): void {
    this.detachRoute(serial)
    const pair = this.engines.get(serial)
    pair?.location.dispose()
    pair?.route.dispose()
    this.engines.delete(serial)
  }

  setWaypoints(waypoints: RouteWaypoint[], serials = this.getActiveSerials()): void {
    for (const serial of serials) {
      this.detachRoute(serial)
      this.getEngines(serial).route.setWaypoints(waypoints)
    }
  }

  async playRoute(serials: string[], speed: number, lat?: number, lng?: number): Promise<void> {
    const targets = [...new Set(serials)]
    if (!targets.length) return
    const revisions = targets.map((serial) => this.revisions.get(serial))
    await Promise.all(targets.map((serial) => this.settleRecovery(serial)))
    if (this.disposed || targets.some((serial, i) => this.revisions.get(serial) !== revisions[i])) return
    // Existing members anchor additions/resume to the group's current timeline.
    let group = targets.map((s) => this.groups.get(this.getEngines(s).route)).find(Boolean)
    const route = group?.route ?? this.getEngines(targets[0]).route
    if (route.getState().waypoints.length < 2) return
    const alreadyMoving = route.getState().playing || route.getState().wandering
    if (!group) {
      group = { route, members: new Set(), ready: new Set() }
      this.groups.set(route, group)
    }
    const joining: Array<Promise<void>> = []
    for (const serial of targets) {
      const pair = this.getEngines(serial)
      if (pair.route !== route) {
        this.detachRoute(serial)
        pair.route.dispose()
        pair.route = route
      }
      pair.location.stopContinuousUpdate()
      pair.location.setMode('idle')
      if (!group.members.has(serial)) {
        group.members.add(serial)
        const revision = this.revisions.get(serial)
        const currentGroup = group
        joining.push(this.settleRecovery(serial).then(() => {
          if (this.disposed || this.groups.get(route) !== currentGroup ||
              !currentGroup.members.has(serial) || this.revisions.get(serial) !== revision) return
          if (!this.connected || this.connected.has(serial)) currentGroup.ready.add(serial)
          else this.recovery.set(serial, Symbol(serial))
          this.sync(currentGroup)
        }))
      }
    }
    this.sync(group)
    await Promise.all(joining)
    if (this.groups.get(route) !== group || this.disposed) return
    if (!alreadyMoving) await route.play([...group.ready], speed, lat, lng)
    else route.setSpeed(speed)
  }

  getDeviceState(serial: string): { mode: string; playing: boolean; wandering: boolean } {
    const pair = this.engines.get(serial)
    if (!pair) return { mode: 'idle', playing: false, wandering: false }
    const state = pair.route.getState()
    return {
      mode: pair.route.getCurrentLocation() ? 'route' : pair.location.getMode(),
      playing: state.playing,
      wandering: state.wandering ?? false
    }
  }

  /** Called on every completed device poll, so transient setup failures are retried. */
  pruneDisconnected(connected: Set<string>): void {
    if (this.disposed) return
    const previous = this.connected
    this.connected = new Set(connected)
    for (const [serial, pair] of this.engines) {
      const group = this.groups.get(pair.route)
      if (!connected.has(serial)) {
        if (group) {
          if (group.ready.delete(serial) || previous?.has(serial) || !this.recovery.has(serial)) {
            this.recovery.set(serial, Symbol(serial))
            this.sync(group)
          }
          pair.location.stopContinuousUpdate()
        } else if (pair.location.getMode() !== 'idle' && pair.location.getCurrentLocation()) {
          if (!this.recovery.has(serial)) {
            this.heldLocations.set(serial, pair.location.getCurrentLocation()!)
            this.recovery.set(serial, Symbol(serial))
          }
          pair.location.stopContinuousUpdate()
        } else if (!this.pending.has(serial)) this.removeDevice(serial)
      } else if (this.recovery.has(serial) && !this.pending.has(serial)) {
        const token = this.recovery.get(serial)!
        const task = this.restore(serial, token).catch((error) => {
          this.warn(`Reconnect setup failed for ${serial}: ${String(error)}`)
        }).finally(() => this.pending.delete(serial))
        this.pending.set(serial, task)
      }
    }
  }

  private async restore(serial: string, token: symbol): Promise<void> {
    const valid = (): boolean => !this.disposed && this.connected?.has(serial) === true &&
      this.recovery.get(serial) === token
    let completed = false
    try {
      await this.engines.get(serial)?.route.waitForDelivery(serial)
      if (!valid()) return
      await this.adb.hardenWifiConnection(serial)
      if (!valid()) return
      const result = await this.adb.enableMockLocation(serial)
      if (!valid() || !result.ok) return
      await this.adb.maybeDisableMasterLocationForSpoof(serial)
      if (!valid()) return
      const pair = this.engines.get(serial)
      if (!pair) return
      const group = this.groups.get(pair.route)
      if (group) {
        group.ready.add(serial)
        this.sync(group)
      } else {
        const loc = this.heldLocations.get(serial)
        if (loc) await pair.location.teleport([serial], loc.lat, loc.lng)
        if (!valid()) {
          pair.location.stopContinuousUpdate()
          return
        }
        this.heldLocations.delete(serial)
      }
      this.recovery.delete(serial)
      completed = true
    } finally {
      // Commands wait for this cleanup before starting a replacement writer.
      if (!completed && !valid() && !this.recovery.has(serial) &&
          !this.groups.get(this.engines.get(serial)?.route as R) &&
          !this.heldLocations.has(serial)) {
        await this.adb.removeTestProvider(serial).catch(() => {})
        await this.adb.maybeRestoreMasterLocation(serial).catch(() => {})
      }
    }
  }

  async stopAll(mode: 'stay' | 'graceful' | 'immediate'): Promise<void> {
    // Detach every member synchronously, including absent devices, before cleanup.
    const targets = this.getActiveSerials().map((serial) => ({
      serial, loc: this.detachRoute(serial), pair: this.getEngines(serial)
    }))
    await Promise.all(targets.map(async ({ serial, loc, pair }) => {
      await this.settleRecovery(serial)
      if (mode === 'stay') {
        const position = loc ?? pair.location.getCurrentLocation()
        if (position && (!this.connected || this.connected.has(serial))) {
          await pair.location.teleport([serial], position.lat, position.lng)
        } else pair.location.stopContinuousUpdate()
      } else if (mode === 'graceful') {
        if (loc) pair.location.updatePosition(loc.lat, loc.lng, loc.bearing, loc.speed)
        const real = await this.adb.getRealLocation(serial)
        if (real) pair.location.startGracefulStop([serial], real.lat, real.lng)
        else await pair.location.stop([serial])
      } else await pair.location.stop([serial])
    }))
  }

  dispose(): void {
    this.disposed = true
    this.recovery.clear()
    this.heldLocations.clear()
    for (const route of this.getRoutes()) route.dispose()
    for (const pair of this.engines.values()) pair.location.dispose()
    this.engines.clear()
    this.groups.clear()
  }
}
