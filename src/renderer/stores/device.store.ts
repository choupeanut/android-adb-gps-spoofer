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
  selectSerial: (serial: string) => void
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
      const discovered = new Set(devices.map((device) => device.serial))
      // Selection is user intent; keep absent selected devices visible and removable.
      const missingSelected = s.devices.filter(
        (device) => s.selectedSerials.includes(device.serial) && !discovered.has(device.serial)
      ).map((device) => ({ ...device, status: 'offline' as const }))
      return { devices: [...devices, ...missingSelected] }
    }),

  setActiveDevice: (activeDevice) => set({ activeDevice }),

  selectDevice: (serial) => {
    window.api.setActiveDevice(serial).catch((error) => alert(`Device selection failed: ${error.message}`))
    set({ activeDevice: serial, selectedSerials: [] })
  },

  toggleSelectSerial: (serial) =>
    set((s) => ({
      selectedSerials: s.selectedSerials.includes(serial)
        ? s.selectedSerials.filter((x) => x !== serial)
        : [...s.selectedSerials, serial]
    })),

  selectSerial: (serial) =>
    set((s) => ({
      selectedSerials: s.selectedSerials.includes(serial)
        ? s.selectedSerials
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
    if (selectedSerials.length > 0) return [...selectedSerials]
    return activeDevice ? [activeDevice] : []
  }
}))

/** Exactly one selected member owns the displayed state. */
export function getDisplayedSerial(): string | undefined {
  const { activeDevice, selectedSerials } = useDeviceStore.getState()
  return selectedSerials.length ? (activeDevice && selectedSerials.includes(activeDevice) ? activeDevice : selectedSerials[0]) : activeDevice ?? undefined
}
