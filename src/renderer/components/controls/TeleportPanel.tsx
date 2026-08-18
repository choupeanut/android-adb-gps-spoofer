import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Star, AlertTriangle, Footprints, Bike, Car, Plane, Search, MapPin } from 'lucide-react'
import type { SavedLocation } from '@shared/types'
import {
  isValidLatitude,
  isValidLongitude,
  parseCoordinateInput
} from '@shared/coordinate-validation'
import { haversineKm, getCooldownMinutes } from '@shared/geo'
import { SPEED_PRESETS } from '@shared/constants'
import { useDeviceStore } from '../../stores/device.store'
import { useLocationStore } from '../../stores/location.store'
import { useSavedLocations } from '../../hooks/useSavedLocations'
import { SavedLocations } from '../sidebar/SavedLocations'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const TRAVEL_MODES = [
  { label: 'Walk', icon: <Footprints size={12} />, speedMs: SPEED_PRESETS.walk },
  { label: 'Cycle', icon: <Bike size={12} />, speedMs: SPEED_PRESETS.cycle },
  { label: 'Drive', icon: <Car size={12} />, speedMs: SPEED_PRESETS.drive },
  { label: 'Flight', icon: <Plane size={12} />, speedMs: 250 }
]

interface NominatimPlace {
  lat?: string
  lon?: string
  display_name?: string
}

function travelMinutes(distKm: number, speedMs: number): number {
  return Math.ceil((distKm * 1000) / speedMs / 60)
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function targetKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`
}

function coordinateName(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function TeleportPanel(): JSX.Element {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [search, setSearch] = useState('')
  const [saveName, setSaveName] = useState('')
  const [showSave, setShowSave] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [searchError, setSearchError] = useState('')
  const [actionError, setActionError] = useState('')
  const [coordinatesValidated, setCoordinatesValidated] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isTeleporting, setIsTeleporting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const reverseControllerRef = useRef<AbortController | null>(null)
  const reverseRequestIdRef = useRef(0)
  const searchControllerRef = useRef<AbortController | null>(null)
  const searchRequestIdRef = useRef(0)
  const saveNameEditedRef = useRef(false)
  const internalPendingKeyRef = useRef<string | null>(null)

  const activeDevice = useDeviceStore((state) => state.activeDevice)
  const getTargetSerials = useDeviceStore((state) => state.getTargetSerials)
  const selectedSerials = useDeviceStore((state) => state.selectedSerials)
  const location = useLocationStore((state) => state.location)
  const realGpsLocation = useLocationStore((state) => state.realGpsLocation)
  const pendingTeleport = useLocationStore((state) => state.pendingTeleport)
  const setPendingTeleport = useLocationStore((state) => state.setPendingTeleport)
  const {
    locations: savedLocations,
    error: savedLocationsError,
    refresh: refreshSavedLocations,
    rename: renameSavedLocation,
    remove: removeSavedLocation,
    touch: touchSavedLocation
  } = useSavedLocations()

  const cancelReverseGeocode = useCallback((): void => {
    reverseControllerRef.current?.abort()
    reverseControllerRef.current = null
    reverseRequestIdRef.current += 1
  }, [])

  const requestReverseName = useCallback(async (targetLat: number, targetLng: number): Promise<void> => {
    cancelReverseGeocode()
    const controller = new AbortController()
    reverseControllerRef.current = controller
    const requestId = reverseRequestIdRef.current
    const fallback = coordinateName(targetLat, targetLng)
    if (!saveNameEditedRef.current) setSaveName(fallback)

    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(targetLat),
        lon: String(targetLng),
        zoom: '18'
      })
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
        signal: controller.signal
      })
      if (!response.ok) return
      const place = await response.json() as NominatimPlace
      if (
        controller.signal.aborted ||
        requestId !== reverseRequestIdRef.current ||
        saveNameEditedRef.current
      ) return

      const suggestion = place.display_name?.split(',')[0]?.trim()
      if (suggestion) setSaveName(suggestion)
    } catch {
      // The coordinate fallback remains usable when reverse geocoding is unavailable.
    } finally {
      if (requestId === reverseRequestIdRef.current) reverseControllerRef.current = null
    }
  }, [cancelReverseGeocode])

  const applyTarget = useCallback((
    targetLat: number,
    targetLng: number,
    options: { suggestedName?: string; reverseName?: boolean } = {}
  ): void => {
    cancelReverseGeocode()
    const key = targetKey(targetLat, targetLng)
    internalPendingKeyRef.current = key
    saveNameEditedRef.current = false
    setLat(targetLat.toFixed(6))
    setLng(targetLng.toFixed(6))
    setSaveName(options.suggestedName ?? '')
    setCoordinatesValidated(false)
    setActionError('')
    setPendingTeleport({ lat: targetLat, lng: targetLng })
    if (options.reverseName) void requestReverseName(targetLat, targetLng)
  }, [cancelReverseGeocode, requestReverseName, setPendingTeleport])

  // A map click updates pendingTeleport outside this panel; other sources use applyTarget.
  useEffect(() => {
    if (!pendingTeleport) return
    const key = targetKey(pendingTeleport.lat, pendingTeleport.lng)
    setLat(pendingTeleport.lat.toFixed(6))
    setLng(pendingTeleport.lng.toFixed(6))
    if (internalPendingKeyRef.current === key) {
      internalPendingKeyRef.current = null
      return
    }
    cancelReverseGeocode()
    saveNameEditedRef.current = false
    setSaveName('')
    setCoordinatesValidated(false)
  }, [cancelReverseGeocode, pendingTeleport])

  useEffect(() => {
    return () => {
      reverseControllerRef.current?.abort()
      searchControllerRef.current?.abort()
      searchRequestIdRef.current += 1
    }
  }, [])

  const parsedLat = parseCoordinateInput(lat)
  const parsedLng = parseCoordinateInput(lng)
  const hasValidCoords =
    parsedLat !== null &&
    parsedLng !== null &&
    isValidLatitude(parsedLat) &&
    isValidLongitude(parsedLng)
  const targetLat = parsedLat ?? Number.NaN
  const targetLng = parsedLng ?? Number.NaN
  const targetSerials = getTargetSerials()
  const hasDevice = targetSerials.length > 0

  const latitudeError = coordinatesValidated
    ? parsedLat === null
      ? 'Enter a complete latitude.'
      : !isValidLatitude(parsedLat)
        ? 'Latitude must be between -90 and 90.'
        : undefined
    : undefined
  const longitudeError = coordinatesValidated
    ? parsedLng === null
      ? 'Enter a complete longitude.'
      : !isValidLongitude(parsedLng)
        ? 'Longitude must be between -180 and 180.'
        : undefined
    : undefined

  const fromLoc = location ?? realGpsLocation
  const distKm = hasValidCoords && fromLoc
    ? haversineKm(fromLoc.lat, fromLoc.lng, targetLat, targetLng)
    : null
  const cooldownMin = distKm !== null ? getCooldownMinutes(distKm) : null

  const validateCoordinates = (): boolean => {
    setCoordinatesValidated(true)
    return hasValidCoords
  }

  const applyManualTarget = (): void => {
    if (!validateCoordinates()) return
    if (pendingTeleport && targetKey(pendingTeleport.lat, pendingTeleport.lng) === targetKey(targetLat, targetLng)) {
      return
    }
    applyTarget(targetLat, targetLng)
  }

  const handleTeleport = async (): Promise<void> => {
    if (!hasDevice || !validateCoordinates()) return
    setIsTeleporting(true)
    setActionError('')
    try {
      await Promise.all(targetSerials.map((serial) => window.api.enableMockLocation(serial)))
      await window.api.teleport(targetSerials, targetLat, targetLng)
      await window.api.addLocationHistory(targetLat, targetLng)
      setPendingTeleport(null)
    } catch {
      setActionError('Could not teleport the selected device. Check the connection and try again.')
    } finally {
      setIsTeleporting(false)
    }
  }

  const handleSearch = async (): Promise<void> => {
    const query = search.trim()
    if (!query) return

    searchControllerRef.current?.abort()
    searchRequestIdRef.current += 1
    const requestId = searchRequestIdRef.current
    const controller = new AbortController()
    searchControllerRef.current = controller
    setIsSearching(true)
    setSearchError('')

    try {
      if (looksLikeUrl(query)) {
        const result = await window.api.resolveGoogleMapsLink(query)
        if (!result.ok) {
          if (requestId === searchRequestIdRef.current) setSearchError(result.message)
          return
        }
        if (requestId !== searchRequestIdRef.current) return
        applyTarget(result.lat, result.lng, { reverseName: true })
        return
      }

      const params = new URLSearchParams({ format: 'json', q: query, limit: '1' })
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        signal: controller.signal
      })
      if (!response.ok) throw new Error('search failed')
      const places = await response.json() as NominatimPlace[]
      const place = places[0]
      const foundLat = place?.lat ? Number(place.lat) : Number.NaN
      const foundLng = place?.lon ? Number(place.lon) : Number.NaN
      if (!isValidLatitude(foundLat) || !isValidLongitude(foundLng)) {
        if (requestId === searchRequestIdRef.current) {
          setSearchError('No matching place was found. Try a more specific search.')
        }
        return
      }
      if (requestId !== searchRequestIdRef.current) return
      applyTarget(foundLat, foundLng, {
        suggestedName: place.display_name?.split(',')[0]?.trim()
      })
    } catch {
      if (!controller.signal.aborted && requestId === searchRequestIdRef.current) {
        setSearchError('Place search failed. Check the network and try again.')
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        searchControllerRef.current = null
        setIsSearching(false)
      }
    }
  }

  const handleToggleSave = (): void => {
    if (showSave) {
      cancelReverseGeocode()
      setShowSave(false)
      return
    }
    if (!validateCoordinates()) return
    setShowSave(true)
    setActionError('')
    if (!saveName.trim()) {
      saveNameEditedRef.current = false
      void requestReverseName(targetLat, targetLng)
    }
  }

  const handleSaveNameChange = (value: string): void => {
    cancelReverseGeocode()
    saveNameEditedRef.current = true
    setSaveName(value)
  }

  const handleSave = async (): Promise<void> => {
    if (!validateCoordinates()) return
    const cleanName = saveName.trim()
    if (!cleanName || cleanName.length > 80) {
      setActionError('Location name must be between 1 and 80 characters.')
      return
    }

    setIsSaving(true)
    setActionError('')
    try {
      await window.api.saveLocation(cleanName, targetLat, targetLng)
      await refreshSavedLocations()
      setSaveMsg('Saved location.')
      setShowSave(false)
      setSaveName('')
      saveNameEditedRef.current = false
      setTimeout(() => setSaveMsg(''), 2_000)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save this location.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFavoriteSelect = (favorite: SavedLocation): void => {
    applyTarget(favorite.lat, favorite.lng, { suggestedName: favorite.name })
    void touchSavedLocation(favorite.id).catch(() => undefined)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Teleport</h3>
        {selectedSerials.length > 1 ? (
          <p className="mt-0.5 text-xs text-primary">{selectedSerials.length} devices selected</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Search place or paste Google Maps link"
            aria-label="Search place or paste Google Maps link"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSearch()
            }}
            leftIcon={<Search size={16} />}
          />
          <Button
            variant="secondary"
            size="md"
            className="min-h-11 min-w-11 px-0"
            onClick={() => void handleSearch()}
            isLoading={isSearching}
            disabled={isSearching}
            aria-label="Search or import link"
            title="Search or import link"
          >
            {isSearching ? 'Searching' : <Search size={16} />}
          </Button>
        </div>
        {searchError ? <p role="alert" className="text-xs text-danger">{searchError}</p> : null}
      </div>

      {savedLocations.length > 0 ? (
        <div role="group" aria-label="Recent saved locations">
          <p className="mb-1.5 text-xs font-medium text-foreground-secondary">Recent saved locations</p>
          <div className="flex flex-wrap gap-2">
            {savedLocations.slice(0, 3).map((favorite) => (
              <button
                key={favorite.id}
                type="button"
                onClick={() => handleFavoriteSelect(favorite)}
                title={`${favorite.name}: ${favorite.lat.toFixed(5)}, ${favorite.lng.toFixed(5)}`}
                className="flex min-h-11 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 text-xs text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MapPin size={14} className="shrink-0" />
                <span className="truncate">{favorite.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Latitude"
          aria-label="Latitude"
          inputMode="decimal"
          value={lat}
          onChange={(event) => {
            setLat(event.target.value)
            setCoordinatesValidated(false)
          }}
          onBlur={applyManualTarget}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyManualTarget()
          }}
          error={latitudeError}
          mono
        />
        <Input
          label="Longitude"
          aria-label="Longitude"
          inputMode="decimal"
          value={lng}
          onChange={(event) => {
            setLng(event.target.value)
            setCoordinatesValidated(false)
          }}
          onBlur={applyManualTarget}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyManualTarget()
          }}
          error={longitudeError}
          mono
        />
      </div>

      {hasValidCoords && distKm !== null && distKm >= 0.5 ? (
        <Card className="border-warning/40 bg-warning/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-warning">
                {distKm.toFixed(1)} km — Cooldown: {cooldownMin} min
              </p>
              <div className="space-y-1 text-xs text-foreground-secondary">
                <p className="text-[11px] font-medium text-foreground-muted">Travel time estimates:</p>
                {TRAVEL_MODES.map(({ label, icon, speedMs }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">{icon} {label}</span>
                    <span className="text-mono">{travelMinutes(distKm, speedMs)} min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="lg"
          onClick={() => void handleTeleport()}
          disabled={!hasDevice || !hasValidCoords || isTeleporting}
          isLoading={isTeleporting}
          className="min-h-11 flex-1"
        >
          Teleport
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={handleToggleSave}
          disabled={!hasValidCoords}
          title="Save this location"
          aria-label="Save this location"
          aria-expanded={showSave}
          className="min-h-11 min-w-11 px-0"
        >
          <Star size={16} />
        </Button>
      </div>

      {showSave ? (
        <Card glass className="p-3">
          <div className="space-y-2">
            <Input
              label="Location name"
              aria-label="Location name"
              value={saveName}
              onChange={(event) => handleSaveNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSave()
              }}
              maxLength={80}
            />
            <Button
              variant="primary"
              className="min-h-11 w-full"
              onClick={() => void handleSave()}
              isLoading={isSaving}
            >
              Save location
            </Button>
          </div>
        </Card>
      ) : null}

      {actionError ? <p role="alert" className="text-xs text-danger">{actionError}</p> : null}
      {saveMsg ? <p aria-live="polite" className="text-xs text-success">{saveMsg}</p> : null}
      {savedLocationsError ? <p role="alert" className="text-xs text-danger">{savedLocationsError}</p> : null}

      <SavedLocations
        locations={savedLocations}
        onSelect={handleFavoriteSelect}
        onRename={renameSavedLocation}
        onDelete={removeSavedLocation}
      />

      {location ? (
        <p className="text-xs text-mono text-foreground-muted">
          Current: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </p>
      ) : null}

      {!activeDevice ? <p className="text-xs text-danger">No device connected</p> : null}
    </div>
  )
}
