import { create } from 'zustand'
import type { RouteWaypoint } from '@shared/types'

interface RouteState {
  waypoints: RouteWaypoint[]
  playing: boolean
  isPaused: boolean
  loop: boolean
  wandering: boolean
  currentIndex: number
  progressFraction: number
  speedMs: number
  returnOnFinish: boolean
  startFromRealGps: boolean
  wanderEnabled: boolean
  wanderRadiusM: number
  addWaypoint: (wp: RouteWaypoint) => void
  removeWaypoint: (index: number) => void
  clearWaypoints: () => void
  setWaypoints: (waypoints: RouteWaypoint[]) => void
  setPlaying: (playing: boolean) => void
  setIsPaused: (isPaused: boolean) => void
  setLoop: (loop: boolean) => void
  setWandering: (wandering: boolean) => void
  setSpeedMs: (speed: number) => void
  setRouteProgress: (index: number, fraction: number) => void
  setReturnOnFinish: (v: boolean) => void
  setStartFromRealGps: (v: boolean) => void
  setWanderEnabled: (v: boolean) => void
  setWanderRadiusM: (v: number) => void
}

export const useRouteStore = create<RouteState>((set) => ({
  waypoints: [],
  playing: false,
  isPaused: false,
  loop: false,
  wandering: false,
  currentIndex: 0,
  progressFraction: 0,
  speedMs: 1.4,
  returnOnFinish: false,
  startFromRealGps: false,
  wanderEnabled: false,
  wanderRadiusM: 100,
  addWaypoint: (wp) =>
    set((s) => ({ waypoints: [...s.waypoints, wp] })),
  removeWaypoint: (index) =>
    set((s) => ({ waypoints: s.waypoints.filter((_, i) => i !== index) })),
  clearWaypoints: () => set({ waypoints: [], playing: false, isPaused: false, currentIndex: 0, progressFraction: 0 }),
  setWaypoints: (waypoints) => set({ waypoints }),
  setPlaying: (playing) => set({ playing }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setLoop: (loop) => set({ loop }),
  setWandering: (wandering) => set({ wandering }),
  setSpeedMs: (speedMs) => set({ speedMs }),
  setRouteProgress: (currentIndex, progressFraction) => set({ currentIndex, progressFraction }),
  setReturnOnFinish: (returnOnFinish) => set({ returnOnFinish }),
  setStartFromRealGps: (startFromRealGps) => set({ startFromRealGps }),
  setWanderEnabled: (wanderEnabled) => set({ wanderEnabled }),
  setWanderRadiusM: (wanderRadiusM) => set({ wanderRadiusM })
}))
