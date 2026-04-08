import { describe, it, expect } from 'vitest'
import { getCooldownMinutes, getCooldownBetweenPoints } from '../../src/main/utils/cooldown'

describe('getCooldownMinutes', () => {
  it('returns 0 for distance 0', () => {
    expect(getCooldownMinutes(0)).toBe(0)
  })

  it('returns 0.5 for 1km', () => {
    expect(getCooldownMinutes(1)).toBeCloseTo(0.5, 1)
  })

  it('returns 120 for very long distance', () => {
    expect(getCooldownMinutes(2000)).toBe(120)
  })

  it('interpolates between table entries', () => {
    // Between 1km (0.5min) and 2km (1min): at 1.5km should be ~0.75min
    const result = getCooldownMinutes(1.5)
    expect(result).toBeGreaterThan(0.5)
    expect(result).toBeLessThan(1)
    expect(result).toBeCloseTo(0.75, 1)
  })

  it('returns cap at max table distance', () => {
    expect(getCooldownMinutes(5000)).toBe(120)
  })
})

describe('getCooldownBetweenPoints', () => {
  it('returns 0 wait for same point', () => {
    const result = getCooldownBetweenPoints(25.033, 121.565, 25.033, 121.565)
    expect(result.distanceKm).toBe(0)
    expect(result.waitMinutes).toBe(0)
  })

  it('returns correct structure', () => {
    const result = getCooldownBetweenPoints(0, 0, 0, 1)
    expect(result).toHaveProperty('distanceKm')
    expect(result).toHaveProperty('waitMinutes')
    expect(result.distanceKm).toBeGreaterThan(0)
  })
})
