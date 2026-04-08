import { BrowserWindow } from 'electron'

/**
 * Broadcast abstraction — sends events to Electron BrowserWindows and registered
 * WebSocket clients. WebSocket listeners are registered by the web server (Phase 1.2).
 */

export type BroadcastListener = (channel: string, data: unknown) => void

const wsListeners: Set<BroadcastListener> = new Set()

export function addBroadcastListener(listener: BroadcastListener): () => void {
  wsListeners.add(listener)
  return () => wsListeners.delete(listener)
}

/**
 * Send an event to all renderer windows and WebSocket clients.
 */
export function broadcast(channel: string, data: unknown): void {
  // Electron windows
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
  // WebSocket listeners (added by web server)
  for (const listener of wsListeners) {
    try { listener(channel, data) } catch { /* ignore disconnected clients */ }
  }
}
