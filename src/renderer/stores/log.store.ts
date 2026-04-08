import { create } from 'zustand'

export type LogLevel = 'info' | 'ok' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  msg: string
}

interface LogState {
  entries: LogEntry[]
  addEntry: (entry: LogEntry) => void
  setEntries: (entries: LogEntry[]) => void
  clear: () => void
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((s) => ({ entries: [...s.entries.slice(-499), entry] })),
  setEntries: (entries) => set({ entries }),
  clear: () => set({ entries: [] })
}))
