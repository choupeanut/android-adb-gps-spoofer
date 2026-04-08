import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { SavedLocation } from '@shared/types'

interface Props {
  onSelect?: (lat: number, lng: number) => void
}

export function SavedLocations({ onSelect }: Props): JSX.Element {
  const [locations, setLocations] = useState<SavedLocation[]>([])

  const loadLocations = async (): Promise<void> => {
    const locs = await window.api.getSavedLocations()
    setLocations(locs)
  }

  useEffect(() => {
    loadLocations()
  }, [])

  const handleDelete = async (id: number): Promise<void> => {
    await window.api.deleteLocation(id)
    loadLocations()
  }

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-sm font-semibold mb-2 text-foreground">Saved Locations</h3>

      {locations.length === 0 ? (
        <p className="text-xs text-muted-foreground">No saved locations yet</p>
      ) : (
        <div className="space-y-1">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between text-xs bg-secondary/50 rounded px-2 py-1.5"
            >
              <button
                className="flex-1 text-left text-foreground hover:text-primary"
                onClick={() => onSelect?.(loc.lat, loc.lng)}
              >
                {loc.name}
                <span className="block text-muted-foreground">
                  {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                </span>
              </button>
              <button
                onClick={() => handleDelete(loc.id)}
                aria-label={`Delete ${loc.name}`}
                className="text-destructive ml-2 hover:opacity-80 flex items-center p-1"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
