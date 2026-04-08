import { Footprints, Bike, Car, SlidersHorizontal } from 'lucide-react'
import type { SpeedMode } from '@shared/types'
import { SPEED_PRESETS } from '@shared/constants'
import { SegmentedControl, type SegmentedControlOption } from '../ui/SegmentedControl'
import { Card } from '../ui/Card'

interface Props {
  speedMode: SpeedMode
  speedMs: number
  onChange: (mode: SpeedMode, speedMs: number) => void
}

function toKph(ms: number): number {
  return ms * 3.6
}

export function SpeedControl({ speedMode, speedMs, onChange }: Props): JSX.Element {
  const options: SegmentedControlOption[] = [
    { value: 'walk', label: 'Walk', icon: <Footprints size={16} /> },
    { value: 'cycle', label: 'Cycle', icon: <Bike size={16} /> },
    { value: 'drive', label: 'Drive', icon: <Car size={16} /> },
    { value: 'custom', label: 'Custom', icon: <SlidersHorizontal size={16} /> }
  ]

  const handleModeChange = (mode: string): void => {
    const newMode = mode as SpeedMode
    if (newMode === 'custom') {
      onChange(newMode, speedMs)
      return
    }
    const presetMs = SPEED_PRESETS[newMode as keyof typeof SPEED_PRESETS]
    onChange(newMode, presetMs)
  }

  return (
    <div className="space-y-3">
      <SegmentedControl
        options={options}
        value={speedMode}
        onChange={handleModeChange}
        fullWidth
      />

      {speedMode === 'custom' && (
        <Card glass elevation="flat" className="p-3">
          <input
            type="range"
            min={0.5}
            max={30}
            step={0.1}
            value={speedMs}
            onChange={(e) => onChange('custom', parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-foreground-muted text-center mt-2 text-mono">
            {speedMs.toFixed(1)} m/s ({toKph(speedMs).toFixed(1)} km/h)
          </p>
        </Card>
      )}

      {speedMode !== 'custom' && (
        <p className="text-xs text-foreground-secondary text-mono">
          Speed: {SPEED_PRESETS[speedMode as keyof typeof SPEED_PRESETS].toFixed(1)} m/s ({toKph(SPEED_PRESETS[speedMode as keyof typeof SPEED_PRESETS]).toFixed(1)} km/h)
        </p>
      )}
    </div>
  )
}
