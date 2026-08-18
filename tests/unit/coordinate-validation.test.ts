import { describe, expect, it } from 'vitest'
import {
  isValidCoordinates,
  isValidLatitude,
  isValidLongitude,
  parseCoordinateInput
} from '../../src/shared/coordinate-validation'

describe('coordinate validation', () => {
  it('parses only complete finite numbers', () => {
    expect(parseCoordinateInput(' 25.033964 ')).toBe(25.033964)
    expect(parseCoordinateInput('-.5')).toBe(-0.5)
    expect(parseCoordinateInput('25abc')).toBeNull()
    expect(parseCoordinateInput('')).toBeNull()
  })

  it('accepts geographic boundaries', () => {
    expect(isValidLatitude(-90)).toBe(true)
    expect(isValidLatitude(90)).toBe(true)
    expect(isValidLongitude(-180)).toBe(true)
    expect(isValidLongitude(180)).toBe(true)
    expect(isValidCoordinates(25.033, 121.565)).toBe(true)
  })

  it('rejects out-of-range and non-finite coordinates', () => {
    expect(isValidLatitude(90.0001)).toBe(false)
    expect(isValidLongitude(-180.0001)).toBe(false)
    expect(isValidCoordinates(Number.NaN, 121)).toBe(false)
  })
})
