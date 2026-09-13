import { movementCommand, onMovementCancelled } from './movement-commands'

export function createRouteCompletion(api: {
  getRealLocation(serial: string): Promise<{lat: number; lng: number} | null>
  routeReturnToGps(lat: number, lng: number, speed: number, serials: string[]): Promise<unknown>
}, settings: () => {returnOnFinish: boolean; speedMs: number}, report: (error: unknown) => void) {
  const revisions = new Map<string, number>()
  const completed = new Map<string, symbol>()
  const groupsBySerial = new Map<string, string>()
  let epoch = 0
  const reset = (): void => { epoch++; revisions.clear(); completed.clear(); groupsBySerial.clear() }
  const unsubscribe = onMovementCancelled(() => { epoch++ })
  return {
    reset,
    dispose(): void { reset(); unsubscribe() },
    accept(data: {serial?: string; revision?: number; state?: {playing: boolean; finishedNaturally: boolean; wandering?: boolean; serials?: string[]}}): void {
      const {serial, state, revision} = data
      if (!serial || !state) return
      const members = [...new Set(state.serials?.length ? state.serials : [serial])].sort()
      const owner = members[0]
      const group = JSON.stringify(members)
      if (!members.includes(serial)) return
      // Reject stale membership before it can invalidate a successor group's token.
      if (typeof revision === 'number' && Number.isFinite(revision)) {
        if (members.some((member) => revision < (revisions.get(member) ?? -Infinity))) return
        for (const member of members) revisions.set(member, revision)
      }
      for (const member of members) {
        const previousGroup = groupsBySerial.get(member)
        if (previousGroup && previousGroup !== group) completed.delete(previousGroup)
        groupsBySerial.set(member, group)
      }
      if (state.playing && !state.finishedNaturally) completed.delete(group)
      if (!state.finishedNaturally || state.wandering || completed.has(group) || !settings().returnOnFinish) return
      const token = Symbol(group), requestEpoch = epoch
      completed.set(group, token)
      void api.getRealLocation(owner).then((gps) => movementCommand(async () => {
        if (epoch !== requestEpoch || completed.get(group) !== token || !settings().returnOnFinish) return
        if (!gps) throw new Error(`No real GPS available for ${owner}; automatic return was not started`)
        await api.routeReturnToGps(gps.lat, gps.lng, settings().speedMs, members)
      })).catch(report)
    }
  }
}
