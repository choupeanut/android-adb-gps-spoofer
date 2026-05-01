import { useState, useEffect, useMemo, useRef } from 'react'
import { Play, Pause, CornerDownLeft, X, FileUp, Trash2, MapPin } from 'lucide-react'
import { useRouteStore } from '../../stores/route.store'
import { useDeviceStore } from '../../stores/device.store'
import { useLocationStore } from '../../stores/location.store'
import { haversineKm, getCooldownMinutes } from '@shared/geo'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Card } from '../ui/Card'
import { ToggleButton } from '../ui/ToggleButton'
import { Modal } from '../ui/Modal'

type EndMode = 'loop' | 'wander' | 'none'

export function RoutePanel(): JSX.Element {
  const waypoints = useRouteStore((s) => s.waypoints)
  const controlPoints = useRouteStore((s) => s.controlPoints)
  const routeMode = useRouteStore((s) => s.routeMode)
  const routeProfile = useRouteStore((s) => s.routeProfile)
  const plannedWaypoints = useRouteStore((s) => s.plannedWaypoints)
  const plannedTotalDistanceKm = useRouteStore((s) => s.plannedTotalDistanceKm)
  const plannedTotalDurationSec = useRouteStore((s) => s.plannedTotalDurationSec)
  const planWarnings = useRouteStore((s) => s.planWarnings)
  const planStatus = useRouteStore((s) => s.planStatus)
  const planError = useRouteStore((s) => s.planError)

  const playing = useRouteStore((s) => s.playing)
  const isPaused = useRouteStore((s) => s.isPaused)
  const wandering = useRouteStore((s) => s.wandering)
  const loop = useRouteStore((s) => s.loop)
  const speedMs = useRouteStore((s) => s.speedMs)
  const fixedSpeed = useRouteStore((s) => s.fixedSpeed)
  const returnOnFinish = useRouteStore((s) => s.returnOnFinish)
  const startFromRealGps = useRouteStore((s) => s.startFromRealGps)
  const wanderEnabled = useRouteStore((s) => s.wanderEnabled)
  const wanderRadiusM = useRouteStore((s) => s.wanderRadiusM)

  const clearWaypoints = useRouteStore((s) => s.clearWaypoints)
  const removeControlPoint = useRouteStore((s) => s.removeControlPoint)
  const setLoop = useRouteStore((s) => s.setLoop)
  const setPlaying = useRouteStore((s) => s.setPlaying)
  const setIsPaused = useRouteStore((s) => s.setIsPaused)
  const setWaypoints = useRouteStore((s) => s.setWaypoints)
  const setPlannedRoute = useRouteStore((s) => s.setPlannedRoute)
  const clearPlannedRoute = useRouteStore((s) => s.clearPlannedRoute)
  const setRouteMode = useRouteStore((s) => s.setRouteMode)
  const setRouteProfile = useRouteStore((s) => s.setRouteProfile)
  const setPlanStatus = useRouteStore((s) => s.setPlanStatus)
  const setReturnOnFinish = useRouteStore((s) => s.setReturnOnFinish)
  const setStartFromRealGps = useRouteStore((s) => s.setStartFromRealGps)
  const setWanderEnabled = useRouteStore((s) => s.setWanderEnabled)
  const setWanderRadiusM = useRouteStore((s) => s.setWanderRadiusM)
  const setFixedSpeed = useRouteStore((s) => s.setFixedSpeed)

  const getTargetSerials = useDeviceStore((s) => s.getTargetSerials)
  const activeDevice = useDeviceStore((s) => s.activeDevice)
  const selectedSerials = useDeviceStore((s) => s.selectedSerials)
  const location = useLocationStore((s) => s.location)
  const realGpsLocation = useLocationStore((s) => s.realGpsLocation)

  const [stopCooldown, setStopCooldown] = useState<{ distKm: number; minutes: number } | null>(null)
  const [returnMsg, setReturnMsg] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)

  const effectiveTargets = useMemo(() => {
    if (selectedSerials.length > 0) return selectedSerials
    return activeDevice ? [activeDevice] : []
  }, [selectedSerials, activeDevice])

  const prevTargetsRef = useRef<string[]>([])
  const wasPlayingRef = useRef(false)
  useEffect(() => {
    const activelyPlaying = playing && !isPaused
    const wasPlaying = wasPlayingRef.current
    wasPlayingRef.current = activelyPlaying

    if (activelyPlaying && wasPlaying && waypoints.length >= 2) {
      const added = effectiveTargets.filter((s) => !prevTargetsRef.current.includes(s))
      if (added.length > 0) {
        ;(async (): Promise<void> => {
          for (const serial of added) {
            await window.api.enableMockLocation(serial)
            await window.api.routeSetWaypoints(waypoints, [serial])
            window.api.routeSetLoop(loop)
            window.api.routeSetWander(wanderEnabled, wanderRadiusM)
            window.api.routeSetFixedSpeed(fixedSpeed)
            await window.api.routePlay([serial], speedMs)
          }
        })()
      }
    }

    prevTargetsRef.current = effectiveTargets
  }, [effectiveTargets, playing, isPaused, waypoints, speedMs, loop, wanderEnabled, wanderRadiusM, fixedSpeed])

  const endMode: EndMode = loop ? 'loop' : wanderEnabled ? 'wander' : 'none'

  const setEndMode = (mode: EndMode): void => {
    if (mode === 'loop') {
      setLoop(true)
      setWanderEnabled(false)
      window.api.routeSetLoop(true)
      window.api.routeSetWander(false, wanderRadiusM)
    } else if (mode === 'wander') {
      setLoop(false)
      setWanderEnabled(true)
      window.api.routeSetLoop(false)
      window.api.routeSetWander(true, wanderRadiusM)
    } else {
      setLoop(false)
      setWanderEnabled(false)
      window.api.routeSetLoop(false)
      window.api.routeSetWander(false, wanderRadiusM)
    }
  }

  // Sync wander to backend whenever wanderEnabled/wanderRadiusM changes
  useEffect(() => {
    window.api.routeSetWander(wanderEnabled, wanderRadiusM)
  }, [wanderEnabled, wanderRadiusM])

  // Sync fixed speed toggle to backend
  useEffect(() => {
    window.api.routeSetFixedSpeed(fixedSpeed)
  }, [fixedSpeed])

  // Re-plan road-network route on control-point/profile/loop changes.
  useEffect(() => {
    if (routeMode !== 'road-network') return

    if (controlPoints.length === 0) {
      clearPlannedRoute()
      setPlanStatus('idle', null)
      return
    }

    if (controlPoints.length < 2) {
      clearPlannedRoute()
      setPlanStatus('error', 'Road-network mode needs at least 2 control points')
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      ;(async (): Promise<void> => {
        setPlanStatus('planning', null)
        try {
          const result = await window.api.routePlanRoadNetwork({
            controlPoints,
            profile: routeProfile,
            loop
          })
          if (cancelled) return
          setPlannedRoute(result)
        } catch (error: any) {
          if (cancelled) return
          const message = error?.message || 'Failed to plan route over road network'
          setPlanStatus('error', message)
        }
      })()
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [routeMode, controlPoints, routeProfile, loop, clearPlannedRoute, setPlanStatus, setPlannedRoute])

  const handlePlay = async (): Promise<void> => {
    const targetSerials = getTargetSerials()
    if (targetSerials.length === 0 || waypoints.length < 2) return
    if (routeMode === 'road-network' && planStatus === 'planning' && plannedWaypoints.length === 0) return

    setIsPlaying(true)

    if (isPaused) {
      await window.api.routePlay(targetSerials, speedMs)
      setPlaying(true)
      setIsPaused(false)
      setIsPlaying(false)
      return
    }

    await Promise.all(targetSerials.map((s) => window.api.enableMockLocation(s)))
    await window.api.routeSetWaypoints(waypoints, targetSerials)
    window.api.routeSetLoop(loop)
    window.api.routeSetWander(wanderEnabled, wanderRadiusM)
    window.api.routeSetFixedSpeed(fixedSpeed)

    let fromLat: number | undefined
    let fromLng: number | undefined
    if (startFromRealGps && realGpsLocation) {
      fromLat = realGpsLocation.lat
      fromLng = realGpsLocation.lng
    } else if (location) {
      fromLat = location.lat
      fromLng = location.lng
    }

    await window.api.routePlay(targetSerials, speedMs, fromLat, fromLng)
    setPlaying(true)
    setStopCooldown(null)
    setIsPlaying(false)
  }

  const handlePause = async (): Promise<void> => {
    await window.api.routePause()
    setPlaying(false)
    setIsPaused(true)
  }

  const handleReturn = (): void => {
    if (!realGpsLocation) {
      setReturnMsg('No real GPS known')
      setTimeout(() => setReturnMsg(''), 3000)
      return
    }
    setPlaying(false)
    setIsPaused(false)
    window.api.routeReturnToGps(realGpsLocation.lat, realGpsLocation.lng, speedMs)
    setStopCooldown(null)
  }

  const handleClearRoute = async (): Promise<void> => {
    if (playing || isPaused || wandering) {
      setShowClearDialog(true)
      return
    }

    await window.api.routeStop()
    clearWaypoints()
    setIsPaused(false)
    setStopCooldown(null)
    setReturnMsg('')
    setIsPlaying(false)
  }

  const handleClearStay = async (): Promise<void> => {
    setShowClearDialog(false)
    await window.api.routeStopStay()
    clearWaypoints()
    setIsPaused(false)
    setStopCooldown(null)
    setReturnMsg('')
    setIsPlaying(false)
  }

  const handleClearRemove = async (): Promise<void> => {
    setShowClearDialog(false)
    await window.api.routeStop()
    clearWaypoints()
    setIsPaused(false)
    setReturnMsg('')
    setIsPlaying(false)
    const from = location ?? realGpsLocation
    if (from && realGpsLocation) {
      const distKm = haversineKm(from.lat, from.lng, realGpsLocation.lat, realGpsLocation.lng)
      const minutes = getCooldownMinutes(distKm)
      if (minutes > 0) {
        setStopCooldown({ distKm, minutes })
        setTimeout(() => setStopCooldown(null), 10000)
      }
    }
  }

  const handleImportGpx = async (): Promise<void> => {
    const result = await window.api.importGpx()
    if (result && result.length > 0) {
      setRouteMode('manual')
      setWaypoints(result)
      await window.api.routeSetWaypoints(result)
    }
  }

  const hasDevice = !!activeDevice
  const canReturn = !!realGpsLocation

  const routeInfo = useMemo(() => {
    if (waypoints.length < 2) return null

    let totalKm = plannedTotalDistanceKm
    if (!(routeMode === 'road-network' && plannedTotalDistanceKm > 0)) {
      totalKm = 0
      for (let i = 1; i < waypoints.length; i++) {
        totalKm += haversineKm(waypoints[i - 1].lat, waypoints[i - 1].lng, waypoints[i].lat, waypoints[i].lng)
      }
      if (routeMode === 'manual' && loop) {
        totalKm += haversineKm(
          waypoints[waypoints.length - 1].lat,
          waypoints[waypoints.length - 1].lng,
          waypoints[0].lat,
          waypoints[0].lng
        )
      }
    }

    const totalSec = routeMode === 'road-network' && plannedTotalDurationSec > 0
      ? plannedTotalDurationSec
      : (totalKm * 1000) / speedMs

    const hours = Math.floor(totalSec / 3600)
    const mins = Math.ceil((totalSec % 3600) / 60)
    const eta = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
    return { totalKm, eta }
  }, [waypoints, loop, speedMs, routeMode, plannedTotalDistanceKm, plannedTotalDurationSec])

  const playDisabled =
    !hasDevice ||
    waypoints.length < 2 ||
    isPlaying ||
    (routeMode === 'road-network' && planStatus === 'planning' && plannedWaypoints.length === 0)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Route</h3>

      <div>
        <p className="text-xs text-foreground-secondary mb-2 font-medium">Route mode:</p>
        <SegmentedControl
          options={[
            { value: 'manual', label: 'Manual' },
            { value: 'road-network', label: 'Road Network' }
          ]}
          value={routeMode}
          onChange={(value) => setRouteMode(value as 'manual' | 'road-network')}
          fullWidth
        />
      </div>

      {routeMode === 'road-network' && (
        <div>
          <p className="text-xs text-foreground-secondary mb-2 font-medium">Road profile:</p>
          <SegmentedControl
            options={[
              { value: 'walk', label: 'Walk' },
              { value: 'cycle', label: 'Cycle' },
              { value: 'drive', label: 'Drive' }
            ]}
            value={routeProfile}
            onChange={(value) => setRouteProfile(value as 'walk' | 'cycle' | 'drive')}
            fullWidth
          />
        </div>
      )}

      {/* Playback controls */}
      <div className="flex gap-2">
        <div className="flex flex-1 gap-2">
          {!playing ? (
            <Button
              variant="primary"
              onClick={handlePlay}
              disabled={playDisabled}
              isLoading={isPlaying}
              className="flex-1 bg-success hover:bg-success-hover"
            >
              <Play size={16} />
              {isPaused ? 'Resume' : 'Play'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handlePause}
              className="flex-1 bg-warning hover:bg-warning-hover"
            >
              <Pause size={16} />
              Pause
            </Button>
          )}
          {selectedSerials.length > 1 && (
            <span className="text-[10px] text-primary self-center shrink-0">→ {selectedSerials.length}</span>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={handleReturn}
          disabled={!canReturn}
          title={!canReturn ? 'No real GPS known' : 'Walk back to real GPS'}
        >
          <CornerDownLeft size={16} />
        </Button>
        <Button
          variant="secondary"
          onClick={handleClearRoute}
          disabled={controlPoints.length === 0 && !playing && !isPaused && !wandering}
          title="Clear route and reset"
        >
          <Trash2 size={16} />
        </Button>
      </div>

      {returnMsg && <p className="text-xs text-danger">{returnMsg}</p>}

      {stopCooldown && (
        <Card className="border-warning/40 bg-warning/10">
          <p className="text-xs">
            <span className="text-warning font-medium">{stopCooldown.distKm.toFixed(1)} km from GPS</span>
            {' — cooldown '}
            <span className="text-warning font-medium">{stopCooldown.minutes} min</span>
          </p>
        </Card>
      )}

      {routeMode === 'road-network' && (
        <Card glass className="p-3 space-y-1.5">
          <p className="text-xs text-foreground-secondary">
            Planner: {planStatus === 'planning' ? 'Planning...' : planStatus}
          </p>
          {planError && (
            <p className="text-xs text-danger">{planError}</p>
          )}
          {planWarnings.slice(0, 2).map((warning, i) => (
            <p key={i} className="text-xs text-warning">{warning}</p>
          ))}
          <p className="text-xs text-foreground-muted">
            Control points {controlPoints.length} · Planned points {waypoints.length}
          </p>
        </Card>
      )}

      {routeInfo && (
        <div className="flex items-center justify-between text-xs text-foreground-secondary bg-surface-elevated rounded-[var(--radius-sm)] px-3 py-2">
          <span className="text-mono">{routeInfo.totalKm.toFixed(2)} km</span>
          <span>ETA {routeInfo.eta}</span>
        </div>
      )}

      {/* End-of-route behavior */}
      <div>
        <p className="text-xs text-foreground-secondary mb-2 font-medium">When route ends:</p>
        <SegmentedControl
          options={[
            { value: 'none', label: 'Stop' },
            { value: 'loop', label: 'Loop' },
            { value: 'wander', label: 'Wander' }
          ]}
          value={endMode}
          onChange={(value) => setEndMode(value as EndMode)}
          fullWidth
        />
        {endMode === 'wander' && (
          <Card glass className="mt-2 p-3">
            <input
              type="range"
              min={20}
              max={500}
              step={10}
              value={wanderRadiusM}
              onChange={(e) => setWanderRadiusM(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-foreground-muted text-center mt-2 text-mono">
              {wanderRadiusM} m radius
            </p>
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <ToggleButton
          checked={startFromRealGps}
          onChange={setStartFromRealGps}
          label="Start from real GPS"
          disabled={!realGpsLocation}
        />
        <ToggleButton
          checked={returnOnFinish}
          onChange={setReturnOnFinish}
          label="Return to GPS when done"
        />
        <ToggleButton
          checked={fixedSpeed}
          onChange={setFixedSpeed}
          label="Fixed speed (no random)"
        />
      </div>

      {controlPoints.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground-secondary font-medium">
              {controlPoints.length} control points
            </span>
            <button
              onClick={clearWaypoints}
              disabled={playing || isPaused}
              className={`text-xs text-danger hover:underline flex items-center gap-1 transition-colors ${playing || isPaused || wandering ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
            >
              <Trash2 size={12} /> Clear all
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
            {controlPoints.map((wp, i) => (
              <Card
                key={i}
                elevation="flat"
                className="flex items-center justify-between bg-surface-elevated p-2"
              >
                <span className="text-sm text-foreground-muted text-mono">
                  {i + 1}. {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                </span>
                <Button
                  variant="icon"
                  size="sm"
                  onClick={() => removeControlPoint(i)}
                  aria-label={`Remove control point ${i + 1}`}
                  disabled={playing || isPaused}
                  className="text-danger hover:bg-danger/10"
                >
                  <X size={14} />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-foreground-muted text-center py-4">
          Click the map to add control points
        </p>
      )}

      {routeMode === 'manual' && (
        <button
          onClick={handleImportGpx}
          className="w-full text-xs text-foreground-secondary hover:text-foreground flex items-center justify-center gap-1.5 py-2 border-t border-border transition-colors"
        >
          <FileUp size={14} /> Import GPX
        </button>
      )}

      <Modal
        isOpen={showClearDialog}
        onClose={() => setShowClearDialog(false)}
        title="Clear Route"
        description="Route is active. What would you like to do?"
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleClearStay}
            className="w-full justify-center"
          >
            <MapPin size={16} />
            Stay at Current Location
          </Button>
          <Button
            variant="secondary"
            onClick={handleClearRemove}
            className="w-full justify-center text-danger"
          >
            <X size={16} />
            Stop &amp; Remove Mock GPS
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowClearDialog(false)}
            className="w-full justify-center"
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
