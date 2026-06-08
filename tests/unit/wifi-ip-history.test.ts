import { describe, expect, it } from 'vitest'
import {
  mergeWifiIpHistory,
  recordWifiIpLocally,
  sortWifiIpHistory
} from '../../src/renderer/utils/wifi-ip-history'

describe('wifi IP history utilities', () => {
  it('sorts by use count, then latest use time', () => {
    const sorted = sortWifiIpHistory([
      { ip: '192.168.1.10', port: 5555, useCount: 1, lastUsedAt: '2026-01-01T00:00:00.000Z' },
      { ip: '192.168.1.11', port: 5555, useCount: 3, lastUsedAt: '2026-01-01T00:00:00.000Z' },
      { ip: '192.168.1.12', port: 5555, useCount: 3, lastUsedAt: '2026-01-02T00:00:00.000Z' }
    ])

    expect(sorted.map((entry) => entry.ip)).toEqual([
      '192.168.1.12',
      '192.168.1.11',
      '192.168.1.10'
    ])
  })

  it('merges duplicates by IP and port', () => {
    const merged = mergeWifiIpHistory(
      [{ ip: '192.168.1.10', port: 5555, useCount: 2, lastUsedAt: '2026-01-01T00:00:00.000Z' }],
      [{ ip: '192.168.1.10', port: 5555, useCount: 5, lastUsedAt: '2025-12-01T00:00:00.000Z' }]
    )

    expect(merged).toEqual([
      { ip: '192.168.1.10', port: 5555, useCount: 5, lastUsedAt: '2026-01-01T00:00:00.000Z' }
    ])
  })

  it('records a new local IP and increments repeat entries', () => {
    const first = recordWifiIpLocally([], ' 192.168.1.20 ', 5555, '2026-01-01T00:00:00.000Z')
    expect(first).toEqual([
      { ip: '192.168.1.20', port: 5555, useCount: 1, lastUsedAt: '2026-01-01T00:00:00.000Z' }
    ])

    const second = recordWifiIpLocally(first, '192.168.1.20', 5555, '2026-01-02T00:00:00.000Z')
    expect(second).toEqual([
      { ip: '192.168.1.20', port: 5555, useCount: 2, lastUsedAt: '2026-01-02T00:00:00.000Z' }
    ])
  })
})
