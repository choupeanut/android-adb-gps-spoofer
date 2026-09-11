import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LocationEngine } from '../../src/main/services/location-engine'
import { LocationEngine as WebLocationEngine } from '../../web/server/services/location-engine'
import { addBroadcastListener as addMainBroadcastListener } from '../../src/main/services/broadcast'
import { addBroadcastListener as addWebBroadcastListener } from '../../web/server/broadcast'

const mockAdb = {
  pushLocation: vi.fn().mockResolvedValue(true),
  removeTestProvider: vi.fn().mockResolvedValue(undefined),
  maybeRestoreMasterLocation: vi.fn().mockResolvedValue(undefined)
} as any

describe('LocationEngine', () => {
  let engine: LocationEngine

  beforeEach(() => {
    vi.useFakeTimers()
    mockAdb.pushLocation.mockClear()
    mockAdb.removeTestProvider.mockClear()
    mockAdb.maybeRestoreMasterLocation.mockClear()
    engine = new LocationEngine(mockAdb, 'device-1')
  })

  afterEach(() => {
    engine.dispose()
    vi.useRealTimers()
  })

  it('teleports immediately even when the previous mock location is nearby', async () => {
    await engine.teleport(['device-1'], 25.033964, 121.564472)
    mockAdb.pushLocation.mockClear()

    const ok = await engine.teleport(['device-1'], 25.034, 121.5645)

    expect(ok).toBe(true)
    expect(mockAdb.pushLocation).toHaveBeenCalledTimes(1)
    expect(mockAdb.pushLocation).toHaveBeenCalledWith(
      'device-1',
      expect.objectContaining({
        lat: 25.034,
        lng: 121.5645,
        speed: 0,
        bearing: 0
      })
    )
  })
})

for (const [runtime, Engine, listen] of [
  ['desktop', LocationEngine, addMainBroadcastListener],
  ['web', WebLocationEngine, addWebBroadcastListener]
] as const) {
  describe(`${runtime} LocationEngine callback lifecycle`, () => {
    let engine: InstanceType<typeof Engine>
    let unsubscribe: () => void

    beforeEach(() => {
      vi.useFakeTimers()
      mockAdb.pushLocation.mockReset()
      mockAdb.removeTestProvider.mockResolvedValue(undefined)
      mockAdb.maybeRestoreMasterLocation.mockResolvedValue(undefined)
      mockAdb.pushLocation.mockResolvedValue(true)
      engine = new Engine(mockAdb, 'device-1')
    })

    afterEach(() => {
      unsubscribe?.()
      engine.dispose()
      vi.useRealTimers()
    })

    it('does not emit a stale keep-alive snapshot after a teleport handoff', async () => {
      const events: Array<{ channel: string; data: any }> = []
      unsubscribe = listen((channel: string, data: unknown) => events.push({ channel, data }))

      await engine.teleport(['device-1'], 25.033964, 121.564472)

      let releaseOldPush!: (ok: boolean) => void
      const oldPush = new Promise<boolean>((resolve) => { releaseOldPush = resolve })
      mockAdb.pushLocation.mockImplementation((_serial: string, loc: { lat: number }) => {
        return Math.abs(loc.lat - 25.034) < 1e-9 ? Promise.resolve(true) : oldPush
      })

      const oldTick = vi.advanceTimersByTimeAsync(500)
      await Promise.resolve()
      const nextTeleport = engine.teleport(['device-1'], 25.034, 121.5645)
      await Promise.resolve()
      releaseOldPush(true)
      await oldTick
      await nextTeleport

      const locationEvents = events.filter((event) => event.channel === 'location-updated')
      expect(locationEvents.length).toBeGreaterThanOrEqual(2)
      expect(locationEvents.some((event) => event.data.location == null)).toBe(false)
      expect(locationEvents.at(-1)?.data.location).toEqual(expect.objectContaining({ lat: 25.034, lng: 121.5645 }))
    })
  })
}
