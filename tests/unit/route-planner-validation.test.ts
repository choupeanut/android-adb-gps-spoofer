import { describe, expect, it, vi } from 'vitest'
import { RoutePlannerService as Desktop } from '../../src/main/services/route-planner'
import { RoutePlannerService as Web } from '../../web/server/services/route-planner'

const request = { controlPoints: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], profile: 'walk' as const, loop: false }
const response = (coordinates: unknown = [[0, 0], [1, 1]]) => ({ ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 100, duration: 100, geometry: { coordinates } }] }) })

for (const Service of [Desktop, Web]) {
  describe(`${Service === Desktop ? 'desktop' : 'web'} planner validation`, () => {
    it.each([null, { ...request, profile: 'fly' }, { ...request, loop: 1 }, { ...request, controlPoints: [{ lat: 91, lng: 0 }, { lat: 0, lng: 0 }] }, { ...request, controlPoints: Array(101).fill({ lat: 0, lng: 0 }) }])('rejects request before fetch', async (input) => {
      const fetch = vi.fn()
      await expect(new Service('http://mock', fetch).planRoadNetwork(input as any)).rejects.toThrow()
      expect(fetch).not.toHaveBeenCalled()
    })
    it.each([[[0, 0], [Infinity, 0]], [[0, 0], [0, 91]], [[0, 0], ['1', 1]], [[0, 0], null], Array(100001).fill([0, 0])].map((geometry) => [geometry]))('rejects invalid or excessive geometry', async (geometry) => {
      await expect(new Service('http://mock', async () => response(geometry)).planRoadNetwork(request)).rejects.toThrow()
    })
    it('bounds antipodal connectors and preserves endpoints', async () => {
      const result = await new Service('http://mock', async () => response([[180, 0], [-179, 0]])).planRoadNetwork(request)
      expect(result.plannedWaypoints.length).toBeLessThanOrEqual(2500)
      expect(result.plannedWaypoints[0]).toEqual(request.controlPoints[0])
      expect(result.plannedWaypoints.at(-1)).toEqual(request.controlPoints[1])
    })
    it('enforces one overall deadline across legs even when fetch ignores abort', async () => {
      vi.useFakeTimers()
      try {
        const fetch = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 5000)); return response() })
        const pending = new Service('http://mock', fetch).planRoadNetwork({ ...request, controlPoints: [...request.controlPoints, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }] })
        const rejection = expect(pending).rejects.toThrow('timeout')
        await vi.advanceTimersByTimeAsync(8000)
        await rejection
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fetch.mock.calls[1][1].signal.aborted).toBe(true)
        await vi.advanceTimersByTimeAsync(10000)
        expect(fetch).toHaveBeenCalledTimes(2)
      } finally { vi.useRealTimers() }
    })
    it('bounds a stalled JSON response body', async () => {
      vi.useFakeTimers()
      try {
        const pending = new Service('http://mock', async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })).planRoadNetwork(request)
        const rejection = expect(pending).rejects.toThrow('timeout')
        await vi.advanceTimersByTimeAsync(8000)
        await rejection
      } finally { vi.useRealTimers() }
    })
  })
}
