import { create } from 'zustand'

/** Which action a map click performs. */
export type MapClickMode = 'teleport' | 'route'

/** Mobile bottom-sheet tab. */
export type Tab = 'teleport' | 'route'

interface UiState {
  /** Mobile bottom-sheet tab. */
  activeTab: Tab
  setActiveTab: (tab: Tab) => void

  /** Determines map-click behaviour on desktop (teleport marker vs add waypoint). */
  mapClickMode: MapClickMode
  setMapClickMode: (mode: MapClickMode) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'teleport',
  setActiveTab: (activeTab) => set({ activeTab }),

  mapClickMode: 'teleport',
  setMapClickMode: (mapClickMode) => set({ mapClickMode })
}))
