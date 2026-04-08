import { useEffect, useRef, useCallback } from 'react'
import { MapView } from './components/map/MapView'
import { TopBar } from './components/TopBar'
import { FloatingControlPanel } from './components/layout/FloatingControlPanel'
import { JoystickFloating } from './components/layout/JoystickFloating'
import { BottomSheet } from './components/panels/BottomSheet'
import { useBreakpoint } from './hooks/useBreakpoint'
import { useDeviceStore } from './stores/device.store'
import { useLocationStore } from './stores/location.store'
import { useLogStore } from './stores/log.store'
import { useRouteStore } from './stores/route.store'

export default function App(): JSX.Element {
  const setDevices = useDeviceStore((s) => s.setDevices)
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice)
  const activeDevice = useDeviceStore((s) => s.activeDevice)
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
  const setLoop = useRouteStore((s) => s.setLoop)
  const setWanderEnabled = useRouteStore((s) => s.setWanderEnabled)
  const setWanderRadiusM = useRouteStore((s) => s.setWanderRadiusM)
  const setReturnOnFinish = useRouteStore((s) => s.setReturnOnFinish)
  const setStartFromRealGps = useRouteStore((s) => s.setStartFromRealGps)
  const returnOnFinish = useRouteStore((s) => s.returnOnFinish)
  const startFromRealGps = useRouteStore((s) => s.startFromRealGps)

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'

  // Debounced session save for client-only settings
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSaveSession = useCallback((data: Record<string, unknown>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.api.saveSession(data).catch(() => {})
    }, 600)
  }, [])

  // Load session on mount and hydrate client-only store fields
  useEffect(() => {
    ;(window.api.getSession() as Promise<any>).then((s: any) => {
      if (!s) return
      if (typeof s.speedMs === 'number') setSpeedMs(s.speedMs)
      if (typeof s.loop === 'boolean') setLoop(s.loop)
      if (typeof s.wanderEnabled === 'boolean') setWanderEnabled(s.wanderEnabled)
      if (typeof s.wanderRadiusM === 'number') setWanderRadiusM(s.wanderRadiusM)
      if (typeof s.returnOnFinish === 'boolean') setReturnOnFinish(s.returnOnFinish)
      if (typeof s.startFromRealGps === 'boolean') setStartFromRealGps(s.startFromRealGps)
    }).catch(() => {})
  }, [setSpeedMs, setLoop, setWanderEnabled, setWanderRadiusM, setReturnOnFinish, setStartFromRealGps])

  // Save client-only settings when they change
  useEffect(() => {
    scheduleSaveSession({ returnOnFinish, startFromRealGps })
  }, [returnOnFinish, startFromRealGps, scheduleSaveSession])

  // Core IPC subscriptions
  useEffect(() => {
    window.api.getDevices().then((data) => {
      setDevices(data.devices)
      setActiveDevice(data.activeDevice)
    })

    const unsubDevices = window.api.onDevicesChanged((data: any) => {
      setDevices(data.devices)
      setActiveDevice(data.activeDevice)
    })

    const unsubLocation = window.api.onLocationUpdated((data: any) => {
      if (data.serial && data.serial !== useDeviceStore.getState().activeDevice) return
      setLocation(data.location)
      setMode(data.mode)
    })

    // Route events: drive the map marker AND route progress
    const unsubRoute = window.api.onRouteUpdated((data: any) => {
      if (data.serial && data.serial !== useDeviceStore.getState().activeDevice) return
      if (data.location) {
        setLocation(data.location)
        setMode('route')
      }
      if (data.state) {
        setRouteProgress(data.state.currentWaypointIndex, data.state.progressFraction)
        setPlaying(data.state.playing)
        setWandering(data.state.wandering ?? false)

        // Auto-return when route finishes naturally and not already wandering
        if (data.state.finishedNaturally && !data.state.wandering) {
          const { returnOnFinish, speedMs } = useRouteStore.getState()
          if (returnOnFinish) {
            const realGps = useLocationStore.getState().realGpsLocation
            if (realGps) {
              window.api.routeReturnToGps(realGps.lat, realGps.lng, speedMs)
            }
          }
        }
      }
    })

    const unsubLog = window.api.onLogEntry((entry: any) => {
      addEntry(entry)
    })

    return () => {
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
          const retry: any = await window.api.getRealLocation(activeDevice)
          if (!cancelled) setRealGpsLocation(retry ?? null)
        }, 3000)
      }
    }
    fetchGps()
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

    fetchAll()
    const interval = setInterval(fetchAll, 10000)
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
