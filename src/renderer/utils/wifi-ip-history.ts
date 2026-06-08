import type { WifiIpHistoryEntry } from '@shared/types'

export const WIFI_IP_HISTORY_LIMIT = 20

export function sortWifiIpHistory(entries: WifiIpHistoryEntry[]): WifiIpHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (b.useCount !== a.useCount) return b.useCount - a.useCount
    return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
  })
}

export function mergeWifiIpHistory(...groups: WifiIpHistoryEntry[][]): WifiIpHistoryEntry[] {
  const merged = new Map<string, WifiIpHistoryEntry>()
  for (const group of groups) {
    for (const entry of group) {
      const key = `${entry.ip}:${entry.port}`
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, entry)
        continue
      }
      merged.set(key, {
        ip: entry.ip,
        port: entry.port,
        useCount: Math.max(existing.useCount, entry.useCount),
        lastUsedAt: new Date(existing.lastUsedAt).getTime() > new Date(entry.lastUsedAt).getTime()
          ? existing.lastUsedAt
          : entry.lastUsedAt
      })
    }
  }
  return sortWifiIpHistory(Array.from(merged.values())).slice(0, WIFI_IP_HISTORY_LIMIT)
}

export function recordWifiIpLocally(
  entries: WifiIpHistoryEntry[],
  ip: string,
  port: number,
  now = new Date().toISOString()
): WifiIpHistoryEntry[] {
  const cleanIp = ip.trim()
  const cleanPort = Number.isFinite(port) ? port : 5555
  if (!cleanIp) return sortWifiIpHistory(entries).slice(0, WIFI_IP_HISTORY_LIMIT)

  let found = false
  const next = entries.map((entry) => {
    if (entry.ip === cleanIp && entry.port === cleanPort) {
      found = true
      return { ...entry, useCount: entry.useCount + 1, lastUsedAt: now }
    }
    return entry
  })

  if (!found) {
    next.push({ ip: cleanIp, port: cleanPort, useCount: 1, lastUsedAt: now })
  }

  return sortWifiIpHistory(next).slice(0, WIFI_IP_HISTORY_LIMIT)
}
