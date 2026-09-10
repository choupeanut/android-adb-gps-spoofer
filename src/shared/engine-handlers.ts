import type { LocationControl, RouteControl, SharedDeviceEngineManager } from './device-engine-manager'
import type { RouteWaypoint } from './types'

type Register = (channel: string, handler: (...args: any[]) => any) => void

/** Identical command semantics for Electron IPC, embedded Web and standalone Web. */
export function registerEngineHandlers<L extends LocationControl, R extends RouteControl>(
  handle: Register,
  manager: SharedDeviceEngineManager<L, R>,
  restoreMaster: (serial: string) => Promise<unknown>
): void {
  const targets = (serials?: string[]): string[] => serials ?? manager.getActiveSerials()
  const leave = (serial: string) => {
    const loc = manager.detachRoute(serial)
    const pair = manager.getEngines(serial)
    pair.location.stopContinuousUpdate()
    pair.location.setMode('idle')
    return { loc, pair }
  }

  handle('teleport', async (serials: string[], lat: number, lng: number) => {
    const results = await Promise.all(serials.map(async (serial) => {
      const { pair } = leave(serial)
      await manager.settleRecovery(serial)
      return pair.location.teleport([serial], lat, lng)
    }))
    return results.every(Boolean)
  })
  handle('start-joystick', async (serials: string[]) => {
    await Promise.all(serials.map(async (serial) => {
      const { loc, pair } = leave(serial)
      await manager.settleRecovery(serial)
      if (loc) pair.location.updatePosition(loc.lat, loc.lng, loc.bearing, loc.speed)
      pair.location.setMode('joystick')
      pair.location.startContinuousUpdate([serial])
    }))
    return true
  })
  handle('stop-joystick', (serials?: string[]) => {
    for (const serial of targets(serials)) {
      const location = manager.peekEngines(serial)?.location
      if (location?.getMode() === 'joystick') {
        manager.detachRoute(serial)
        location.setMode('idle')
        location.stopContinuousUpdate()
      }
    }
    return true
  })
  handle('update-position', (lat: number, lng: number, brg: number, speed: number, serials?: string[]) => {
    for (const serial of targets(serials)) {
      const location = manager.peekEngines(serial)?.location
      if (location?.getMode() === 'joystick') location.updatePosition(lat, lng, brg, speed)
    }
    return true
  })
  handle('stop-spoofing', async (serials: string[]) => {
    await Promise.all(serials.map(async (serial) => {
      const { pair } = leave(serial)
      await manager.settleRecovery(serial)
      await pair.location.stop([serial])
    }))
    return true
  })
  handle('stop-spoofing-graceful', async (serials: string[], lat: number, lng: number) => {
    await Promise.all(serials.map(async (serial) => {
      const { loc, pair } = leave(serial)
      await manager.settleRecovery(serial)
      if (loc) pair.location.updatePosition(loc.lat, loc.lng, loc.bearing, loc.speed)
      pair.location.startGracefulStop([serial], lat, lng)
    }))
    return true
  })
  handle('get-location-state', (serial?: string) => {
    const pair = manager.peekEngines(serial ?? manager.getActiveSerials()[0])
    if (!pair) return { location: null, mode: 'idle' }
    const routeLoc = pair.route.getCurrentLocation()
    return { location: routeLoc ?? pair.location.getCurrentLocation(), mode: routeLoc ? 'route' : pair.location.getMode() }
  })
  handle('stop-all', async (mode: 'stay' | 'graceful' | 'immediate') => {
    await manager.stopAll(mode)
    return true
  })
  handle('route-set-waypoints', (points: RouteWaypoint[], serials?: string[]) => {
    manager.setWaypoints(points, targets(serials))
    return true
  })
  handle('route-play', async (serials: string[], speed: number, lat?: number, lng?: number) => {
    await manager.playRoute(serials, speed, lat, lng)
    return true
  })
  handle('route-pause', (serials?: string[]) => {
    for (const route of manager.getRoutes(targets(serials))) route.pause()
    return true
  })
  handle('route-stop', async (serials?: string[]) => {
    await Promise.all(targets(serials).map(async (serial) => {
      const { pair } = leave(serial)
      await manager.settleRecovery(serial)
      await pair.location.stop([serial])
      await restoreMaster(serial)
    }))
    return true
  })
  handle('route-stop-stay', async (serials?: string[]) => {
    const results = await Promise.all(targets(serials).map(async (serial) => {
      const { loc, pair } = leave(serial)
      await manager.settleRecovery(serial)
      if (!loc) return true
      return pair.location.teleport([serial], loc.lat, loc.lng)
    }))
    return results.every(Boolean)
  })
  handle('route-return-to-gps', (lat: number, lng: number, speed: number, serials?: string[]) => {
    for (const route of manager.getRoutes(targets(serials))) route.returnToRealGps(lat, lng, speed)
    return true
  })
  handle('route-get-state', (serial?: string) => {
    return manager.peekEngines(serial ?? manager.getActiveSerials()[0])?.route.getState() ?? null
  })
  handle('route-set-loop', (loop: boolean, serials?: string[]) => {
    for (const route of manager.getRoutes(targets(serials))) route.setLoop(loop)
    return true
  })
  handle('route-set-wander', (enabled: boolean, radius: number, serials?: string[]) => {
    for (const route of manager.getRoutes(targets(serials))) route.setWanderEnabled(enabled, radius)
    return true
  })
  handle('route-set-speed', (speed: number, serials?: string[]) => {
    for (const route of manager.getRoutes(targets(serials))) route.setSpeed(speed)
    return true
  })
  handle('route-set-fixed-speed', (enabled: boolean, serials?: string[]) => {
    for (const route of manager.getRoutes(targets(serials))) route.setFixedSpeed(enabled)
    return true
  })
}
