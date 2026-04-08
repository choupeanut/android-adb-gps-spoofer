import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import type { RouteWaypoint } from '@shared/types'

export function registerGpxHandlers(): void {
  ipcMain.handle('import-gpx', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import GPX Route',
      filters: [{ name: 'GPX Files', extensions: ['gpx'] }],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) return null

    try {
      const content = readFileSync(filePaths[0], 'utf8')
      return parseGpx(content)
    } catch (err) {
      console.error('GPX parse error:', err)
      return null
    }
  })
}

function parseGpx(content: string): RouteWaypoint[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const parsed = parser.parse(content)
  const gpx = parsed.gpx
  if (!gpx) return []

  const waypoints: RouteWaypoint[] = []

  // Parse track points (most common)
  const trk = gpx.trk
  if (trk) {
    const trkArray = Array.isArray(trk) ? trk : [trk]
    for (const track of trkArray) {
      const trkseg = track.trkseg
      const segments = Array.isArray(trkseg) ? trkseg : [trkseg]
      for (const seg of segments) {
        const trkpts = seg?.trkpt
        if (!trkpts) continue
        const pts = Array.isArray(trkpts) ? trkpts : [trkpts]
        for (const pt of pts) {
          const lat = parseFloat(pt['@_lat'])
          const lng = parseFloat(pt['@_lon'])
          if (!isNaN(lat) && !isNaN(lng)) {
            waypoints.push({ lat, lng, altitude: pt.ele ? parseFloat(pt.ele) : 0 })
          }
        }
      }
    }
  }

  // Fallback: parse waypoints
  if (waypoints.length === 0 && gpx.wpt) {
    const wpts = Array.isArray(gpx.wpt) ? gpx.wpt : [gpx.wpt]
    for (const wpt of wpts) {
      const lat = parseFloat(wpt['@_lat'])
      const lng = parseFloat(wpt['@_lon'])
      if (!isNaN(lat) && !isNaN(lng)) {
        waypoints.push({ lat, lng, altitude: wpt.ele ? parseFloat(wpt.ele) : 0 })
      }
    }
  }

  // Downsample if too many points (keep max 1000)
  if (waypoints.length > 1000) {
    const step = Math.ceil(waypoints.length / 1000)
    return waypoints.filter((_, i) => i % step === 0)
  }

  return waypoints
}
