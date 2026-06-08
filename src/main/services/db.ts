import BetterSqlite3 from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import type { SavedLocation, WifiIpHistoryEntry } from '@shared/types'

const MAX_HISTORY = 100

export class Database {
  private db: BetterSqlite3.Database | null

  constructor(stub = false) {
    if (stub) {
      this.db = null
      return
    }
    const dbPath = join(app.getPath('userData'), 'pikmin-keep.db')
    this.db = new BetterSqlite3(dbPath)
    this.init()
  }

  private init(): void {
    if (!this.db) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

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
    if (!this.db) return null
    const row = this.db.prepare("SELECT value FROM session WHERE key = 'main'").get() as { value: string } | undefined
    if (!row) return null
    try { return JSON.parse(row.value) } catch { return null }
  }

  saveSession(data: Record<string, unknown>): void {
    if (!this.db) return
    this.db.prepare(
      "INSERT INTO session (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(JSON.stringify(data))
  }

  getSavedLocations(): SavedLocation[] {
    if (!this.db) return []
    const rows = this.db.prepare('SELECT * FROM saved_locations ORDER BY created_at DESC').all()
    return rows as SavedLocation[]
  }

  addSavedLocation(name: string, lat: number, lng: number): SavedLocation {
    if (!this.db) return { id: -1, name, lat, lng, created_at: new Date().toISOString() }
    const stmt = this.db.prepare(
      'INSERT INTO saved_locations (name, lat, lng) VALUES (?, ?, ?)'
    )
    const result = stmt.run(name, lat, lng)
    return this.db
      .prepare('SELECT * FROM saved_locations WHERE id = ?')
      .get(result.lastInsertRowid) as SavedLocation
  }

  deleteSavedLocation(id: number): void {
    if (!this.db) return
    this.db.prepare('DELETE FROM saved_locations WHERE id = ?').run(id)
  }

  getHistory(): Array<{ id: number; lat: number; lng: number; visited_at: string }> {
    if (!this.db) return []
    return this.db
      .prepare('SELECT * FROM location_history ORDER BY visited_at DESC LIMIT ?')
      .all(MAX_HISTORY) as any[]
  }

  addHistory(lat: number, lng: number): void {
    if (!this.db) return
    this.db.prepare('INSERT INTO location_history (lat, lng) VALUES (?, ?)').run(lat, lng)
    // Prune old entries
    this.db
      .prepare(
        'DELETE FROM location_history WHERE id NOT IN (SELECT id FROM location_history ORDER BY visited_at DESC LIMIT ?)'
      )
      .run(MAX_HISTORY)
  }

  getWifiIpHistory(): WifiIpHistoryEntry[] {
    if (!this.db) return []
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
    if (!this.db) return []
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
    if (!this.db) return
    this.db.prepare('DELETE FROM wifi_ip_history WHERE ip = ? AND port = ?').run(ip.trim(), port)
  }
}
