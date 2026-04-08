import { useState, useEffect } from 'react'
import { useLocationStore } from '../../stores/location.store'
import { COOLDOWN_TABLE } from '@shared/constants'

function calcCooldown(distanceKm: number): number {
  if (distanceKm <= 0) return 0
  for (let i = 0; i < COOLDOWN_TABLE.length; i++) {
    if (distanceKm <= COOLDOWN_TABLE[i].distanceKm) {
      if (i === 0) {
        return (distanceKm / COOLDOWN_TABLE[0].distanceKm) * COOLDOWN_TABLE[0].waitMinutes
      }
      const prev = COOLDOWN_TABLE[i - 1]
      const curr = COOLDOWN_TABLE[i]
      const ratio = (distanceKm - prev.distanceKm) / (curr.distanceKm - prev.distanceKm)
      return prev.waitMinutes + ratio * (curr.waitMinutes - prev.waitMinutes)
    }
  }
  return COOLDOWN_TABLE[COOLDOWN_TABLE.length - 1].waitMinutes
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface Props {
  targetLat?: number
  targetLng?: number
}

export function CooldownTimer({ targetLat, targetLng }: Props): JSX.Element | null {
  const location = useLocationStore((s) => s.location)
  const [countdown, setCountdown] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  const fromLat = location?.lat
  const fromLng = location?.lng
  const toLat = targetLat ?? parseFloat(manualLat)
  const toLng = targetLng ?? parseFloat(manualLng)

  const hasCoords = fromLat != null && fromLng != null && !isNaN(toLat) && !isNaN(toLng)
  const distanceKm = hasCoords ? haversine(fromLat!, fromLng!, toLat, toLng) : 0
  const waitMinutes = hasCoords ? Math.round(calcCooldown(distanceKm) * 10) / 10 : 0
  const waitSeconds = Math.round(waitMinutes * 60)

  const startTimer = (): void => {
    setCountdown(waitSeconds)
    setTimerActive(true)
  }

  useEffect(() => {
    if (!timerActive || countdown <= 0) {
      if (countdown <= 0) setTimerActive(false)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [timerActive, countdown])

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-sm font-semibold mb-2 text-foreground">Cooldown Calculator</h3>

      {!targetLat && (
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Target Lat"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-input border border-border rounded text-foreground placeholder:text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Target Lng"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-input border border-border rounded text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )}

      {hasCoords && (
        <div className="mb-2 text-xs space-y-0.5">
          <div className="text-muted-foreground">Distance: {distanceKm.toFixed(1)} km</div>
          <div className={waitMinutes > 0 ? 'text-yellow-400 font-medium' : 'text-green-400'}>
            Wait: {waitMinutes > 0 ? `${waitMinutes} min` : 'None required'}
          </div>
        </div>
      )}

      {waitSeconds > 0 && !timerActive && (
        <button
          onClick={startTimer}
          className="w-full py-1.5 text-xs bg-secondary text-secondary-foreground rounded-md hover:opacity-80"
        >
          Start Countdown
        </button>
      )}

      {timerActive && (
        <div className="text-center">
          <div className={`text-2xl font-mono font-bold ${countdown <= 30 ? 'text-green-400' : 'text-yellow-400'}`}>
            {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
          </div>
          <p className="text-xs text-muted-foreground">
            {countdown > 0 ? 'Wait before taking action...' : 'Safe to act!'}
          </p>
        </div>
      )}
    </div>
  )
}
