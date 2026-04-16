import { useEffect, useRef } from 'react'
import { RefreshCw, Navigation, Route, Crosshair, MapPin } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Map as LeafletMap } from 'leaflet'
import { useLocationStore } from '../../stores/location.store'
import { useDeviceStore } from '../../stores/device.store'
import { useRouteStore } from '../../stores/route.store'
import { useUiStore, type MapClickMode } from '../../stores/ui.store'
import { RouteOverlay } from './RouteOverlay'
import { SegmentedControl, type SegmentedControlOption } from '../ui/SegmentedControl'
import { Button } from '../ui/Button'

// Direction arrow — rotated by bearing
function createLocationIcon(bearingDeg: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:36px;height:36px;transform:rotate(${bearingDeg}deg)">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="16" fill="#3b82f6" fill-opacity="0.85" stroke="white" stroke-width="2"/>
          <polygon points="18,5 24,26 18,21 12,26" fill="white"/>
        </svg>
      </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  })
}

// Real GPS pin — hollow green circle
const realGpsIcon = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50%;border:3px solid #22c55e;background:rgba(34,197,94,0.15);box-shadow:0 0 8px rgba(34,197,94,0.6)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
})

// Pending teleport marker — orange circle
const pendingTeleportIcon = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50%;border:3px solid #f97316;background:rgba(249,115,22,0.25);box-shadow:0 0 8px rgba(249,115,22,0.7)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
})

// Multi-device GPS marker (teal/cyan — distinguishes from active device's green)
const deviceGpsIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;border:2px solid #06b6d4;background:rgba(6,182,212,0.15);box-shadow:0 0 6px rgba(6,182,212,0.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
})

/** Captures the Leaflet map instance into an external ref. */
function MapRefGrabber({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }): null {
  const map = useMap()
  useEffect(() => { mapRef.current = map }, [map, mapRef])
  return null
}

/** Auto-pan to real GPS once when it first becomes available. */
function AutoPanToRealGps(): null {
  const map = useMap()
  const realGpsLocation = useLocationStore((s) => s.realGpsLocation)
  const prevRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    // Pan only when transitioning null → value (first successful fetch per device)
    if (realGpsLocation && !prevRef.current) {
      map.flyTo([realGpsLocation.lat, realGpsLocation.lng], 16, { duration: 1.5 })
    }
    prevRef.current = realGpsLocation
  }, [realGpsLocation, map])

  return null
}

function MapClickHandler(): null {
  const mapClickMode = useUiStore((s) => s.mapClickMode)
  const addWaypoint = useRouteStore((s) => s.addWaypoint)
  const setLoop = useRouteStore((s) => s.setLoop)
  const setPendingTeleport = useLocationStore((s) => s.setPendingTeleport)

  useMapEvents({
    click: (e) => {
      if (mapClickMode === 'route') {
        const waypoints = useRouteStore.getState().waypoints
        // Snap-to-close: if ≥3 waypoints and click within 50m of first, enable loop
        if (waypoints.length >= 3) {
          const first = waypoints[0]
          const distM = e.latlng.distanceTo(L.latLng(first.lat, first.lng))
          if (distM <= 50) {
            setLoop(true)
            window.api.routeSetLoop(true)
            return
          }
        }
        addWaypoint({ lat: e.latlng.lat, lng: e.latlng.lng })
      } else if (mapClickMode === 'teleport') {
        setPendingTeleport({ lat: e.latlng.lat, lng: e.latlng.lng })
      }
    }
  })

  return null
}

export function MapView(): JSX.Element {
  const mapRef = useRef<LeafletMap | null>(null)

  const location = useLocationStore((s) => s.location)
  const realGpsLocation = useLocationStore((s) => s.realGpsLocation)
  const pendingTeleport = useLocationStore((s) => s.pendingTeleport)
  const allDeviceLocations = useLocationStore((s) => s.allDeviceLocations)
  const mode = useLocationStore((s) => s.mode)
  const mapClickMode = useUiStore((s) => s.mapClickMode)
  const setMapClickMode = useUiStore((s) => s.setMapClickMode)
  const activeDevice = useDeviceStore((s) => s.activeDevice)
  const devices = useDeviceStore((s) => s.devices)
  const setRealGpsLocation = useLocationStore((s) => s.setRealGpsLocation)

  const showBearing = mode === 'route' || mode === 'joystick'
  const showSpeed = (mode === 'route' || mode === 'joystick') && location != null && location.speed > 0.05

  const handleRefreshGps = async (): Promise<void> => {
    if (!activeDevice) return
    const loc: any = await window.api.getRealLocation(activeDevice)
    setRealGpsLocation(loc ?? null)
  }

  const handleZoomToFake = (): void => {
    if (location && mapRef.current) {
      mapRef.current.flyTo([location.lat, location.lng], 17, { duration: 1 })
    }
  }

  const handleZoomToReal = (): void => {
    if (realGpsLocation && mapRef.current) {
      mapRef.current.flyTo([realGpsLocation.lat, realGpsLocation.lng], 17, { duration: 1 })
    }
  }

  return (
    <div className="h-full w-full relative">
      <MapContainer center={[25.033, 121.565]} zoom={13} className="h-full w-full z-0">
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />

        <MapRefGrabber mapRef={mapRef} />
        <AutoPanToRealGps />

        {/* Real GPS — hollow green circle with tooltip */}
        {realGpsLocation && (
          <Marker position={[realGpsLocation.lat, realGpsLocation.lng]} icon={realGpsIcon}>
            <Tooltip permanent direction="top" offset={[0, -14]} className="text-[10px]">
              Real GPS
            </Tooltip>
          </Marker>
        )}

        {/* Other devices' real GPS — cyan markers (skip active device, already shown above) */}
        {Object.entries(allDeviceLocations)
          .filter(([serial]) => serial !== activeDevice)
          .map(([serial, loc]) => {
            const dev = devices.find((d) => d.serial === serial)
            return (
              <Marker key={serial} position={[loc.lat, loc.lng]} icon={deviceGpsIcon}>
                <Tooltip direction="top" offset={[0, -10]} className="text-[10px]">
                  {dev?.model || serial}
                </Tooltip>
              </Marker>
            )
          })
        }

        {/* Pending teleport destination — orange circle */}
        {pendingTeleport && (
          <Marker position={[pendingTeleport.lat, pendingTeleport.lng]} icon={pendingTeleportIcon}>
            <Tooltip permanent direction="top" offset={[0, -14]} className="text-[10px]">
              Pending destination
            </Tooltip>
          </Marker>
        )}

        {/* Spoofed position — direction arrow */}
        {location && (
          <Marker
            position={[location.lat, location.lng]}
            icon={createLocationIcon(showBearing ? location.bearing : 0)}
          />
        )}

        <RouteOverlay />
        <MapClickHandler />
      </MapContainer>

      {/* Map click mode toggle — floating top-center, offset for left panel */}
      <div className="absolute top-4 left-[calc(50%+150px)] -translate-x-1/2 z-[5]">
        <div className="glass rounded-[var(--radius-md)] p-1 shadow-elevation-md">
          <SegmentedControl
            options={[
              { value: 'teleport', label: 'Teleport', icon: <Navigation size={16} /> },
              { value: 'route', label: 'Route', icon: <Route size={16} /> }
            ]}
            value={mapClickMode}
            onChange={(value) => setMapClickMode(value as MapClickMode)}
          />
        </div>
      </div>

      {/* Zoom-to buttons — right edge of map, above joystick */}
      <div className="absolute right-[180px] bottom-4 z-[5] flex flex-col gap-2">
        {location && (
          <Button
            variant="icon"
            onClick={handleZoomToFake}
            title="Zoom to fake GPS"
            className="glass w-10 h-10 text-secondary shadow-elevation-md"
          >
            <Crosshair size={18} />
          </Button>
        )}
        {realGpsLocation && (
          <Button
            variant="icon"
            onClick={handleZoomToReal}
            title="Zoom to real GPS"
            className="glass w-10 h-10 text-success shadow-elevation-md"
          >
            <MapPin size={18} />
          </Button>
        )}
      </div>

      {/* Coordinate + bearing + speed overlay — offset for left panel */}
      {location ? (
        <div className="absolute bottom-4 left-[320px] z-[5] glass rounded-[var(--radius-md)] px-4 py-2 shadow-elevation-md pointer-events-none select-none">
          <p className="text-xs text-mono text-foreground">
            {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            {showBearing && (
              <span className="ml-2 text-foreground-muted">{Math.round(location.bearing)}°</span>
            )}
          </p>
          {showSpeed && (
            <p className="text-xs text-mono text-primary font-semibold mt-0.5">
              {location.speed.toFixed(1)} m/s · {(location.speed * 3.6).toFixed(1)} km/h
            </p>
          )}
        </div>
      ) : realGpsLocation ? (
        /* Real GPS info + refresh (shown when no spoofed location yet) */
        <div className="absolute bottom-4 left-[320px] z-[5] glass rounded-[var(--radius-md)] px-4 py-2 shadow-elevation-md flex items-center gap-2">
          <span className="text-xs text-success font-medium">Real GPS</span>
          <span className="text-xs text-mono text-foreground">{realGpsLocation.lat.toFixed(6)}, {realGpsLocation.lng.toFixed(6)}</span>
          <Button
            variant="icon"
            size="sm"
            onClick={handleRefreshGps}
            title="Refresh real GPS"
            aria-label="Refresh real GPS"
            className="ml-1"
          >
            <RefreshCw size={12} />
          </Button>
        </div>
      ) : activeDevice ? (
        /* No real GPS hint */
        <div className="absolute bottom-4 left-[320px] z-[5] glass rounded-[var(--radius-md)] px-4 py-2 shadow-elevation-md flex items-center gap-2">
          <span className="text-xs text-foreground-muted">Real GPS not available</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshGps}
            className="h-6"
          >
            Refresh
          </Button>
        </div>
      ) : null}
    </div>
  )
}
