import { describe, it, expect } from 'vitest'
import { RoutePlannerService } from '../../src/main/services/route-planner'
import type { RoutePlanRoadRequest } from '../../src/shared/types'

describe('RoutePlannerService', () => {
  it('requires at least 2 control points', async () => {
    const service = new RoutePlannerService('http://mock', async () => {
      throw new Error('should not call fetch')
    })

    await expect(
      service.planRoadNetwork({
        controlPoints: [{ lat: 25.03, lng: 121.56 }],
        profile: 'walk',
        loop: false
      })
    ).rejects.toThrow('at least 2 control points')
  })

  it('plans loop route with closure leg and connector warnings', async () => {
    const fetchCalls: string[] = []
    const service = new RoutePlannerService('http://mock', async (url: string) => {
      fetchCalls.push(url)
      const coordinatePart = url.split('/route/v1/walking/')[1].split('?')[0]
      const [fromRaw, toRaw] = coordinatePart.split(';')
      const [fromLng, fromLat] = fromRaw.split(',').map(Number)
      const [toLng, toLat] = toRaw.split(',').map(Number)

      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 'Ok',
          routes: [{
            distance: 1200,
            duration: 900,
            geometry: {
              coordinates: [
                [fromLng + 0.002, fromLat + 0.002],
                [toLng - 0.002, toLat - 0.002]
              ]
            }
          }]
        })
      }
    })

    const request: RoutePlanRoadRequest = {
      controlPoints: [
        { lat: 25.033, lng: 121.565 },
        { lat: 25.036, lng: 121.57 },
        { lat: 25.04, lng: 121.575 }
      ],
      profile: 'walk',
      loop: true
    }

    const result = await service.planRoadNetwork(request)

    expect(fetchCalls).toHaveLength(3)
    expect(result.legSummaries).toHaveLength(3)
    expect(result.plannedWaypoints.length).toBeGreaterThan(request.controlPoints.length)
    expect(result.plannedWaypoints[0].lat).toBeCloseTo(request.controlPoints[0].lat, 6)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.totalDistanceKm).toBeGreaterThan(3)
    expect(result.totalDurationSec).toBeGreaterThan(2000)
  })

  it('downsamples very dense planned geometry', async () => {
    const service = new RoutePlannerService('http://mock', async () => {
      const coordinates: Array<[number, number]> = []
      for (let i = 0; i < 4000; i++) {
        coordinates.push([121.56 + i * 0.00001, 25.03 + i * 0.00001])
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 'Ok',
          routes: [{
            distance: 8000,
            duration: 3600,
            geometry: { coordinates }
          }]
        })
      }
    })

    const result = await service.planRoadNetwork({
      controlPoints: [
        { lat: 25.03, lng: 121.56 },
        { lat: 25.07, lng: 121.6 }
      ],
      profile: 'drive',
      loop: false
    })

    expect(result.plannedWaypoints.length).toBeLessThanOrEqual(2500)
    expect(result.plannedWaypoints.length).toBeGreaterThan(2)
  })
})
