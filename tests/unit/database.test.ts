import { describe, expect, it } from 'vitest'
import { Database } from '../../src/main/services/db'

describe('Database saved locations', () => {
  it('returns stub saved locations with the shared createdAt contract', () => {
    const database = new Database(true)

    const result = database.addSavedLocation('Home', 25, 121)

    expect(result).toMatchObject({
      id: expect.any(Number),
      name: 'Home',
      lat: 25,
      lng: 121,
      createdAt: expect.any(String)
    })
    expect('created_at' in result).toBe(false)
  })
})
