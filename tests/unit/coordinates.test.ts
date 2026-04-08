import { describe, it, expect } from 'vitest'
import { haversineDistance, bearing, destinationPoint, interpolatePoints } from '../../src/main/utils/coordinates'

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(25.033, 121.565, 25.033, 121.565)).toBe(0)
  })

  it('calculates approx distance Taipei to Tokyo (~2100 km)', () => {
    const dist = haversineDistance(25.033, 121.565, 35.689, 139.692)
    expect(dist).toBeGreaterThan(2000)
    expect(dist).toBeLessThan(2300)
  })

  it('is symmetric', () => {
    const d1 = haversineDistance(0, 0, 1, 1)
    const d2 = haversineDistance(1, 1, 0, 0)
    expect(d1).toBeCloseTo(d2, 5)
  })
})

describe('bearing', () => {
  it('returns ~0 going north', () => {
    const b = bearing(0, 0, 1, 0)
    expect(b).toBeCloseTo(0, 0)
  })

  it('returns ~90 going east', () => {
    const b = bearing(0, 0, 0, 1)
    expect(b).toBeCloseTo(90, 0)
  })

  it('returns ~180 going south', () => {
    const b = bearing(1, 0, 0, 0)
    expect(b).toBeCloseTo(180, 0)
  })

  it('returns ~270 going west', () => {
    const b = bearing(0, 1, 0, 0)
    expect(b).toBeCloseTo(270, 0)
  })
})

describe('destinationPoint', () => {
  it('moves north by ~1km', () => {
    const result = destinationPoint(0, 0, 0, 0.001)
    expect(result.lat).toBeGreaterThan(0)
    expect(result.lng).toBeCloseTo(0, 3)
  })
})

describe('interpolatePoints', () => {
  it('returns start at fraction 0', () => {
    const r = interpolatePoints(0, 0, 10, 10, 0)
    expect(r.lat).toBe(0)
    expect(r.lng).toBe(0)
  })

  it('returns end at fraction 1', () => {
    const r = interpolatePoints(0, 0, 10, 10, 1)
    expect(r.lat).toBe(10)
    expect(r.lng).toBe(10)
  })

  it('returns midpoint at fraction 0.5', () => {
    const r = interpolatePoints(0, 0, 10, 20, 0.5)
    expect(r.lat).toBe(5)
    expect(r.lng).toBe(10)
  })
})
