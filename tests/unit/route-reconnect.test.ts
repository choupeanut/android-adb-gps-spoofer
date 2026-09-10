import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceEngineManager as DesktopManager } from '../../src/main/services/device-engine-manager'
import { DeviceEngineManager as WebManager } from '../../web/server/services/device-engine-manager'
import { registerEngineHandlers } from '../../src/shared/engine-handlers'
import { addBroadcastListener as addWsListener } from '../../src/main/services/broadcast'
import { addBroadcastListener } from '../../web/server/broadcast'
import type { LocationUpdate } from '../../src/shared/types'

const points = [{ lat: 25, lng: 121 }, { lat: 25.01, lng: 121.01 }]
const delay = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

for (const [runtime, Manager, listen] of [
  ['desktop', DesktopManager, addWsListener],
  ['web', WebManager, addBroadcastListener]
] as const) {
  describe(`${runtime} shared route lifecycle`, () => {
    let manager: DesktopManager | WebManager
    let adb: any
    let handlers: Map<string, (...args: any[]) => any>
    let events: Array<{ channel: string; data: any }>
    let unsubscribe: () => void
    beforeEach(() => {
      vi.useFakeTimers()
      adb = {
        pushLocation: vi.fn().mockResolvedValue(true),
        hardenWifiConnection: vi.fn().mockResolvedValue(undefined),
        enableMockLocation: vi.fn().mockResolvedValue({ ok: true }),
        maybeDisableMasterLocationForSpoof: vi.fn().mockResolvedValue(undefined),
        maybeRestoreMasterLocation: vi.fn().mockResolvedValue(undefined),
        removeTestProvider: vi.fn().mockResolvedValue(undefined),
        getRealLocation: vi.fn().mockResolvedValue(null)
      }
      manager = new Manager(adb)
      handlers = new Map()
      registerEngineHandlers((channel, fn) => handlers.set(channel, fn), manager, adb.maybeRestoreMasterLocation)
      manager.pruneDisconnected(new Set(['a', 'b', 'c']))
      events = []
      unsubscribe = listen((channel: string, data: unknown) => events.push({ channel, data }))
    })
    afterEach(() => {
      unsubscribe()
      manager.dispose()
      vi.useRealTimers()
    })
    const call = (channel: string, ...args: any[]) => handlers.get(channel)!(...args)
    const start = async (serials = ['a', 'b', 'c']) => {
      call('route-set-waypoints', points, serials)
      call('route-set-fixed-speed', true, serials)
      await call('route-play', serials, 10)
    }
    const tick = () => vi.advanceTimersByTimeAsync(500)
    const reconnect = async (serials: string[]) => {
      manager.pruneDisconnected(new Set(serials))
      await vi.advanceTimersByTimeAsync(0)
    }
    const latest = (serial: string): LocationUpdate => adb.pushLocation.mock.calls.filter(([s]: [string]) => s === serial).at(-1)?.[1]

    it('computes one timeline and identical full payloads for N devices', async () => {
      await start()
      await tick()
      expect(manager.getEngines('a').route).toBe(manager.getEngines('b').route)
      expect(latest('a')).toEqual(latest('b'))
      expect(latest('b')).toEqual(latest('c'))
      expect(latest('a').lat).toBeGreaterThan(points[0].lat)
      const updates = events.filter(e => e.channel === 'route-updated' && e.data.state.playing)
      expect(new Set(updates.map(e => e.data.serial))).toEqual(new Set(['a', 'b', 'c']))
    })

    it('keeps peers moving and reconnects a missing member at the current coordinate', async () => {
      await start()
      await tick()
      const before = latest('a').lat
      manager.pruneDisconnected(new Set(['b', 'c']))
      adb.pushLocation.mockClear()
      await tick()
      expect(latest('a')).toBeUndefined()
      expect(latest('b').lat).toBeGreaterThan(before)
      await reconnect(['a', 'b', 'c'])
      expect(adb.enableMockLocation).toHaveBeenCalledWith('a')
      await tick()
      expect(latest('a')).toEqual(latest('b'))
      expect(latest('a')).toEqual(latest('c'))
      expect(latest('a').lat).toBeGreaterThan(before)
    })

    it('continues its timeline when every device is offline', async () => {
      await start()
      await tick()
      const before = latest('a').lat
      manager.pruneDisconnected(new Set())
      adb.pushLocation.mockClear()
      await vi.advanceTimersByTimeAsync(2000)
      expect(adb.pushLocation).not.toHaveBeenCalled()
      await reconnect(['a', 'b', 'c'])
      await tick()
      expect(latest('a').lat).toBeGreaterThan(before)
      expect(latest('a')).toEqual(latest('c'))
    })

    it('retries failed setup on an unchanged connected-device poll', async () => {
      await start()
      manager.pruneDisconnected(new Set(['b', 'c']))
      adb.enableMockLocation.mockResolvedValueOnce({ ok: false })
      await reconnect(['a', 'b', 'c'])
      adb.pushLocation.mockClear()
      await tick()
      expect(latest('a')).toBeUndefined()
      await reconnect(['a', 'b', 'c'])
      await tick()
      expect(adb.enableMockLocation).toHaveBeenCalledTimes(2)
      expect(latest('a')).toEqual(latest('b'))
    })

    it('keeps paused progress and shared hold coordinates after reconnect', async () => {
      await start()
      await tick()
      await call('route-pause')
      const before = manager.getEngines('a').route.getState().progressFraction
      manager.pruneDisconnected(new Set())
      await vi.advanceTimersByTimeAsync(1000)
      await reconnect(['a', 'b', 'c'])
      await tick()
      expect(manager.getDeviceState('a').playing).toBe(false)
      expect(manager.getEngines('a').route.getState().progressFraction).toBe(before)
      expect(latest('a')).toEqual(latest('c'))
      await call('route-play', ['a', 'b', 'c'], 10)
      await tick()
      expect(manager.getEngines('a').route.getState().progressFraction).toBeGreaterThan(before)
    })

    it('joins a newly added device without restarting the original group', async () => {
      await start(['a', 'b'])
      await vi.advanceTimersByTimeAsync(1500)
      const before = latest('a').lat
      await call('route-play', ['a', 'b', 'c'], 10)
      await tick()
      expect(latest('c')).toEqual(latest('a'))
      expect(latest('c').lat).toBeGreaterThan(before)
    })

    it('keeps independently started routes independent', async () => {
      await start(['a'])
      await tick()
      await start(['b'])
      await tick()
      expect(manager.getEngines('a').route).not.toBe(manager.getEngines('b').route)
      expect(latest('a').lat).toBeGreaterThan(latest('b').lat)
    })

    it('stops an offline member without stopping or detaching its peers', async () => {
      await start()
      await tick()
      manager.pruneDisconnected(new Set(['b', 'c']))
      await call('route-stop', ['a'])
      await reconnect(['a', 'b', 'c'])
      adb.pushLocation.mockClear()
      await tick()
      expect(latest('a')).toBeUndefined()
      expect(latest('b')).toEqual(latest('c'))
      expect(manager.getDeviceState('b').playing).toBe(true)
      expect(adb.enableMockLocation).not.toHaveBeenCalled()
    })

    it.each(['immediate', 'stay', 'graceful'])('Stop All %s cancels offline route recovery', async (mode) => {
      await start()
      manager.pruneDisconnected(new Set())
      await call('stop-all', mode)
      await reconnect(['a', 'b', 'c'])
      adb.pushLocation.mockClear()
      await tick()
      expect(adb.pushLocation).not.toHaveBeenCalled()
      expect(adb.enableMockLocation).not.toHaveBeenCalled()
      expect(manager.getDeviceState('a').playing).toBe(false)
    })

    it('does not revive a stopped member when delayed setup completes', async () => {
      await start()
      manager.pruneDisconnected(new Set(['b', 'c']))
      const setup = delay<{ ok: boolean }>()
      adb.enableMockLocation.mockReturnValueOnce(setup.promise)
      await reconnect(['a', 'b', 'c'])
      const stop = call('route-stop', ['a'])
      setup.resolve({ ok: true })
      await stop
      adb.pushLocation.mockClear()
      await tick()
      expect(latest('a')).toBeUndefined()
      expect(latest('b')).toBeDefined()
      expect(adb.removeTestProvider).toHaveBeenCalledWith('a')
    })

    it('a teleport during reconnect detaches only its target and wins over old setup', async () => {
      await start()
      manager.pruneDisconnected(new Set(['b', 'c']))
      const setup = delay<{ ok: boolean }>()
      adb.enableMockLocation.mockReturnValueOnce(setup.promise)
      await reconnect(['a', 'b', 'c'])
      const teleport = call('teleport', ['a'], 30, 120)
      setup.resolve({ ok: true })
      await teleport
      expect(latest('a').lat).toBe(30)
      await tick()
      expect(manager.getDeviceState('a').mode).toBe('teleport')
      expect(manager.getDeviceState('b').playing).toBe(true)
      expect(latest('b')).toEqual(latest('c'))
    })

    it('a slow missing device does not stall peer coordinates or the offline timeline', async () => {
      await start()
      const write = delay<boolean>()
      adb.pushLocation.mockImplementation((serial: string) => serial === 'a' ? write.promise : Promise.resolve(true))
      await tick()
      const before = latest('b').lat
      await tick()
      expect(latest('b').lat).toBeGreaterThan(before)
      expect(adb.pushLocation.mock.calls.filter(([serial]: [string]) => serial === 'a')).toHaveLength(1)
      manager.pruneDisconnected(new Set())
      const offlineBefore = manager.getEngines('a').route.getCurrentLocation()!.lat
      await tick()
      expect(manager.getEngines('a').route.getCurrentLocation()!.lat).toBeGreaterThan(offlineBefore)
      write.resolve(false)
      adb.pushLocation.mockResolvedValue(true)
      await reconnect(['a', 'b', 'c'])
      await tick()
      expect(latest('a')).toEqual(latest('c'))
    })

    it('drains an old route write before a replacement teleport can write', async () => {
      await start()
      const write = delay<boolean>()
      adb.pushLocation.mockImplementation((serial: string) => serial === 'a' ? write.promise : Promise.resolve(true))
      await tick()
      const teleport = call('teleport', ['a'], 30, 120)
      await vi.advanceTimersByTimeAsync(0)
      expect(adb.pushLocation.mock.calls.some(([serial, loc]: [string, LocationUpdate]) => serial === 'a' && loc.lat === 30)).toBe(false)
      adb.pushLocation.mockResolvedValue(true)
      write.resolve(true)
      await teleport
      expect(latest('a').lat).toBe(30)
      await tick()
      expect(manager.getDeviceState('b').playing).toBe(true)
    })

    it('stopping during a delayed glide does not restart its completion callback', async () => {
      call('route-set-waypoints', points, ['a'])
      await call('route-play', ['a'], 100, 24.99999, 121)
      const write = delay<boolean>()
      adb.pushLocation.mockReturnValueOnce(write.promise)
      await tick()
      const stop = call('route-stop', ['a'])
      write.resolve(true)
      await stop
      adb.pushLocation.mockClear()
      await vi.advanceTimersByTimeAsync(2000)
      expect(adb.pushLocation).not.toHaveBeenCalled()
      expect(manager.getDeviceState('a').playing).toBe(false)
    })

    it('keeps natural-completion hold shared after reconnect without restarting', async () => {
      await start()
      await call('route-set-speed', 10000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(manager.getDeviceState('a').playing).toBe(false)
      manager.pruneDisconnected(new Set(['b', 'c']))
      await reconnect(['a', 'b', 'c'])
      await tick()
      expect(manager.getDeviceState('a').playing).toBe(false)
      expect(latest('a')).toEqual(latest('b'))
    })

    it('a failed push to one target does not reject the shared tick', async () => {
      await start()
      adb.pushLocation.mockImplementation((serial: string) => serial === 'a' ? Promise.reject(new Error('offline')) : Promise.resolve(true))
      await tick()
      expect(latest('b')).toEqual(latest('c'))
      const before = latest('b').lat
      await tick()
      expect(latest('b').lat).toBeGreaterThan(before)
    })
  })
}
