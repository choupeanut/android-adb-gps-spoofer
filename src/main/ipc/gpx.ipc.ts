import { ipcMain, dialog } from 'electron'
import { readFileSync, statSync } from 'fs'
import { MAX_GPX_BYTES, parseGpx } from '../../shared/gpx'

export function registerGpxHandlers(): void {
  ipcMain.handle('import-gpx', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import GPX Route',
      filters: [{ name: 'GPX Files', extensions: ['gpx'] }],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) return null

    try {
      if (statSync(filePaths[0]).size > MAX_GPX_BYTES) throw new Error('GPX exceeds 5 MiB')
      const content = readFileSync(filePaths[0], 'utf8')
      return parseGpx(content)
    } catch (err) {
      console.error('GPX parse error:', err)
      return null
    }
  })
}
