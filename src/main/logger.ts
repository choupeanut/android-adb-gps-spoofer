import { broadcast } from './services/broadcast'

export type LogLevel = 'info' | 'ok' | 'warn' | 'error'

export interface LogEntry {
  ts: number       // Unix ms
  level: LogLevel
  msg: string
}

// In-memory ring buffer (max 500 entries)
const MAX_ENTRIES = 500
const entries: LogEntry[] = []

export function log(level: LogLevel, msg: string): void {
  const entry: LogEntry = { ts: Date.now(), level, msg }

  // Print to console (visible in electron-vite dev terminal)
  const prefix = { info: '[i]', ok: '[✓]', warn: '[!]', error: '[✗]' }[level]
  console.log(`${prefix} ${new Date(entry.ts).toISOString().slice(11, 23)} ${msg}`)

  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()

  // Broadcast to renderer + WebSocket clients
  broadcast('log-entry', entry)
}

export function getLogs(): LogEntry[] {
  return [...entries]
}
