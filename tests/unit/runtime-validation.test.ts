import { describe, expect, it, vi } from 'vitest'
import { registerEngineHandlers } from '../../src/shared/engine-handlers'
import { normalizeSavedLocationName } from '../../src/shared/saved-location-repository'

const invalidCommands: Array<[string, unknown[]]> = [
  ['teleport', [['device'], NaN, 0]],
  ['teleport', [['device', null], 0, 0]],
  ['start-joystick', [['device', 'bad;serial']]],
  ['update-position', [91, 0, 0, 1, ['device']]],
  ['stop-spoofing-graceful', [['device'], 0, Infinity]],
  ['stop-all', ['invalid']],
  ['route-set-waypoints', [[{ lat: 0, lng: 0 }, { lat: 0, lng: 181 }], ['device']]],
  ['route-play', [['device'], -1]],
  ['route-play', [['device'], 1, 2]],
  ['route-return-to-gps', [0, 0, '1', ['device']]],
  ['route-set-loop', ['false', ['device']]],
  ['route-set-wander', [true, Infinity, ['device']]],
  ['route-set-speed', [NaN, ['device']]],
  ['route-set-fixed-speed', [1, ['device']]],
  ['route-pause', [['device', null]]],
  ['route-stop', ['device']],
  ['route-set-waypoints', [[], ['device', {}]]]
]

describe('runtime command validation', () => {
  it.each(invalidCommands)('rejects %s before touching the engine manager (%j)', async (channel, args) => {
    const touched = vi.fn(() => { throw new Error('manager was touched') })
    const manager = new Proxy({}, { get: () => touched })
    const handlers = new Map<string, (...args: any[]) => any>()
    registerEngineHandlers((name, fn) => handlers.set(name, fn), manager as any, vi.fn())
    await expect(Promise.resolve().then(() => handlers.get(channel)!(...args))).rejects.toThrow()
    expect(touched).not.toHaveBeenCalled()
  })
  it.each([null, undefined, 1, {}, []].map((value) => [value]))('rejects malformed saved name %j', (value) => {
    expect(normalizeSavedLocationName(value as any)).toBeNull()
  })
})
