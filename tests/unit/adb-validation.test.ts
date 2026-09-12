import { describe, expect, it, vi } from 'vitest'
vi.mock('child_process', () => ({ execFile: vi.fn() }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
import { execFile } from 'child_process'
import { AdbService as Desktop } from '../../src/main/services/adb.service'
import { AdbService as Web } from '../../web/server/services/adb.service'

for (const Service of [Desktop, Web]) {
  describe(`${Service === Desktop ? 'desktop' : 'web'} ADB boundary`, () => {
    it.each([
      { lat: '0;id' }, { lng: 181 }, { accuracy: -1 }, { timestamp: Infinity },
      { speed: '1' }, { bearing: NaN }, { altitude: null }
    ])('rejects malformed location %j before invoking ADB', async (patch) => {
      const service = Object.create(Service.prototype)
      await expect(service.pushLocation('device', { lat: 0, lng: 0, altitude: 0, accuracy: 10, timestamp: 1, bearing: 0, speed: 0, ...patch })).rejects.toThrow('Invalid')
      expect(execFile).not.toHaveBeenCalled()
    })
    it.each([
      ['enableTcpip', ['device', '5555;id']],
      ['connectWifi', ['127.0.0.1', 65536]],
      ['connectWifi', ['127.0.0.1', 1.5]],
      ['setMasterLocationEnabled', ['device', 'true;id']],
      ['enableMockLocation', [null]],
      ['removeTestProvider', ['bad;serial']]
    ])('rejects malformed %s input before invoking ADB', async (method, args) => {
      const service = Object.create(Service.prototype)
      await expect(service[method as string](...args as unknown[])).rejects.toThrow('Invalid')
      expect(execFile).not.toHaveBeenCalled()
    })
    it('rejects malformed serial before invoking ADB', async () => {
      const service = Object.create(Service.prototype)
      await expect(service.pushLocation('device;id', { lat: 0, lng: 0, altitude: 0, accuracy: 10, timestamp: 1, bearing: 0, speed: 0 })).rejects.toThrow('Invalid device serial')
      expect(execFile).not.toHaveBeenCalled()
    })
  })
}
