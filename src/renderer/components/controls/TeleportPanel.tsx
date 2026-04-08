import { useState, useEffect } from 'react'
import { Star, AlertTriangle, Footprints, Bike, Car, Plane, Search, Loader2 } from 'lucide-react'
import { useDeviceStore } from '../../stores/device.store'
import { useLocationStore } from '../../stores/location.store'
import { haversineKm, getCooldownMinutes } from '@shared/geo'
import { SPEED_PRESETS } from '@shared/constants'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const TRAVEL_MODES = [
  { label: 'Walk',   icon: <Footprints size={12} />, speedMs: SPEED_PRESETS.walk },
  { label: 'Cycle',  icon: <Bike size={12} />,       speedMs: SPEED_PRESETS.cycle },
  { label: 'Drive',  icon: <Car size={12} />,        speedMs: SPEED_PRESETS.drive },
  { label: 'Flight', icon: <Plane size={12} />,      speedMs: 250 }
]

function travelMinutes(distKm: number, speedMs: number): number {
  return Math.ceil((distKm * 1000) / speedMs / 60)
}

export function TeleportPanel(): JSX.Element {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [search, setSearch] = useState('')
  const [saveName, setSaveName] = useState('')
  const [showSave, setShowSave] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isTeleporting, setIsTeleporting] = useState(false)

  const activeDevice = useDeviceStore((s) => s.activeDevice)
  const getTargetSerials = useDeviceStore((s) => s.getTargetSerials)
  const selectedSerials = useDeviceStore((s) => s.selectedSerials)
  const location = useLocationStore((s) => s.location)
  const realGpsLocation = useLocationStore((s) => s.realGpsLocation)
  const pendingTeleport = useLocationStore((s) => s.pendingTeleport)
  const setPendingTeleport = useLocationStore((s) => s.setPendingTeleport)

  // Sync lat/lng inputs when pendingTeleport changes from map click
  useEffect(() => {
    if (pendingTeleport) {
      setLat(pendingTeleport.lat.toFixed(6))
      setLng(pendingTeleport.lng.toFixed(6))
    }
  }, [pendingTeleport])

  const targetLat = parseFloat(lat)
  const targetLng = parseFloat(lng)
  const hasValidCoords = !isNaN(targetLat) && !isNaN(targetLng)
  const targetSerials = getTargetSerials()
  const hasDevice = targetSerials.length > 0

  // Reference point for distance: spoofed location if available, else real GPS
  const fromLoc = location ?? realGpsLocation
  const distKm = hasValidCoords && fromLoc
    ? haversineKm(fromLoc.lat, fromLoc.lng, targetLat, targetLng)
    : null
  const cooldownMin = distKm !== null ? getCooldownMinutes(distKm) : null

  const handleTeleport = async (): Promise<void> => {
    if (!hasDevice || !hasValidCoords) return
    setIsTeleporting(true)
    await Promise.all(targetSerials.map((s) => window.api.enableMockLocation(s)))
    await window.api.teleport(targetSerials, targetLat, targetLng)
    window.api.addLocationHistory(targetLat, targetLng)
    setPendingTeleport(null)
    setIsTeleporting(false)
  }

  const handleSearch = async (): Promise<void> => {
    if (!search.trim()) return
    setIsSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`
      )
      const data = await res.json()
      if (data.length > 0) {
        setLat(data[0].lat)
        setLng(data[0].lon)
        setSaveName(data[0].display_name.split(',')[0])
      }
    } catch (err) {
      console.error('Geocoding failed:', err)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!hasValidCoords) return
    const name = saveName.trim() || `${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`
    await window.api.saveLocation(name, targetLat, targetLng)
    setSaveMsg('Saved!')
    setShowSave(false)
    setSaveName('')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Teleport
        </h3>
        {selectedSerials.length > 1 && (
          <p className="text-xs text-primary mt-0.5">
            {selectedSerials.length} devices selected
          </p>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search place..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          leftIcon={<Search size={16} />}
        />
        <Button
          variant="secondary"
          size="md"
          onClick={handleSearch}
          isLoading={isSearching}
          disabled={isSearching}
          aria-label="Search"
        >
          {!isSearching && <Search size={16} />}
        </Button>
      </div>

      {/* Coordinates */}
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="25.033964"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          mono
        />
        <Input
          placeholder="121.564472"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          mono
        />
      </div>

      {/* Cooldown warning */}
      {hasValidCoords && distKm !== null && distKm >= 0.5 && (
        <Card className="border-warning/40 bg-warning/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1 min-w-0">
              <p className="font-medium text-warning text-sm">
                {distKm.toFixed(1)} km — Cooldown: {cooldownMin} min
              </p>
              <div className="space-y-1 text-xs text-foreground-secondary">
                <p className="text-[11px] font-medium text-foreground-muted">Travel time estimates:</p>
                {TRAVEL_MODES.map(({ label, icon, speedMs }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">{icon} {label}</span>
                    <span className="text-mono">{travelMinutes(distKm, speedMs)} min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="lg"
          onClick={handleTeleport}
          disabled={!hasDevice || !hasValidCoords || isTeleporting}
          isLoading={isTeleporting}
          className="flex-1"
        >
          Teleport
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setShowSave((v) => !v)}
          disabled={!hasValidCoords}
          title="Save this location"
          aria-label="Save location"
        >
          <Star size={16} />
        </Button>
      </div>

      {/* Save form */}
      {showSave && (
        <Card glass className="p-3">
          <div className="flex gap-2">
            <Input
              placeholder="Location name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </Card>
      )}
      {saveMsg && <p className="text-xs text-success">{saveMsg}</p>}

      {/* Current position */}
      {location && (
        <p className="text-xs text-foreground-muted text-mono">
          Current: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </p>
      )}

      {!activeDevice && (
        <p className="text-xs text-danger">No device connected</p>
      )}
    </div>
  )
}
