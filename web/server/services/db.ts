/**
 * Standalone Database — uses DATA_DIR env var instead of Electron's app.getPath().
 */
import BetterSqlite3 from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { SavedLocationRepository } from '@shared/saved-location-repository'
import type { SavedLocation, SavedLocationMutationResult, WifiIpHistoryEntry } from '@shared/types'

const MAX_HISTORY = 100

export class Database {
  private db: BetterSqlite3.Database
  private savedLocations: SavedLocationRepository

  constructor(dbPathOverride?: string) {
    const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data')
    if (!dbPathOverride) mkdirSync(dataDir, { recursive: true })
    const dbPath = dbPathOverride ?? join(dataDir, 'pikmin-keep.db')
    this.db = new BetterSqlite3(dbPath)
    this.savedLocations = new SavedLocationRepository(this.db)
    this.init()
  }

  private init(): void {
    this.savedLocations.init()
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS location_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        visited_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS session (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wifi_ip_history (
        ip TEXT NOT NULL,
        port INTEGER NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (ip, port)
      );
    `)
  }

  getSession(): Record<string, unknown> | null {
    const row = this.db.prepare("SELECT value FROM session WHERE key = 'main'").get() as { value: string } | undefined
    if (!row) return null
    try { return JSON.parse(row.value) } catch { return null }
  }

  saveSession(data: Record<string, unknown>): void {
    this.db.prepare(
      "INSERT INTO session (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(JSON.stringify(data))
  }

  getSavedLocations(): SavedLocation[] {
    return this.savedLocations.getAll()
  }

  addSavedLocation(name: string, lat: number, lng: number): SavedLocation {
    return this.savedLocations.add(name, lat, lng)
  }

  renameSavedLocation(id: number, name: string): SavedLocationMutationResult {
    return this.savedLocations.rename(id, name)
  }

  touchSavedLocation(id: number): SavedLocationMutationResult {
    return this.savedLocations.touch(id)
  }

  deleteSavedLocation(id: number): void {
    this.savedLocations.delete(id)
  }

  getHistory(): Array<{ id: number; lat: number; lng: number; visited_at: string }> {
    return this.db.prepare('SELECT * FROM location_history ORDER BY visited_at DESC LIMIT ?').all(MAX_HISTORY) as any[]
  }

  addHistory(lat: number, lng: number): void {
    this.db.prepare('INSERT INTO location_history (lat, lng) VALUES (?, ?)').run(lat, lng)
    this.db.prepare('DELETE FROM location_history WHERE id NOT IN (SELECT id FROM location_history ORDER BY visited_at DESC LIMIT ?)').run(MAX_HISTORY)
  }

  getWifiIpHistory(): WifiIpHistoryEntry[] {
    return this.db
      .prepare(`
        SELECT ip, port, use_count as useCount, last_used_at as lastUsedAt
        FROM wifi_ip_history
        ORDER BY use_count DESC, last_used_at DESC
        LIMIT 20
      `)
      .all() as WifiIpHistoryEntry[]
  }

  recordWifiIp(ip: string, port: number): WifiIpHistoryEntry[] {
    const cleanIp = ip.trim()
    const cleanPort = Number.isFinite(port) ? port : 5555
    if (!cleanIp) return this.getWifiIpHistory()

    this.db.prepare(`
      INSERT INTO wifi_ip_history (ip, port, use_count, last_used_at)
      VALUES (?, ?, 1, datetime('now'))
      ON CONFLICT(ip, port) DO UPDATE SET
        use_count = use_count + 1,
        last_used_at = datetime('now')
    `).run(cleanIp, cleanPort)

    return this.getWifiIpHistory()
  }

  deleteWifiIp(ip: string, port: number): void {
    this.db.prepare('DELETE FROM wifi_ip_history WHERE ip = ? AND port = ?').run(ip.trim(), port)
  }

  close(): void {
    this.db.close()
  }
}
