import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Database as DesktopDatabase } from '../../src/main/services/db'
import { Database as WebDatabase } from '../../web/server/services/db'

describe('Database saved locations', () => {
  it('returns stub saved locations with the shared camelCase contract', () => {
    const database = new DesktopDatabase(true)

    const result = database.addSavedLocation('Home', 25, 121)

    expect(result).toMatchObject({
      id: expect.any(Number),
      name: 'Home',
      lat: 25,
      lng: 121,
      createdAt: expect.any(String),
      lastUsedAt: expect.any(String)
    })
    expect('created_at' in result).toBe(false)
    expect('last_used_at' in result).toBe(false)
  })

  it('validates rename operations and orders favorites by recent use', async () => {
    const database = new DesktopDatabase(false, ':memory:')
    try {
      const home = database.addSavedLocation('Home', 25, 121)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const office = database.addSavedLocation('Office', 25.04, 121.56)
      expect(database.getSavedLocations().map((location) => location.id)).toEqual([office.id, home.id])

      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(database.touchSavedLocation(home.id)).toMatchObject({ ok: true })
      expect(database.getSavedLocations().map((location) => location.id)).toEqual([home.id, office.id])

      const renamed = database.renameSavedLocation(home.id, '  My Home  ')
      expect(renamed).toMatchObject({ ok: true, location: { name: 'My Home' } })
      expect(database.renameSavedLocation(home.id, '   ')).toMatchObject({
        ok: false,
        code: 'invalid-name'
      })
      expect(database.touchSavedLocation(999)).toMatchObject({ ok: false, code: 'not-found' })
      expect(database.renameSavedLocation(-1, 'Invalid')).toMatchObject({
        ok: false,
        code: 'invalid-id'
      })
    } finally {
      database.close()
    }
  })

  it('migrates a legacy saved_locations table without losing rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gps-spoofer-db-'))
    const dbPath = join(directory, 'legacy.db')
    const legacy = new BetterSqlite3(dbPath)
    legacy.exec(`
      CREATE TABLE saved_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO saved_locations (name, lat, lng, created_at)
      VALUES ('Legacy', 62.015955, -6.853447, '2026-01-02 03:04:05');
    `)
    legacy.close()

    const database = new DesktopDatabase(false, dbPath)
    try {
      expect(database.getSavedLocations()).toEqual([
        {
          id: 1,
          name: 'Legacy',
          lat: 62.015955,
          lng: -6.853447,
          createdAt: '2026-01-02 03:04:05',
          lastUsedAt: '2026-01-02 03:04:05'
        }
      ])
    } finally {
      database.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps the standalone Web database on the same camelCase contract', () => {
    const database = new WebDatabase(':memory:')
    try {
      const saved = database.addSavedLocation('Web Home', 25, 121)
      const row = database.getSavedLocations()[0]

      expect(row).toEqual(saved)
      expect(row).toMatchObject({
        createdAt: expect.any(String),
        lastUsedAt: expect.any(String)
      })
      expect('created_at' in row).toBe(false)
      expect('last_used_at' in row).toBe(false)
    } finally {
      database.close()
    }
  })
})
