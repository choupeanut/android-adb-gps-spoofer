import { create } from 'zustand'
import type { LocationUpdate, SpoofMode } from '@shared/types'

interface LocationState {
  location: LocationUpdate | null
  mode: SpoofMode
  realGpsLocation: { lat: number; lng: number } | null
  pendingTeleport: { lat: number; lng: number } | null

  /** Real GPS positions for all connected devices (serial → coords). */
  allDeviceLocations: Record<string, { lat: number; lng: number }>

  setLocation: (location: LocationUpdate | null) => void
  setMode: (mode: SpoofMode) => void
  setRealGpsLocation: (loc: { lat: number; lng: number } | null) => void
  setPendingTeleport: (pt: { lat: number; lng: number } | null) => void
  setAllDeviceLocations: (locs: Record<string, { lat: number; lng: number }>) => void
}

export const useLocationStore = create<LocationState>((set) => ({
  location: null,
  mode: 'idle',
  realGpsLocation: null,
  pendingTeleport: null,
  allDeviceLocations: {},
  setLocation: (location) => set({ location }),
  setMode: (mode) => set({ mode }),
  setRealGpsLocation: (realGpsLocation) => set({ realGpsLocation }),
  setPendingTeleport: (pendingTeleport) => set({ pendingTeleport }),
  setAllDeviceLocations: (allDeviceLocations) => set({ allDeviceLocations })
}))
