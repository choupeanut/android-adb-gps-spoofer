import { describe, it, expect, vi } from 'vitest'
import { CommandGate } from '../../src/shared/command-gate'
it('drains a start already in progress before final provider cleanup and rejects later commands', async () => {
  const gate = new CommandGate()
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  const started = vi.fn()
  const events: string[] = []
  const operation = gate.run(async () => { started(); await delayed; events.push('provider started') })
  expect(started).toHaveBeenCalledOnce()
  const shutdown = (async () => { await gate.closeAndDrain(); events.push('provider removed') })()
  expect(() => gate.run(() => events.push('late start'))).toThrow('shutting down')
  expect(events).toEqual([])
  release(); await operation; await shutdown
  expect(events).toEqual(['provider started', 'provider removed'])
})
it('still drains failed commands and preserves synchronous handler behavior', async () => {
  const gate = new CommandGate()
  expect(gate.run(() => 42)).toBe(42)
  const request = gate.run(async () => { throw new Error('ADB unavailable') })
  await expect(request).rejects.toThrow('ADB unavailable')
  await expect(gate.closeAndDrain()).resolves.toBeUndefined()
})
