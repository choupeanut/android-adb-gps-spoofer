import { onMovementCancelled } from '../../lib/movement-commands'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useDeviceStore } from '../../stores/device.store'
import { useLocationStore } from '../../stores/location.store'
import { useRouteStore } from '../../stores/route.store'
import { createJoystickSession, joystickStep } from '../../lib/joystick-session'
import { Badge } from '../ui/Badge'

export function Joystick(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    let manager: any
    let active = false
    let pointerActive = false
    let pointer = { dx: 0, dy: 0 }
    const keys = new Set<string>()
    const report = (error: unknown): void => {
      if (!disposed) { setError(String(error)); setIsActive(false) }
    }
    const session = createJoystickSession(window.api, report)
    const stop = (): void => {
      active = false
      pointerActive = false
      keys.clear()
      pointer = { dx: 0, dy: 0 }
      session.stop()
      if (!disposed) setIsActive(false)
    }
    const unsubscribeCancellation = onMovementCancelled(stop)
    const start = (): boolean => {
      if (active) return true
      const targets = useDeviceStore.getState().getTargetSerials()
      if (!targets.length) return false
      active = true
      setIsActive(true)
      setError('')
      void session.start(targets, async () => {
        if (useRouteStore.getState().playing) {
          await window.api.routePause(targets)
        }
      })
      return true
    }
    const movementKeys = new Set(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
    const keyName = (key: string): string => key.length === 1 ? key.toLowerCase() : key
    const blocked = (target: EventTarget | null): boolean =>
      !!document.querySelector('[role="dialog"],dialog[open]') ||
      (target instanceof Element && !!target.closest('input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))
    const down = (event: KeyboardEvent): void => {
      const key = keyName(event.key)
      if (!movementKeys.has(key) || blocked(event.target)) return
      if (!start()) return
      event.preventDefault()
      keys.add(key)
    }
    const up = (event: KeyboardEvent): void => {
      const key = keyName(event.key)
      if (!movementKeys.has(key) || !keys.has(key)) return
      keys.delete(key)
      if (!keys.size && !pointerActive) stop()
    }
    let previous = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      const seconds = Math.min((now - previous) / 1000, 0.25)
      previous = now
      const targets = session.targets()
      const location = useLocationStore.getState().location
      if (!active || !targets || !location) return
      if (document.querySelector('[role="dialog"],dialog[open]')) { stop(); return }
      const dx = keys.size ? Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft')) : pointer.dx
      const dy = keys.size ? Number(keys.has('w') || keys.has('ArrowUp')) - Number(keys.has('s') || keys.has('ArrowDown')) : pointer.dy
      if (!dx && !dy) return
      const speed = useRouteStore.getState().speedMs
      const next = joystickStep(location, dx, dy, speed, seconds)
      useLocationStore.getState().setLocation({ ...location, lat: next.lat, lng: next.lng, bearing: next.bearing, speed, timestamp: Date.now() })
      void window.api.updatePosition(next.lat, next.lng, next.bearing, speed, targets).catch((error) => { stop(); report(error) })
    }, 100)
    void import('nipplejs').then((mod) => {
      if (disposed || !containerRef.current) return
      manager = (mod.default ?? mod).create({ zone: containerRef.current, mode: 'static', position: { left: '50%', top: '50%' }, color: 'rgba(99, 179, 237, 0.8)', size: 100 })
      manager.on('start', () => { pointerActive = start() })
      manager.on('move', (_event: unknown, data: any) => {
        if (!Number.isFinite(data?.angle?.degree)) return
        const radians = data.angle.degree * Math.PI / 180
        pointer = { dx: Math.cos(radians), dy: Math.sin(radians) }
      })
      manager.on('end', () => { pointerActive = false; pointer = { dx: 0, dy: 0 }; if (!keys.size) stop() })
    }).catch(report)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', stop)
    const unsubscribe = useDeviceStore.subscribe((state, previous) => {
      if (state.activeDevice !== previous.activeDevice || state.selectedSerials !== previous.selectedSerials) stop()
    })
    return () => {
      disposed = true
      stop()
      session.dispose()
      unsubscribeCancellation()
      clearInterval(timer)
      manager?.destroy()
      unsubscribe()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', stop)
    }
  }, [])

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
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
