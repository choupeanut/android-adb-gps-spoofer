import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import { isAbsolute } from 'path'

const require = createRequire(import.meta.url)

describe('Tailwind content configuration', () => {
  it('uses absolute content globs so root and web cwd builds scan the same sources', () => {
    const config = require('../../tailwind.config.js') as { content: string[] }

    expect(config.content.length).toBeGreaterThan(0)
    expect(config.content.every((pattern) => isAbsolute(pattern))).toBe(true)
  })
})
