import { X, MapPin, Footprints, Zap } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function StopAllModal({ isOpen, onClose }: Props): JSX.Element | null {
  if (!isOpen) return null

  const handleStop = async (mode: 'stay' | 'graceful' | 'immediate'): Promise<void> => {
    await window.api.stopAll(mode)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-lg p-5 w-80 max-w-[90vw] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Stop All Devices</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleStop('stay')}
            className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          >
            <MapPin size={18} className="text-blue-400 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Stay at current position</p>
              <p className="text-xs text-muted-foreground">Stop movement, keep mock GPS active</p>
            </div>
          </button>

          <button
            onClick={() => handleStop('graceful')}
            className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          >
            <Footprints size={18} className="text-green-400 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Walk back to real GPS</p>
              <p className="text-xs text-muted-foreground">Gracefully return at walking speed</p>
            </div>
          </button>

          <button
            onClick={() => handleStop('immediate')}
            className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm bg-destructive/20 hover:bg-destructive/30 rounded-md transition-colors border border-destructive/30"
          >
            <Zap size={18} className="text-red-400 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Return immediately</p>
              <p className="text-xs text-muted-foreground">Instant teleport back — may trigger cooldown</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
