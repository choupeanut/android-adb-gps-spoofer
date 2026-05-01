import { create } from 'zustand'
import type {
  RouteMode,
  RoutePlanRoadResponse,
  RoutePlanStatus,
  RouteProfile,
  RouteWaypoint
} from '@shared/types'

interface RouteState {
  // Playback route consumed by RouteEngine
  waypoints: RouteWaypoint[]

  // User-editable points in UI
  controlPoints: RouteWaypoint[]

  // Planner output (road-network mode)
  plannedWaypoints: RouteWaypoint[]
  plannedTotalDistanceKm: number
  plannedTotalDurationSec: number
  planWarnings: string[]

  routeMode: RouteMode
  routeProfile: RouteProfile
  planStatus: RoutePlanStatus
  planError: string | null

  playing: boolean
  isPaused: boolean
  loop: boolean
  wandering: boolean
  currentIndex: number
  progressFraction: number
  speedMs: number
  fixedSpeed: boolean
  returnOnFinish: boolean
  startFromRealGps: boolean
  wanderEnabled: boolean
  wanderRadiusM: number

  addControlPoint: (wp: RouteWaypoint) => void
  removeControlPoint: (index: number) => void
  setControlPoints: (points: RouteWaypoint[]) => void
  clearWaypoints: () => void

  // Backward-compatible aliases used by existing components
  addWaypoint: (wp: RouteWaypoint) => void
  removeWaypoint: (index: number) => void

  setWaypoints: (waypoints: RouteWaypoint[]) => void
  setPlannedRoute: (result: RoutePlanRoadResponse) => void
  clearPlannedRoute: () => void
  setRouteMode: (mode: RouteMode) => void
  setRouteProfile: (profile: RouteProfile) => void
  setPlanStatus: (status: RoutePlanStatus, error?: string | null) => void

  setPlaying: (playing: boolean) => void
  setIsPaused: (isPaused: boolean) => void
  setLoop: (loop: boolean) => void
  setWandering: (wandering: boolean) => void
  setSpeedMs: (speed: number) => void
  setFixedSpeed: (fixedSpeed: boolean) => void
  setRouteProgress: (index: number, fraction: number) => void
  setReturnOnFinish: (v: boolean) => void
  setStartFromRealGps: (v: boolean) => void
  setWanderEnabled: (v: boolean) => void
  setWanderRadiusM: (v: number) => void
}

export const useRouteStore = create<RouteState>((set, get) => ({
  waypoints: [],
  controlPoints: [],
  plannedWaypoints: [],
  plannedTotalDistanceKm: 0,
  plannedTotalDurationSec: 0,
  planWarnings: [],
  routeMode: 'manual',
  routeProfile: 'walk',
  planStatus: 'idle',
  planError: null,

  playing: false,
  isPaused: false,
  loop: false,
  wandering: false,
  currentIndex: 0,
  progressFraction: 0,
  speedMs: 1.4,
  fixedSpeed: false,
  returnOnFinish: false,
  startFromRealGps: false,
  wanderEnabled: false,
  wanderRadiusM: 100,

  addControlPoint: (wp) =>
    set((s) => {
      const controlPoints = [...s.controlPoints, wp]
      if (s.routeMode === 'manual') {
        return {
          controlPoints,
          waypoints: controlPoints,
          plannedWaypoints: [],
          plannedTotalDistanceKm: 0,
          plannedTotalDurationSec: 0,
          planWarnings: [],
          planStatus: 'idle',
          planError: null
        }
      }
      return { controlPoints }
    }),

  removeControlPoint: (index) =>
    set((s) => {
      const controlPoints = s.controlPoints.filter((_, i) => i !== index)
      if (s.routeMode === 'manual') {
        return {
          controlPoints,
          waypoints: controlPoints,
          plannedWaypoints: [],
          plannedTotalDistanceKm: 0,
          plannedTotalDurationSec: 0,
          planWarnings: [],
          planStatus: 'idle',
          planError: null
        }
      }
      return { controlPoints }
    }),

  setControlPoints: (controlPoints) =>
    set((s) => {
      if (s.routeMode === 'manual') {
        return {
          controlPoints,
          waypoints: controlPoints,
          plannedWaypoints: [],
          plannedTotalDistanceKm: 0,
          plannedTotalDurationSec: 0,
          planWarnings: [],
          planStatus: 'idle',
          planError: null
        }
      }
      return { controlPoints }
    }),

  clearWaypoints: () =>
    set({
      waypoints: [],
      controlPoints: [],
      plannedWaypoints: [],
      plannedTotalDistanceKm: 0,
      plannedTotalDurationSec: 0,
      planWarnings: [],
      planStatus: 'idle',
      planError: null,
      playing: false,
      isPaused: false,
      currentIndex: 0,
      progressFraction: 0
    }),

  addWaypoint: (wp) => get().addControlPoint(wp),
  removeWaypoint: (index) => get().removeControlPoint(index),

  setWaypoints: (waypoints) =>
    set((s) => {
      if (s.routeMode === 'manual') {
        return { waypoints, controlPoints: waypoints }
      }
      return { waypoints }
    }),

  setPlannedRoute: (result) =>
    set({
      plannedWaypoints: result.plannedWaypoints,
      plannedTotalDistanceKm: result.totalDistanceKm,
      plannedTotalDurationSec: result.totalDurationSec,
      planWarnings: result.warnings,
      waypoints: result.plannedWaypoints,
      planStatus: 'success',
      planError: null
    }),

  clearPlannedRoute: () =>
    set((s) => ({
      plannedWaypoints: [],
      plannedTotalDistanceKm: 0,
      plannedTotalDurationSec: 0,
      planWarnings: [],
      waypoints: s.routeMode === 'manual' ? s.controlPoints : [],
      planStatus: 'idle',
      planError: null
    })),

  setRouteMode: (routeMode) =>
    set((s) => {
      if (routeMode === 'manual') {
        return {
          routeMode,
          waypoints: s.controlPoints,
          plannedWaypoints: [],
          plannedTotalDistanceKm: 0,
          plannedTotalDurationSec: 0,
          planWarnings: [],
          planStatus: 'idle',
          planError: null
        }
      }

      return {
        routeMode,
        waypoints: s.plannedWaypoints,
        planStatus: s.plannedWaypoints.length > 1 ? 'success' : 'idle'
      }
    }),

  setRouteProfile: (routeProfile) => set({ routeProfile }),

  setPlanStatus: (planStatus, planError = null) => set({ planStatus, planError }),

  setPlaying: (playing) => set({ playing }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setLoop: (loop) => set({ loop }),
  setWandering: (wandering) => set({ wandering }),
  setSpeedMs: (speedMs) => set({ speedMs }),
  setFixedSpeed: (fixedSpeed) => set({ fixedSpeed }),
  setRouteProgress: (currentIndex, progressFraction) => set({ currentIndex, progressFraction }),
  setReturnOnFinish: (returnOnFinish) => set({ returnOnFinish }),
  setStartFromRealGps: (startFromRealGps) => set({ startFromRealGps }),
  setWanderEnabled: (wanderEnabled) => set({ wanderEnabled }),
  setWanderRadiusM: (wanderRadiusM) => set({ wanderRadiusM })
}))
