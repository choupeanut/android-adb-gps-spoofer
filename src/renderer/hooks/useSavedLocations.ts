import { useCallback, useEffect, useState } from 'react'
import type { SavedLocation } from '@shared/types'

interface SavedLocationsState {
  locations: SavedLocation[]
  error: string
  refresh: () => Promise<void>
  rename: (id: number, name: string) => Promise<void>
  remove: (id: number) => Promise<void>
  touch: (id: number) => Promise<void>
}

export function useSavedLocations(): SavedLocationsState {
  const [locations, setLocations] = useState<SavedLocation[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const saved = await window.api.getSavedLocations()
      setLocations(saved)
      setError('')
    } catch {
      setError('Could not load saved locations.')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const rename = useCallback(async (id: number, name: string): Promise<void> => {
    const result = await window.api.renameLocation(id, name)
    if (!result.ok) throw new Error(result.message)
    await refresh()
  }, [refresh])

  const remove = useCallback(async (id: number): Promise<void> => {
    await window.api.deleteLocation(id)
    await refresh()
  }, [refresh])

  const touch = useCallback(async (id: number): Promise<void> => {
    const result = await window.api.touchLocation(id)
    if (result.ok) await refresh()
  }, [refresh])

  return { locations, error, refresh, rename, remove, touch }
}
