import { describe, expect, it } from 'vitest'
import { MAX_GPX_BYTES, parseGpx } from '../../src/shared/gpx'

describe('shared GPX parser', () => {
  it('reads track segments, routes and optional elevations', () => {
    expect(parseGpx('<gpx><trk><trkseg><trkpt lat="1" lon="2"><ele>0</ele></trkpt></trkseg><trkseg><trkpt lat="3" lon="4"/></trkseg></trk><rte><rtept lat="5" lon="6"><ele>-5</ele></rtept></rte></gpx>')).toEqual([
      { lat: 1, lng: 2, altitude: 0 }, { lat: 3, lng: 4, altitude: 0 }, { lat: 5, lng: 6, altitude: -5 }
    ])
    expect(parseGpx('<gpx><wpt lat="-90" lon="180"/></gpx>')).toEqual([{ lat: -90, lng: 180, altitude: 0 }])
  })
  it.each(['NaN', 'Infinity', '91', '1oops', ''])('rejects invalid latitude %s', (lat) => {
    expect(() => parseGpx(`<gpx><rte><rtept lat="${lat}" lon="0"/></rte></gpx>`)).toThrow()
  })
  it('rejects invalid longitude, elevation, XML, non-text and oversized UTF-8 input', () => {
    for (const xml of ['<gpx><wpt lat="0" lon="181"/></gpx>', '<gpx><wpt lat="0" lon="1"><ele>Infinity</ele></wpt></gpx>', '<gpx>', '<!DOCTYPE gpx><gpx/>', null, 'é'.repeat(MAX_GPX_BYTES / 2 + 1)]) {
      expect(() => parseGpx(xml)).toThrow()
    }
  })
  it('keeps both endpoints and at most 2500 points', () => {
    const points = Array.from({ length: 10001 }, (_, i) => `<trkpt lat="0" lon="${i / 1000}"/>`).join('')
    const result = parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`)
    expect(result).toHaveLength(2500)
    expect(result[0].lng).toBe(0)
    expect(result.at(-1)?.lng).toBe(10)
  })
})
