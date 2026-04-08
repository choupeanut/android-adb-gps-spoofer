/**
 * Standalone broadcast — no Electron dependencies.
 * WebSocket listeners only.
 */
export type BroadcastListener = (channel: string, data: unknown) => void

const listeners: Set<BroadcastListener> = new Set()

export function addBroadcastListener(listener: BroadcastListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function broadcast(channel: string, data: unknown): void {
  for (const listener of listeners) {
    try { listener(channel, data) } catch { /* ignore */ }
  }
}
