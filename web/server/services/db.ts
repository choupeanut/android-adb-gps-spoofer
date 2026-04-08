/**
 * Standalone Database — uses DATA_DIR env var instead of Electron's app.getPath().
 */
import BetterSqlite3 from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { SavedLocation } from '@shared/types'

const MAX_HISTORY = 100

export class Database {
  private db: BetterSqlite3.Database

  constructor() {
    const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data')
    mkdirSync(dataDir, { recursive: true })
    const dbPath = join(dataDir, 'pikmin-keep.db')
    this.db = new BetterSqlite3(dbPath)
    this.init()
  }

  private init(): void {
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
    return this.db.prepare('SELECT * FROM saved_locations ORDER BY created_at DESC').all() as SavedLocation[]
  }

  addSavedLocation(name: string, lat: number, lng: number): SavedLocation {
    const result = this.db.prepare('INSERT INTO saved_locations (name, lat, lng) VALUES (?, ?, ?)').run(name, lat, lng)
    return this.db.prepare('SELECT * FROM saved_locations WHERE id = ?').get(result.lastInsertRowid) as SavedLocation
  }

  deleteSavedLocation(id: number): void {
    this.db.prepare('DELETE FROM saved_locations WHERE id = ?').run(id)
  }

  getHistory(): Array<{ id: number; lat: number; lng: number; visited_at: string }> {
    return this.db.prepare('SELECT * FROM location_history ORDER BY visited_at DESC LIMIT ?').all(MAX_HISTORY) as any[]
  }

  addHistory(lat: number, lng: number): void {
    this.db.prepare('INSERT INTO location_history (lat, lng) VALUES (?, ?)').run(lat, lng)
    this.db.prepare('DELETE FROM location_history WHERE id NOT IN (SELECT id FROM location_history ORDER BY visited_at DESC LIMIT ?)').run(MAX_HISTORY)
  }
}
