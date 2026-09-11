let revision = 0

/**
 * Monotonic ordering for renderer snapshots emitted by one runtime.
 *
 * Route and location engines share this counter so a late callback from an
 * older mode cannot overwrite a newer position in the renderer.
 */
export function nextEventRevision(): number {
  revision += 1
  return revision
}
