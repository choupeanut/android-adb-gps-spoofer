import { Polyline, CircleMarker, Marker, Tooltip, Circle } from 'react-leaflet'
import L from 'leaflet'
import { useRouteStore } from '../../stores/route.store'

/** Small numbered marker for waypoints. */
function waypointIcon(index: number, isFirst: boolean, isLast: boolean): L.DivIcon {
  const bg = isFirst ? '#48bb78' : isLast ? '#fc8181' : '#63b3ed'
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${bg};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;line-height:1">${index + 1}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  })
}

export function RouteOverlay(): JSX.Element {
  const routeMode = useRouteStore((s) => s.routeMode)
  const controlPoints = useRouteStore((s) => s.controlPoints)
  const waypoints = useRouteStore((s) => s.waypoints)
  const loop = useRouteStore((s) => s.loop)
  const wanderEnabled = useRouteStore((s) => s.wanderEnabled)
  const wanderRadiusM = useRouteStore((s) => s.wanderRadiusM)
  const playing = useRouteStore((s) => s.playing)

  if (controlPoints.length === 0 && waypoints.length === 0) return <></>

  const positions = waypoints.map((wp) => [wp.lat, wp.lng] as [number, number])
  // Close the loop visually if loop is enabled
  const polyPositions = routeMode === 'manual' && loop && positions.length > 0
    ? [...positions, positions[0]]
    : positions

  const lastWp = controlPoints[controlPoints.length - 1]

  return (
    <>
      {/* Route line */}
      {polyPositions.length >= 2 && (
        <Polyline
          positions={polyPositions}
          color="#63b3ed"
          weight={3}
          opacity={0.8}
          dashArray={playing ? undefined : '8 6'}
        />
      )}

      {/* Waypoint markers with numbers */}
      {controlPoints.map((wp, i) => (
        <Marker
          key={i}
          position={[wp.lat, wp.lng]}
          icon={waypointIcon(i, i === 0, i === controlPoints.length - 1)}
        >
          <Tooltip direction="top" offset={[0, -12]} className="text-[10px]">
            #{i + 1} ({wp.lat.toFixed(4)}, {wp.lng.toFixed(4)})
          </Tooltip>
        </Marker>
      ))}

      {/* Wander radius circle at last waypoint */}
      {wanderEnabled && lastWp && (
        <Circle
          center={[lastWp.lat, lastWp.lng]}
          radius={wanderRadiusM}
          color="#a78bfa"
          fillColor="#a78bfa"
          fillOpacity={0.1}
          weight={1}
          dashArray="4 4"
        />
      )}
    </>
  )
}
