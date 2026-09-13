import { settingsFingerprint } from './lib/session-settings'
import { createRouteCompletion } from './lib/route-completion'
import { useEffect, useRef, useCallback, useState, type JSX } from 'react'
import { MapView } from './components/map/MapView'
import { TopBar } from './components/TopBar'
import { FloatingControlPanel } from './components/layout/FloatingControlPanel'
import { JoystickFloating } from './components/layout/JoystickFloating'
import { BottomSheet } from './components/panels/BottomSheet'
import { useBreakpoint } from './hooks/useBreakpoint'
import { DisplayEvents } from './lib/display-events'
import { useDeviceStore, getDisplayedSerial } from './stores/device.store'
import { useLocationStore } from './stores/location.store'
import { useLogStore } from './stores/log.store'
import { useRouteStore } from './stores/route.store'

export default function App(): JSX.Element {
  const setDevices = useDeviceStore((s) => s.setDevices)
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice)
  const activeDevice = useDeviceStore((s) => s.selectedSerials.length ? (s.activeDevice && s.selectedSerials.includes(s.activeDevice) ? s.activeDevice : s.selectedSerials[0]) : s.activeDevice)
  const devices = useDeviceStore((s) => s.devices)

  const setLocation = useLocationStore((s) => s.setLocation)
  const setMode = useLocationStore((s) => s.setMode)
  const setRealGpsLocation = useLocationStore((s) => s.setRealGpsLocation)
  const setAllDeviceLocations = useLocationStore((s) => s.setAllDeviceLocations)

  const addEntry = useLogStore((s) => s.addEntry)

  const setRouteProgress = useRouteStore((s) => s.setRouteProgress)
  const setPlaying = useRouteStore((s) => s.setPlaying)
  const setWandering = useRouteStore((s) => s.setWandering)
  const setSpeedMs = useRouteStore((s) => s.setSpeedMs)
  const setFixedSpeed = useRouteStore((s) => s.setFixedSpeed)
  const setLoop = useRouteStore((s) => s.setLoop)
  const setWanderEnabled = useRouteStore((s) => s.setWanderEnabled)
  const setWanderRadiusM = useRouteStore((s) => s.setWanderRadiusM)
  const setRouteMode = useRouteStore((s) => s.setRouteMode)
  const setRouteProfile = useRouteStore((s) => s.setRouteProfile)
  const setControlPoints = useRouteStore((s) => s.setControlPoints)
  const setWaypoints = useRouteStore((s) => s.setWaypoints)
  const setReturnOnFinish = useRouteStore((s) => s.setReturnOnFinish)
  const setStartFromRealGps = useRouteStore((s) => s.setStartFromRealGps)
  const routeMode = useRouteStore((s) => s.routeMode)
  const routeProfile = useRouteStore((s) => s.routeProfile)
  const controlPoints = useRouteStore((s) => s.controlPoints)
  const speedMs = useRouteStore((s) => s.speedMs)
  const fixedSpeed = useRouteStore((s) => s.fixedSpeed)
  const loop = useRouteStore((s) => s.loop)
  const wanderEnabled = useRouteStore((s) => s.wanderEnabled)
  const wanderRadiusM = useRouteStore((s) => s.wanderRadiusM)
  const returnOnFinish = useRouteStore((s) => s.returnOnFinish)
  const startFromRealGps = useRouteStore((s) => s.startFromRealGps)

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'

  const [sessionLoaded, setSessionLoaded] = useState(false)

  // Debounced session save for client-only settings
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSaveSession = useCallback((data: Record<string, unknown>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.api.saveSession(data).catch((error) => useLogStore.getState().addEntry({ ts: Date.now(), level: 'error', msg: `Session save failed: ${error}` }))
    }, 600)
  }, [])

  // Load session on mount and hydrate client-only store fields
  useEffect(() => {
    const initialSettings = settingsFingerprint(useRouteStore.getState())
    let cancelled = false
    ;(window.api.getSession() as Promise<any>).then((s: any) => {
      if (!s || cancelled || settingsFingerprint(useRouteStore.getState()) !== initialSettings) return
      if (typeof s.speedMs === 'number') setSpeedMs(s.speedMs)
      if (typeof s.fixedSpeed === 'boolean') setFixedSpeed(s.fixedSpeed)
      if (typeof s.loop === 'boolean') setLoop(s.loop)
      if (typeof s.wanderEnabled === 'boolean') setWanderEnabled(s.wanderEnabled)
      if (typeof s.wanderRadiusM === 'number') setWanderRadiusM(s.wanderRadiusM)
      if (s.routeMode === 'manual' || s.routeMode === 'road-network') setRouteMode(s.routeMode)
      if (s.routeProfile === 'walk' || s.routeProfile === 'cycle' || s.routeProfile === 'drive') {
        setRouteProfile(s.routeProfile)
      }
      if (Array.isArray(s.controlPoints)) setControlPoints(s.controlPoints)
      if (Array.isArray(s.waypoints) && s.routeMode === 'manual') setWaypoints(s.waypoints)
      if (typeof s.returnOnFinish === 'boolean') setReturnOnFinish(s.returnOnFinish)
      if (typeof s.startFromRealGps === 'boolean') setStartFromRealGps(s.startFromRealGps)
    }).catch((error) => addEntry({ ts: Date.now(), level: 'error', msg: `Session load failed: ${error}` })).finally(() => { if (!cancelled) setSessionLoaded(true) })
    return () => { cancelled = true }
  }, [
    setSpeedMs,
    setFixedSpeed,
    setLoop,
    setWanderEnabled,
    setWanderRadiusM,
    setRouteMode,
    setRouteProfile,
    setControlPoints,
    setWaypoints,
    setReturnOnFinish,
    setStartFromRealGps
  ])

  // Save client-only settings when they change
  useEffect(() => {
    if (!sessionLoaded) return
    scheduleSaveSession({
      speedMs,
      fixedSpeed,
      loop,
      wanderEnabled,
      wanderRadiusM,
      routeMode,
      routeProfile,
      controlPoints,
      waypoints: routeMode === 'manual' ? controlPoints : undefined,
      returnOnFinish,
      startFromRealGps
    })
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [
    speedMs,
    fixedSpeed,
    loop,
    wanderEnabled,
    wanderRadiusM,
    routeMode,
    routeProfile,
    controlPoints,
    returnOnFinish,
    startFromRealGps,
    sessionLoaded,
    scheduleSaveSession
  ])

  // Core IPC subscriptions
  useEffect(() => {
    const gate = new DisplayEvents(getDisplayedSerial)
    let disposed = false
    const report = (error: unknown): void => addEntry({ ts: Date.now(), level: 'error', msg: String(error) })
    const completion = createRouteCompletion(window.api, () => useRouteStore.getState(), report)
    const apply = (data: any): void => {
      if (disposed || !data) return
      completion.accept(data)
      if (disposed || !data || !gate.accept(data)) return
      if (Object.prototype.hasOwnProperty.call(data, 'location')) {
        setLocation(data.location ?? null)
        setMode(data.mode ?? (data.location ? 'route' : 'idle'))
      }
      if (!data.state) return
      const state = data.state
      setRouteProgress(state.currentWaypointIndex, state.progressFraction)
      setPlaying(state.playing)
      useRouteStore.getState().setIsPaused(state.isPaused ?? state.paused ?? (!state.playing && !state.finishedNaturally && !!data.location && data.mode !== 'joystick'))
      setWandering(state.wandering ?? false)

    }
    const hydrate = async (): Promise<void> => {
      const serial = getDisplayedSerial()
      if (!serial) { setLocation(null); setPlaying(false); setWandering(false); return }
      const current = gate.ticket()
      try {
        const [snapshot, state]: any[] = await Promise.all([window.api.getLocationState(serial), window.api.routeGetState(serial)])
        if (!disposed && current()) apply({ ...snapshot, serial, state })
      } catch (error) { report(error) }
    }
    const unsubSelection = useDeviceStore.subscribe((state, previous) => {
      if (state.activeDevice !== previous.activeDevice || state.selectedSerials !== previous.selectedSerials) {
        gate.invalidate()
        const previousOwner = previous.selectedSerials.length
          ? (previous.activeDevice && previous.selectedSerials.includes(previous.activeDevice) ? previous.activeDevice : previous.selectedSerials[0])
          : previous.activeDevice
        if (previousOwner !== getDisplayedSerial()) {
          setLocation(null)
          setPlaying(false)
          useRouteStore.getState().setIsPaused(false)
          setWandering(false)
          setRealGpsLocation(null)
          void hydrate()
        }
      }
    })
    let deviceEpoch = 0
    const deviceTicket = deviceEpoch
    void window.api.getDevices().then((data) => {
      if (disposed || deviceTicket !== deviceEpoch) return
      setDevices(data.devices)
      setActiveDevice(data.activeDevice)
      void hydrate()
    }).catch(report)
    const unsubConnection = window.api.onConnectionChanged(() => {
      gate.reset()
      deviceEpoch++
      completion.reset()
      void hydrate()
    })
    const unsubDevices = window.api.onDevicesChanged((data: any) => {
      deviceEpoch++
      setDevices(data.devices)
      setActiveDevice(data.activeDevice)
    })
    const unsubLocation = window.api.onLocationUpdated(apply)
    const unsubRoute = window.api.onRouteUpdated(apply)

    const unsubLog = window.api.onLogEntry((entry: any) => {
      addEntry(entry)
    })

    return () => {
      disposed = true
      completion.dispose()
      gate.reset()
      unsubSelection()
      unsubConnection()
      unsubDevices()
      unsubLocation()
      unsubRoute()
      unsubLog()
    }
  }, [setDevices, setActiveDevice, setLocation, setMode, addEntry, setRouteProgress, setPlaying, setWandering])

  // Fetch real GPS whenever the active device changes.
  useEffect(() => {
    if (!activeDevice) {
      setRealGpsLocation(null)
      return
    }
    const device = devices.find((d) => d.serial === activeDevice)
    if (device?.status !== 'connected') {
      setRealGpsLocation(null)
      return
    }

    let cancelled = false
    const fetchGps = async (): Promise<void> => {
      const loc: any = await window.api.getRealLocation(activeDevice)
      if (cancelled) return
      if (loc) {
        setRealGpsLocation(loc)
      } else {
        setTimeout(async () => {
          if (cancelled) return
          try {
            const retry: any = await window.api.getRealLocation(activeDevice)
            if (!cancelled) setRealGpsLocation(retry ?? null)
          } catch (error) { addEntry({ ts: Date.now(), level: 'error', msg: `GPS retry failed: ${error}` }) }
        }, 3000)
      }
    }
    void fetchGps().catch((error) => addEntry({ ts: Date.now(), level: 'error', msg: `GPS read failed: ${error}` }))
    return () => { cancelled = true }
  }, [activeDevice, devices, setRealGpsLocation])

  // Periodically fetch real GPS for ALL connected devices (for multi-device markers).
  useEffect(() => {
    const connectedCount = devices.filter((d) => d.status === 'connected').length
    if (connectedCount < 2) {
      setAllDeviceLocations({})
      return
    }
    let cancelled = false

    const fetchAll = async (): Promise<void> => {
      const locs: Record<string, { lat: number; lng: number } | null> =
        await window.api.getAllRealLocations()
      if (cancelled) return
      const clean: Record<string, { lat: number; lng: number }> = {}
      for (const [serial, loc] of Object.entries(locs)) {
        if (loc) clean[serial] = loc
      }
      setAllDeviceLocations(clean)
    }

    void fetchAll().catch((error) => addEntry({ ts: Date.now(), level: 'error', msg: `GPS read failed: ${error}` }))
    const interval = setInterval(() => void fetchAll().catch((error) => addEntry({ ts: Date.now(), level: 'error', msg: `GPS read failed: ${error}` })), 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [devices, setAllDeviceLocations])

  // Desktop: TopBar + Floating Panels + Full-screen Map
  // Mobile:  TopBar + Map + BottomSheet
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      <TopBar />
      
      {/* Full-screen map as base layer */}
      <main className="flex-1 relative overflow-hidden">
        <MapView />
        
        {/* Floating panels overlay (desktop + tablet) */}
        {!isMobile && (
          <>
            <FloatingControlPanel />
            <JoystickFloating />
          </>
        )}
      </main>
      
      {/* Mobile bottom sheet */}
      {isMobile && <BottomSheet />}
    </div>
  )
}
