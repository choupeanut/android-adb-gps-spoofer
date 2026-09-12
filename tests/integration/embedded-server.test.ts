import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { startWebServer, registerHandler, staticPath } from '../../src/main/server'

describe('actual embedded browser server', () => {
  let directory: string
  let root: string
  let server: ReturnType<typeof startWebServer>
  let origin: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gps-lan-'))
    root = join(directory, 'renderer'); await mkdir(root)
    await writeFile(join(root, 'index.html'), '<h1>Browser entry</h1>')
    registerHandler('get-app-version', () => 'test-version')
    registerHandler('get-devices', () => ({ devices: [], activeDevice: null }))
    registerHandler('get-location-state', () => ({ mode: 'idle', location: null }))
    registerHandler('route-get-state', () => null)
    server = startWebServer(root, 0)
    await once(server, 'listening')
    origin = `http://127.0.0.1:${(server.address() as any).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  })
  it('serves index, API calls, version and GPX in browser adapter format', async () => {
    expect(await (await fetch(origin)).text()).toContain('Browser entry')
    expect(await (await fetch(`${origin}/api/version`)).json()).toEqual({ version: 'test-version' })
    const call = await fetch(`${origin}/api/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'get-devices' }) })
    expect(await call.json()).toEqual({ result: { devices: [], activeDevice: null } })
    const gpx = await fetch(`${origin}/api/gpx/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '<gpx><rte><rtept lat="25" lon="121"/></rte></gpx>' }) })
    expect(await gpx.json()).toEqual([{ lat: 25, lng: 121, altitude: 0 }])
    expect((await fetch(`${origin}/missing.js`)).status).toBe(404)
  })
  it('rejects sibling-prefix traversal and symlink escapes', async () => {
    const sibling = join(directory, 'renderer-other'); await mkdir(sibling)
    await writeFile(join(sibling, 'secret.txt'), 'synthetic fixture')
    await symlink(join(sibling, 'secret.txt'), join(root, 'link.txt'))
    expect(await staticPath(root, '/../renderer-other/secret.txt')).toBeNull()
    expect((await fetch(`${origin}/%2e%2e%2frenderer-other/secret.txt`)).status).toBe(403)
    expect((await fetch(`${origin}/link.txt`)).status).toBe(403)
  })
  it('rejects invalid envelopes before invoking the registered handler', async () => {
    const handler = vi.fn(); registerHandler('test-command', handler)
    const response = await fetch(`${origin}/api/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'test-command', args: 'invalid' }) })
    expect(response.status).toBe(400); expect(handler).not.toHaveBeenCalled()
  })
  it('sends a real WS init and command response, and closes connected sockets', async () => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/ws')
    const message = once(ws, 'message')
    await once(ws, 'open')
    expect(JSON.parse(String((await message)[0])).type).toBe('init')
    const response = once(ws, 'message')
    ws.send(JSON.stringify({ id: '1', channel: 'get-app-version', args: [] }))
    expect(JSON.parse(String((await response)[0]))).toEqual({ type: 'response', id: '1', result: 'test-version' })
    const closed = once(ws, 'close')
    server.close()
    await closed
    // afterEach close is idempotent at the test harness boundary.
    server.close = (cb: any) => { cb?.(); return server }
  })
})
