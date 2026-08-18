import type BetterSqlite3 from 'better-sqlite3'
import { isValidCoordinates } from './coordinate-validation'
import type { SavedLocation, SavedLocationMutationResult } from './types'

const SAVED_LOCATION_COLUMNS = `
  id,
  name,
  lat,
  lng,
  created_at AS createdAt,
  last_used_at AS lastUsedAt
`

export function normalizeSavedLocationName(name: string): string | null {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 80 ? trimmed : null
}

function isValidSavedLocationId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0
}

export class SavedLocationRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
        last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
      );
    `)

    const columns = this.db.prepare('PRAGMA table_info(saved_locations)').all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'last_used_at')) {
      this.db.exec('ALTER TABLE saved_locations ADD COLUMN last_used_at TEXT')
    }
    this.db.exec(`
      UPDATE saved_locations
      SET last_used_at = COALESCE(last_used_at, created_at, strftime('%Y-%m-%d %H:%M:%f', 'now'))
      WHERE last_used_at IS NULL
    `)
  }

  getAll(): SavedLocation[] {
    return this.db.prepare(`
      SELECT ${SAVED_LOCATION_COLUMNS}
      FROM saved_locations
      ORDER BY last_used_at DESC, created_at DESC, id DESC
    `).all() as SavedLocation[]
  }

  add(name: string, lat: number, lng: number): SavedLocation {
    const cleanName = normalizeSavedLocationName(name)
    if (!cleanName) throw new Error('Location name must be between 1 and 80 characters.')
    if (!isValidCoordinates(lat, lng)) throw new Error('Saved location coordinates are invalid.')

    const result = this.db.prepare(`
      INSERT INTO saved_locations (name, lat, lng, created_at, last_used_at)
      VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))
    `).run(cleanName, lat, lng)
    return this.getById(Number(result.lastInsertRowid))!
  }

  rename(id: number, name: string): SavedLocationMutationResult {
    if (!isValidSavedLocationId(id)) {
      return { ok: false, code: 'invalid-id', message: 'Saved location id is invalid.' }
    }
    const cleanName = normalizeSavedLocationName(name)
    if (!cleanName) {
      return { ok: false, code: 'invalid-name', message: 'Location name must be between 1 and 80 characters.' }
    }
    const result = this.db.prepare('UPDATE saved_locations SET name = ? WHERE id = ?').run(cleanName, id)
    if (result.changes === 0) {
      return { ok: false, code: 'not-found', message: 'Saved location was not found.' }
    }
    return { ok: true, location: this.getById(id)! }
  }

  touch(id: number): SavedLocationMutationResult {
    if (!isValidSavedLocationId(id)) {
      return { ok: false, code: 'invalid-id', message: 'Saved location id is invalid.' }
    }
    const result = this.db.prepare(`
      UPDATE saved_locations
      SET last_used_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE id = ?
    `).run(id)
    if (result.changes === 0) {
      return { ok: false, code: 'not-found', message: 'Saved location was not found.' }
    }
    return { ok: true, location: this.getById(id)! }
  }

  delete(id: number): void {
    if (!isValidSavedLocationId(id)) return
    this.db.prepare('DELETE FROM saved_locations WHERE id = ?').run(id)
  }

  private getById(id: number): SavedLocation | undefined {
    return this.db.prepare(`
      SELECT ${SAVED_LOCATION_COLUMNS}
      FROM saved_locations
      WHERE id = ?
    `).get(id) as SavedLocation | undefined
  }
}
