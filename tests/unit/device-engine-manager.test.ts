import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeviceEngineManager } from '../../src/main/services/device-engine-manager'

// Mock AdbService — just needs to be a minimal object
const mockAdb = {
  listDevices: vi.fn().mockResolvedValue([]),
  pushLocation: vi.fn().mockResolvedValue(undefined),
  enableMockLocation: vi.fn().mockResolvedValue(true),
  removeTestProvider: vi.fn().mockResolvedValue(undefined),
  maybeDisableMasterLocationForSpoof: vi.fn().mockResolvedValue(undefined),
  maybeRestoreMasterLocation: vi.fn().mockResolvedValue(undefined),
  getRealLocation: vi.fn().mockResolvedValue(null),
  runShell: vi.fn().mockResolvedValue('')
} as any

describe('DeviceEngineManager', () => {
  let manager: DeviceEngineManager

  beforeEach(() => {
    manager = new DeviceEngineManager(mockAdb)
  })

  it('creates engines for a serial on first call', () => {
    const engines = manager.getEngines('device-1')
    expect(engines).toBeDefined()
    expect(engines.location).toBeDefined()
    expect(engines.route).toBeDefined()
  })

  it('returns same instance on second call', () => {
    const first = manager.getEngines('device-1')
    const second = manager.getEngines('device-1')
    expect(first).toBe(second)
  })

  it('creates different engines for different serials', () => {
    const a = manager.getEngines('device-a')
    const b = manager.getEngines('device-b')
    expect(a).not.toBe(b)
    expect(a.location).not.toBe(b.location)
  })

  it('peekEngines returns undefined for unknown serial', () => {
    expect(manager.peekEngines('unknown')).toBeUndefined()
  })

  it('peekEngines returns engines after getEngines', () => {
    manager.getEngines('device-1')
    expect(manager.peekEngines('device-1')).toBeDefined()
  })

  it('removeDevice disposes engines', () => {
    const engines = manager.getEngines('device-1')
    const disposeLoc = vi.spyOn(engines.location, 'dispose')
    const disposeRoute = vi.spyOn(engines.route, 'dispose')

    manager.removeDevice('device-1')

    expect(disposeLoc).toHaveBeenCalled()
    expect(disposeRoute).toHaveBeenCalled()
    expect(manager.peekEngines('device-1')).toBeUndefined()
  })

  it('subsequent getEngines after removeDevice creates new instance', () => {
    const first = manager.getEngines('device-1')
    manager.removeDevice('device-1')
    const second = manager.getEngines('device-1')
    expect(second).not.toBe(first)
  })

  it('getActiveSerials returns all engine serials', () => {
    manager.getEngines('a')
    manager.getEngines('b')
    manager.getEngines('c')
    const serials = manager.getActiveSerials()
    expect(serials).toHaveLength(3)
    expect(serials).toContain('a')
    expect(serials).toContain('b')
    expect(serials).toContain('c')
  })

  it('pruneDisconnected removes engines for missing serials', () => {
    manager.getEngines('a')
    manager.getEngines('b')
    manager.getEngines('c')

    manager.pruneDisconnected(new Set(['a', 'c']))

    expect(manager.peekEngines('a')).toBeDefined()
    expect(manager.peekEngines('b')).toBeUndefined()
    expect(manager.peekEngines('c')).toBeDefined()
  })

  it('getDeviceState returns idle for unknown device', () => {
    const state = manager.getDeviceState('unknown')
    expect(state).toEqual({ mode: 'idle', playing: false, wandering: false })
  })

  it('stopAll resolves without error', async () => {
    manager.getEngines('a')
    manager.getEngines('b')
    await expect(manager.stopAll('immediate')).resolves.not.toThrow()
  })

  it('dispose clears all engines', () => {
    manager.getEngines('a')
    manager.getEngines('b')
    manager.dispose()
    expect(manager.getActiveSerials()).toHaveLength(0)
  })
})
