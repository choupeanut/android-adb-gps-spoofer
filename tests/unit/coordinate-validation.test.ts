import { describe, expect, it } from 'vitest'
import {
  isValidCoordinates,
  isValidLatitude,
  isValidLongitude,
  parseCoordinateInput,
  parseCoordinatePair
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

describe('pasted coordinate pairs', () => {
  it.each(['25.033,121.565', ' 25.033 , 121.565 ', '25.033 121.565', '25.033\t\n121.565'])(
    'parses %s in latitude longitude order', (value) => {
      expect(parseCoordinatePair(value)).toEqual({ lat: 25.033, lng: 121.565 })
    }
  )
  it('accepts negative values, zero and boundaries', () => {
    expect(parseCoordinatePair('-90,180')).toEqual({ lat: -90, lng: 180 })
    expect(parseCoordinatePair('0 -.5')).toEqual({ lat: 0, lng: -0.5 })
  })
  it.each(['', '25', '25,', ',121', '25,,121', '25 121 0', '91,121', '25,-181',
    'NaN,121', '25abc,121', '25 1,121', '25,121,', '25;121'])(
    'rejects malformed or incomplete pair %s', (value) => expect(parseCoordinatePair(value)).toBeNull()
  )
})
