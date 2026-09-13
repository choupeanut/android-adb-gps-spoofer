/** One display owner, monotonic events, and request tickets invalidated by events/selection/reconnect. */
export class DisplayEvents {
  private epoch = 0
  private revisions = new Map<string, number>()
  constructor(private owner: () => string | undefined) {}
  invalidate(): void { this.epoch++ }
  reset(): void { this.invalidate(); this.revisions.clear() }
  ticket(): () => boolean {
    const epoch = this.epoch, serial = this.owner()
    return () => epoch === this.epoch && serial === this.owner()
  }
  accept(data: { serial?: string; revision?: number }): boolean {
    const serial = this.owner()
    if (!serial || data.serial !== serial) return false
    const revision = data.revision
    const previous = this.revisions.get(serial)
    if (typeof revision === 'number' && Number.isFinite(revision)) {
      if (previous !== undefined && revision < previous) return false
      this.revisions.set(serial, revision)
    }
    this.epoch++
    return true
  }
}

export function isRoutePaused(state: {playing?: boolean; finishedNaturally?: boolean; wandering?: boolean; waypoints?: unknown[]}, mode: string): boolean {
  return mode === 'route' && !state.playing && !state.finishedNaturally && !state.wandering && (state.waypoints?.length ?? 0) >= 2
}
