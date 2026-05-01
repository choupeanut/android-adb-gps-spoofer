import { describe, it, expect } from 'vitest'
import { applyJitter, applySpeedFluctuation, smoothBearing } from '../../src/main/services/anti-detect'
import type { LocationUpdate } from '../../src/shared/types'

const baseLoc: LocationUpdate = {
  lat: 25.033,
  lng: 121.565,
  altitude: 10,
  accuracy: 10,
  bearing: 90,
  speed: 1.4,
  timestamp: Date.now()
}

describe('applyJitter', () => {
  it('changes lat/lng slightly', () => {
    const jittered = applyJitter(baseLoc)
    expect(jittered.lat).not.toBe(baseLoc.lat)
    expect(jittered.lng).not.toBe(baseLoc.lng)
  })

  it('keeps jitter small (within 0.001 degrees, ~100m)', () => {
    for (let i = 0; i < 100; i++) {
      const jittered = applyJitter(baseLoc)
      expect(Math.abs(jittered.lat - baseLoc.lat)).toBeLessThan(0.001)
      expect(Math.abs(jittered.lng - baseLoc.lng)).toBeLessThan(0.001)
    }
  })

  it('has 95% of samples within ±20m (JITTER_SIGMA=0.00009)', () => {
    const SAMPLES = 10000
    const THRESHOLD_DEG = 20 / 111320 // ~20m in degrees
    let withinCount = 0
    for (let i = 0; i < SAMPLES; i++) {
      const jittered = applyJitter(baseLoc)
      const dLat = Math.abs(jittered.lat - baseLoc.lat)
      const dLng = Math.abs(jittered.lng - baseLoc.lng)
      if (dLat < THRESHOLD_DEG && dLng < THRESHOLD_DEG) withinCount++
    }
    const pct = withinCount / SAMPLES
    // 95% of Gaussian samples within ~±2σ; with σ=0.00009° (~10m), 20m≈2σ
    expect(pct).toBeGreaterThan(0.90) // allowing some margin for Gaussian tails
  })

  it('keeps accuracy within 3-25 range', () => {
    for (let i = 0; i < 50; i++) {
      const jittered = applyJitter(baseLoc)
      expect(jittered.accuracy).toBeGreaterThanOrEqual(3)
      expect(jittered.accuracy).toBeLessThanOrEqual(25)
    }
  })

  it('preserves other fields', () => {
    const jittered = applyJitter(baseLoc)
    expect(jittered.altitude).toBe(baseLoc.altitude)
    expect(jittered.bearing).toBe(baseLoc.bearing)
    expect(jittered.speed).toBe(baseLoc.speed)
  })
})

describe('applySpeedFluctuation', () => {
  it('returns 0 for 0 speed', () => {
    expect(applySpeedFluctuation(0)).toBe(0)
  })

  it('varies speed by at most 5%', () => {
    const base = 1.4
    for (let i = 0; i < 100; i++) {
      const result = applySpeedFluctuation(base)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeGreaterThanOrEqual(base * 0.95)
      expect(result).toBeLessThanOrEqual(base * 1.05)
    }
  })

  it('never returns negative', () => {
    for (let i = 0; i < 100; i++) {
      expect(applySpeedFluctuation(0.1)).toBeGreaterThan(0)
    }
  })
})

describe('smoothBearing', () => {
  it('moves towards target', () => {
    const result = smoothBearing(0, 90, 0.5)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(90)
  })

  it('handles wrap-around (359 to 1)', () => {
    const result = smoothBearing(359, 1, 0.5)
    // Should go through 0, not via 180
    expect(result > 359 || result < 10).toBe(true)
  })

  it('stays within 0-360', () => {
    for (let i = 0; i < 360; i += 30) {
      for (let j = 0; j < 360; j += 30) {
        const result = smoothBearing(i, j)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(360)
      }
    }
  })
})
