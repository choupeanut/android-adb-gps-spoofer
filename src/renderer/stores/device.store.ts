import { create } from 'zustand'
import type { DeviceInfo } from '@shared/types'

interface DeviceState {
  devices: DeviceInfo[]
  activeDevice: string | null
  selectedSerials: string[]
  setDevices: (devices: DeviceInfo[]) => void
  setActiveDevice: (serial: string | null) => void
  selectDevice: (serial: string) => void
  toggleSelectSerial: (serial: string) => void
  selectAll: () => void
  clearSelection: () => void
  /** Returns selectedSerials if non-empty, else [activeDevice] */
  getTargetSerials: () => string[]
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  activeDevice: null,
  selectedSerials: [],

  setDevices: (devices) =>
    set((s) => {
      const connected = new Set(
        devices.filter((d) => d.status === 'connected').map((d) => d.serial)
      )
      return {
        devices,
        selectedSerials: s.selectedSerials.filter((serial) => connected.has(serial))
      }
    }),

  setActiveDevice: (activeDevice) => set({ activeDevice }),

  selectDevice: (serial) => {
    window.api.setActiveDevice(serial)
    set({ activeDevice: serial, selectedSerials: [] })
  },

  toggleSelectSerial: (serial) =>
    set((s) => ({
      selectedSerials: s.selectedSerials.includes(serial)
        ? s.selectedSerials.filter((x) => x !== serial)
        : [...s.selectedSerials, serial]
    })),

  selectAll: () =>
    set((s) => ({
      selectedSerials: s.devices
        .filter((d) => d.status === 'connected')
        .map((d) => d.serial)
    })),

  clearSelection: () => set({ selectedSerials: [] }),

  getTargetSerials: () => {
    const { selectedSerials, activeDevice } = get()
    if (selectedSerials.length > 0) return selectedSerials
    return activeDevice ? [activeDevice] : []
  }
}))
