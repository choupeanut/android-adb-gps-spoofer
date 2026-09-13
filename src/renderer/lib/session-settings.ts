const keys = ['speedMs', 'fixedSpeed', 'loop', 'wanderEnabled', 'wanderRadiusM', 'routeMode', 'routeProfile', 'controlPoints', 'returnOnFinish', 'startFromRealGps'] as const
/** Playback events are deliberately excluded from the user's persisted edits. */
export function settingsFingerprint(state: object): string {
  const values = state as Record<string, unknown>
  return JSON.stringify(keys.map((key) => values[key]))
}
