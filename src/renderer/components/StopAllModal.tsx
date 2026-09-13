import { cancelMovement, movementCommand } from '../lib/movement-commands'
import { useState, type JSX } from 'react'
import { Modal } from './ui/Modal'
import { MapPin, Footprints, Zap } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function StopAllModal({ isOpen, onClose }: Props): JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!isOpen) return null

  const handleStop = async (mode: 'stay' | 'graceful' | 'immediate'): Promise<void> => {
    if (busy) return
    setBusy(true); setError('')
    cancelMovement()
    try { await movementCommand(() => window.api.stopAll(mode)); onClose() }
    catch (error: any) { setError(error?.message || 'Could not stop devices. Please retry.') }
    finally { setBusy(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stop All Devices" className="max-w-sm">
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
        <div className="space-y-2">
          <button
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
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
    </Modal>
  )
}
