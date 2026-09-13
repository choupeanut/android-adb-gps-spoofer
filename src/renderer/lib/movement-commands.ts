/** Shared across component instances/remounts. Cleanup completes before a successor can start.
 * A single lane also preserves backend shared-route groups whose membership can overlap targets.
 */
let tail: Promise<unknown> = Promise.resolve()
export function movementCommand<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation)
  tail = result.catch(() => {})
  return result
}

/** Guard both setup and the remote start response inside the same ownership lane. */
export function startMovement(options: {
  cancelled: () => boolean
  prepare: () => Promise<void>
  start: () => Promise<unknown>
  cleanup: () => Promise<unknown>
}): Promise<boolean> {
  return movementCommand(async () => {
    if (options.cancelled()) return false
    await options.prepare()
    if (options.cancelled()) return false
    await options.start()
    if (options.cancelled()) {
      await options.cleanup()
      return false
    }
    return true
  })
}

const cancellations = new Set<() => void>()
export function onMovementCancelled(callback: () => void): () => void {
  cancellations.add(callback)
  return () => { cancellations.delete(callback) }
}
/** Global Stop All / explicit mode handoff invalidates deferred and active UI owners first. */
export function cancelMovement(): void {
  for (const callback of cancellations) callback()
}
