import { useEffect, useState } from 'react'

interface HistoryEntry {
  id: number
  lat: number
  lng: number
  visited_at: string
}

interface Props {
  onSelect?: (lat: number, lng: number) => void
}

export function LocationHistory({ onSelect }: Props): JSX.Element {
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    window.api.getLocationHistory().then((h: HistoryEntry[]) => setHistory(h))
  }, [])

  // Refresh every 10 seconds
  useEffect(() => {
    const t = setInterval(() => {
      window.api.getLocationHistory().then((h: HistoryEntry[]) => setHistory(h))
    }, 10000)
    return () => clearInterval(t)
  }, [])

  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-4 py-2">No location history yet</p>
    )
  }

  return (
    <div className="px-4 pb-4">
      <h3 className="text-sm font-semibold mb-2 text-foreground">Recent Locations</h3>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {history.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect?.(entry.lat, entry.lng)}
            className="w-full text-left px-2 py-1.5 rounded text-xs bg-secondary/40 hover:bg-secondary transition-colors"
          >
            <span className="text-foreground">
              {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}
            </span>
            <span className="block text-muted-foreground text-xs">
              {new Date(entry.visited_at).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
