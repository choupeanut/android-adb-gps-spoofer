import { movementCommand, onMovementCancelled } from './movement-commands'
/** Cancellation owns the original target set across every asynchronous boundary. */
export function createJoystickSession(api: {
  enableMockLocation(serial: string): Promise<{ ok: boolean; error?: string }>
  startJoystick(serials: string[]): Promise<unknown>
  stopJoystick(serials: string[]): Promise<unknown>
}, report: (error: unknown) => void) {
  let current: { targets: string[]; cancelled: boolean; ready: boolean } | undefined
  const stop = (): void => {
    const run = current
    current = undefined
    if (!run) return
    run.cancelled = true
    run.ready = false
    void movementCommand(() => api.stopJoystick(run.targets)).catch(report)
  }
  const unsubscribe = onMovementCancelled(stop)
  return {
    stop,
    dispose: (): void => { stop(); unsubscribe() },
    targets: () => current?.ready ? current.targets : undefined,
    start: async (targets: string[], before?: () => Promise<unknown>): Promise<void> => {
      stop()
      const run = { targets: [...targets], cancelled: false, ready: false }
      current = run
      await movementCommand(async () => {
      try {
        if (run.cancelled) return
        if (before) await before()
        if (run.cancelled) return
        const results = await Promise.all(run.targets.map((serial) => api.enableMockLocation(serial)))
        if (run.cancelled) return
        const failed = results.find((result) => !result.ok)
        if (failed) throw new Error(failed.error || 'Mock location setup failed')
        await api.startJoystick(run.targets)
        if (run.cancelled) {
          return
        }
        run.ready = true
      } catch (error) {
        if (current === run) stop()
        report(error)
      }
      })
    }
  }
}

/** Great-circle displacement stays finite even at the poles; speed is independent of input force. */
export function joystickStep(location: {lat: number; lng: number}, dx: number, dy: number, speed: number, seconds: number) {
  const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
  const b = bearing * Math.PI / 180
  const distance = speed * seconds / 6371000
  const lat = location.lat * Math.PI / 180
  const lng = location.lng * Math.PI / 180
  const nextLat = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(b))))
  const nextLng = lng + Math.atan2(Math.sin(b) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat))
  return { lat: nextLat * 180 / Math.PI, lng: ((nextLng * 180 / Math.PI + 540) % 360) - 180, bearing }
}
