import { beforeEach, describe, expect, it } from 'vitest'
import { useDeviceStore } from '../../src/renderer/stores/device.store'
import type { DeviceInfo } from '../../src/shared/types'
const device = (serial: string, status: DeviceInfo['status'] = 'connected'): DeviceInfo => ({
  serial, status, model: serial, connectionType: 'wifi'
})
describe('device selection across discovery updates', () => {
  beforeEach(() => useDeviceStore.setState({ devices: [], activeDevice: null, selectedSerials: [] }))
  it('retains selected absent and offline devices and restores their checked state', () => {
    const store = useDeviceStore.getState()
    store.setDevices([device('a'), device('b')])
    store.selectAll()
    store.setDevices([device('b', 'offline')])
    expect(useDeviceStore.getState().selectedSerials).toEqual(['a', 'b'])
    expect(useDeviceStore.getState().devices).toHaveLength(2)
    expect(useDeviceStore.getState().devices.every(d => d.status === 'offline')).toBe(true)
    store.setDevices([device('a'), device('b')])
    expect(store.getTargetSerials()).toEqual(['a', 'b'])
  })
  it('does not reselect a device explicitly unchecked while offline', () => {
    const store = useDeviceStore.getState()
    store.setDevices([device('a')])
    store.selectSerial('a')
    store.setDevices([])
    store.toggleSelectSerial('a')
    store.setDevices([device('a')])
    expect(useDeviceStore.getState().selectedSerials).toEqual([])
  })
})
