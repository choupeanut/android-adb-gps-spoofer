import { describe, expect, it } from 'vitest'
import { Database as Desktop } from '../../src/main/services/db'
import { Database as Web } from '../../web/server/services/db'

for (const [runtime, create] of [['desktop', () => new Desktop(false, ':memory:')], ['web', () => new Web(':memory:')]] as const) {
  describe(`${runtime} atomic history`, () => {
    it('retains newest ids on identical timestamps and rolls back insertion when pruning fails', () => {
      const database = create()
      const raw = (database as any).db
      try {
        raw.exec("CREATE TRIGGER fixed_history_time AFTER INSERT ON location_history BEGIN UPDATE location_history SET visited_at='2026-01-01' WHERE id=NEW.id; END")
        for (let i = 0; i < 101; i++) database.addHistory(0, i)
        expect(database.getHistory().map((row) => row.id)).toEqual(Array.from({ length: 100 }, (_, i) => 101 - i))
        raw.exec("CREATE TRIGGER fail_prune BEFORE DELETE ON location_history BEGIN SELECT RAISE(ABORT, 'prune failed'); END")
        expect(() => database.addHistory(1, 1)).toThrow('prune failed')
        expect(database.getHistory()).toHaveLength(100)
        expect(database.getHistory()[0].id).toBe(101)
        expect(raw.prepare('SELECT count(*) AS n FROM location_history').get().n).toBe(100)
      } finally { database.close() }
    })
    it('rejects malformed history coordinates and saved names without changing storage', () => {
      const database = create()
      try {
        expect(() => database.addHistory('1' as any, 2)).toThrow()
        expect(() => database.addHistory(1, Infinity)).toThrow()
        expect(database.getHistory()).toEqual([])
        const saved = database.addSavedLocation('Home', 1, 2)
        expect(database.renameSavedLocation(saved.id, null as any)).toMatchObject({ ok: false, code: 'invalid-name' })
        expect(() => database.addSavedLocation({} as any, 1, 2)).toThrow('Location name')
        expect(database.getSavedLocations()).toEqual([saved])
      } finally { database.close() }
    })
  })
}
