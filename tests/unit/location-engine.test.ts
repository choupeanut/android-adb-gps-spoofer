import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LocationEngine } from '../../src/main/services/location-engine'

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
