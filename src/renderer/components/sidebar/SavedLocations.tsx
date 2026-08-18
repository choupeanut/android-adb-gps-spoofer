import { useState, type JSX } from 'react'
import { ChevronDown, MapPin, Pencil, Trash2 } from 'lucide-react'
import type { SavedLocation } from '@shared/types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

interface Props {
  locations: SavedLocation[]
  onSelect: (location: SavedLocation) => void
  onRename: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function SavedLocations({ locations, onSelect, onRename, onDelete }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [isMutating, setIsMutating] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<SavedLocation | null>(null)

  const startRename = (location: SavedLocation): void => {
    setEditingId(location.id)
    setEditingName(location.name)
    setMutationError('')
  }

  const submitRename = async (): Promise<void> => {
    if (editingId === null) return
    setIsMutating(true)
    setMutationError('')
    try {
      await onRename(editingId, editingName)
      setEditingId(null)
      setEditingName('')
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Could not rename this location.')
    } finally {
      setIsMutating(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteCandidate) return
    setIsMutating(true)
    setMutationError('')
    try {
      await onDelete(deleteCandidate.id)
      setDeleteCandidate(null)
    } catch {
      setMutationError('Could not delete this location.')
      setDeleteCandidate(null)
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="border-t border-border/60 pt-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          All saved locations
          <span className="text-xs text-foreground-muted">({locations.length})</span>
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2">
          {locations.length === 0 ? (
            <p className="px-2 py-2 text-xs text-foreground-muted">No saved locations yet.</p>
          ) : (
            locations.map((location) => (
              <div
                key={location.id}
                className="rounded-[var(--radius-sm)] border border-border/60 bg-surface-elevated/60 p-2"
              >
                {editingId === location.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void submitRename()
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      aria-label={`Rename ${location.name}`}
                      maxLength={80}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => setEditingId(null)}
                        disabled={isMutating}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="min-h-11"
                        onClick={() => void submitRename()}
                        isLoading={isMutating}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelect(location)}
                      className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-xs)] px-2 text-left transition-colors hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate text-sm text-foreground">{location.name}</span>
                      <span className="block text-xs text-mono text-foreground-muted">
                        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                      </span>
                    </button>
                    <Button
                      variant="icon"
                      className="min-h-11 min-w-11"
                      onClick={() => startRename(location)}
                      aria-label={`Rename ${location.name}`}
                      title={`Rename ${location.name}`}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="icon"
                      className="min-h-11 min-w-11 text-danger"
                      onClick={() => setDeleteCandidate(location)}
                      aria-label={`Delete ${location.name}`}
                      title={`Delete ${location.name}`}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
          {mutationError ? (
            <p role="alert" className="px-2 text-xs text-danger">{mutationError}</p>
          ) : null}
        </div>
      ) : null}

      <Modal
        isOpen={deleteCandidate !== null}
        onClose={() => setDeleteCandidate(null)}
        title="Delete saved location?"
        description={deleteCandidate ? `“${deleteCandidate.name}” will be removed from quick picks.` : undefined}
        className="max-w-sm"
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => setDeleteCandidate(null)}
            disabled={isMutating}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="min-h-11"
            onClick={() => void confirmDelete()}
            isLoading={isMutating}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
