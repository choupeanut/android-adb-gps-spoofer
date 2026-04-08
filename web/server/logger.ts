/**
 * Standalone logger — no Electron dependencies.
 * Uses broadcast from standalone broadcast module.
 */
import { broadcast } from './broadcast'

export type LogLevel = 'info' | 'ok' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  msg: string
}

const MAX_ENTRIES = 500
const entries: LogEntry[] = []

export function log(level: LogLevel, msg: string): void {
  const entry: LogEntry = { ts: Date.now(), level, msg }
  const prefix = { info: '[i]', ok: '[✓]', warn: '[!]', error: '[✗]' }[level]
  console.log(`${prefix} ${new Date(entry.ts).toISOString().slice(11, 23)} ${msg}`)
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()
  broadcast('log-entry', entry)
}

export function getLogs(): LogEntry[] {
  return [...entries]
}
