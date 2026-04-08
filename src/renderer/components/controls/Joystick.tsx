import { useEffect, useRef, useState, useCallback } from 'react'
import { useDeviceStore } from '../../stores/device.store'
import { useLocationStore } from '../../stores/location.store'
import { useRouteStore } from '../../stores/route.store'
import { Badge } from '../ui/Badge'

let JoystickManager: any = null

export function Joystick(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const joystickRef = useRef<any>(null)
  const activeRef = useRef(false)
  const [isActive, setIsActive] = useState(false)
  const [joystickReady, setJoystickReady] = useState(false)

  // Use refs so nipplejs callbacks always read fresh values without re-creating
  const locationRef = useRef(useLocationStore.getState().location)
  const speedRef = useRef(useRouteStore.getState().speedMs)

  useEffect(() => useLocationStore.subscribe((s) => { locationRef.current = s.location }), [])
  useEffect(() => useRouteStore.subscribe((s) => { speedRef.current = s.speedMs }), [])

  useEffect(() => {
    import('nipplejs').then((mod) => {
      JoystickManager = mod.default ?? mod
      setJoystickReady(true)
    })
  }, [])

  const startJoystickIfNeeded = useCallback(() => {
    const targetSerials = useDeviceStore.getState().getTargetSerials()
    if (targetSerials.length === 0) return false
    
    // Auto-pause route if currently playing
    const routeState = useRouteStore.getState()
    if (routeState.playing) {
      window.api.routePause()
      useRouteStore.getState().setPlaying(false)
      useRouteStore.getState().setIsPaused(true)
    }
    
    activeRef.current = true
    setIsActive(true)
    Promise.all(targetSerials.map((s) => window.api.enableMockLocation(s))).then(() => {
      window.api.startJoystick(targetSerials)
    })
    return true
  }, [])

  const stopJoystick = useCallback(() => {
    activeRef.current = false
    setIsActive(false)
    window.api.stopJoystick()
  }, [])

  // Create nipplejs once (after dynamic import resolves)
  useEffect(() => {
    if (!containerRef.current || !joystickReady) return

    joystickRef.current = JoystickManager.create({
      zone: containerRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'rgba(99, 179, 237, 0.8)',
      size: 100
    })

    joystickRef.current.on('start', () => {
      startJoystickIfNeeded()
    })

    joystickRef.current.on('move', (_e: any, data: any) => {
      const loc = locationRef.current
      if (!loc || !activeRef.current) return

      const angle = data.angle.degree
      const force = Math.min(data.force, 2) / 2
      const speed = speedRef.current * force

      const brg = ((90 - angle) + 360) % 360
      const radiansPerMeter = 1 / 111320
      const latStep = Math.cos((brg * Math.PI) / 180) * speed * radiansPerMeter
      const lngStep =
        Math.sin((brg * Math.PI) / 180) * speed * radiansPerMeter /
        Math.cos((loc.lat * Math.PI) / 180)

      window.api.updatePosition(loc.lat + latStep, loc.lng + lngStep, brg, speed)
    })

    joystickRef.current.on('end', () => {
      stopJoystick()
    })

    return () => { joystickRef.current?.destroy() }
  }, [joystickReady, startJoystickIfNeeded, stopJoystick])

  // Keyboard WASD support
  useEffect(() => {
    const keysPressed = new Set<string>()
    let animFrame: number

    const moveKeys = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

    const updateFromKeys = (): void => {
      const loc = locationRef.current
      if (!loc) return

      let dx = 0, dy = 0
      if (keysPressed.has('w') || keysPressed.has('ArrowUp'))    dy += 1
      if (keysPressed.has('s') || keysPressed.has('ArrowDown'))  dy -= 1
      if (keysPressed.has('a') || keysPressed.has('ArrowLeft'))  dx -= 1
      if (keysPressed.has('d') || keysPressed.has('ArrowRight')) dx += 1

      if (dx === 0 && dy === 0) return

      const speed = speedRef.current
      const brg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
      const radiansPerMeter = 1 / 111320
      const latStep = dy * speed * radiansPerMeter
      const lngStep = dx * speed * radiansPerMeter / Math.cos((loc.lat * Math.PI) / 180)

      window.api.updatePosition(loc.lat + latStep, loc.lng + lngStep, brg, speed)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      // Don't capture if focus is in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keysPressed.add(e.key)
      if (moveKeys.includes(e.key)) {
        if (!activeRef.current) startJoystickIfNeeded()
        animFrame = requestAnimationFrame(updateFromKeys)
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      keysPressed.delete(e.key)
      if (keysPressed.size === 0 && activeRef.current) stopJoystick()
      cancelAnimationFrame(animFrame)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [startJoystickIfNeeded, stopJoystick])

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className={`relative w-28 h-28 mx-auto rounded-full border-2 transition-all duration-200 ${
          isActive
            ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
            : 'glass border-border/50'
        }`}
      />

      <div className="flex justify-center">
        {isActive ? (
          <Badge variant="success" pulse>
            Moving
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-mono">
            WASD
          </Badge>
        )}
      </div>
    </div>
  )
}
