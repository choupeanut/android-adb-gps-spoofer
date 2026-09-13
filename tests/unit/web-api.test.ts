import { registerEngineHandlers } from '../../src/shared/engine-handlers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
class Socket {
  static current: Socket
  onopen?: () => void
  onclose?: () => void
  onmessage?: (event: { data: string }) => void
  onerror?: () => void
  send = vi.fn()
  close = () => this.onclose?.()
  constructor() { Socket.current = this }
}
let api: any
let picker: any
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules()
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '', protocol: 'http:', host: 'localhost:3399', origin: 'http://localhost:3399' })
  vi.stubGlobal('WebSocket', Socket)
  picker = { click: vi.fn(), remove: vi.fn() }
  vi.stubGlobal('document', { createElement: () => picker })
  vi.stubGlobal('fetch', vi.fn())
  await import('../../web/client/web-api')
  api = (window as any).api
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('browser API settlement', () => {
  it('clears a successful WS request timer and retains explicit targets', async () => {
    Socket.current.onopen?.()
    const result = api.stopJoystick(['a'])
    const message = JSON.parse(Socket.current.send.mock.calls[0][0])
    expect(message.args).toEqual([['a']])
    Socket.current.onmessage?.({ data: JSON.stringify({ type: 'response', id: message.id, result: true }) })
    expect(await result).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves omitted route coordinates through JSON and actual engine validation', async () => {
    Socket.current.onopen?.()
    const result = api.routePlay(['a'], 1.4)
    const message = JSON.parse(Socket.current.send.mock.calls[0][0])
    expect(message.args).toEqual([['a'], 1.4])
    const handlers = new Map<string, (...args: any[]) => any>()
    const manager = { playRoute: vi.fn().mockResolvedValue(undefined) }
    registerEngineHandlers((channel, handler) => handlers.set(channel, handler), manager as any, async () => {})
    const response = await handlers.get(message.channel)!(...message.args)
    Socket.current.onmessage?.({ data: JSON.stringify({ type: 'response', id: message.id, result: response }) })
    expect(await result).toBe(true)
    expect(manager.playRoute).toHaveBeenCalledWith(['a'], 1.4, undefined, undefined)
  })
  it('omits undefined serial in REST fallback snapshots', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ result: null }) } as Response)
    await api.getLocationState()
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).args).toEqual([])
  })
  it('rejects pending requests immediately on disconnect', async () => {
    Socket.current.onopen?.()
    const result = api.getDevices()
    const assertion = expect(result).rejects.toThrow('Connection lost')
    Socket.current.close()
    await assertion
    expect(vi.getTimerCount()).toBe(1) // reconnect only
  })
  it('times out REST even if fetch ignores abort', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}))
    const assertion = expect(api.getDevices()).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('settles GPX cancellation and surfaces server parse errors', async () => {
    const cancelled = api.importGpx(); picker.oncancel()
    expect(await cancelled).toEqual([])
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Invalid coordinates' }) } as Response)
    picker.files = [{ size: 10, text: async () => '<gpx/>' }]
    const failed = api.importGpx()
    const assertion = expect(failed).rejects.toThrow('Invalid coordinates')
    await picker.onchange(); await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves teleport mode in init route hydration', () => {
    const callback = vi.fn(); api.onRouteUpdated(callback)
    Socket.current.onmessage?.({ data: JSON.stringify({ type: 'init', data: { devices: [], activeDevice: 'a', serial: 'a', revision: 1, mode: 'teleport', location: { lat: 25, lng: 121 }, route: {} } }) })
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ mode: 'teleport' }))
  })
})
