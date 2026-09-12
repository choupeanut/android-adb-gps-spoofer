import { createServer } from 'http'
import { resolve, relative, isAbsolute, join, extname } from 'path'
import { readFile, realpath, stat } from 'fs/promises'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { addBroadcastListener } from '../services/broadcast'
import { log } from '../logger'
import { parseGpx } from '../../shared/gpx'
import { assertCall } from '../../shared/rpc'
import { nextEventRevision } from '../../shared/event-revision'

const DEFAULT_PORT = 3388
const handlerRegistry = new Map<string, (...args: any[]) => any>()
export function registerHandler(channel: string, handler: (...args: any[]) => any): void { handlerRegistry.set(channel, handler) }
export function getHandler(channel: string): ((...args: any[]) => any) | undefined { return handlerRegistry.get(channel) }

function within(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(path)
}

export async function staticPath(root: string, url: string): Promise<string | null> {
  const canonicalRoot = await realpath(root)
  const path = decodeURIComponent(url.split('?')[0])
  if (path.includes('\0') || path.includes('\\')) return null
  const candidate = resolve(canonicalRoot, `.${path.startsWith('/') ? path : `/${path}`}`)
  if (!within(canonicalRoot, candidate)) return null
  const existing = await realpath(candidate).catch(() => null)
  if (existing) {
    if (!within(canonicalRoot, existing)) return null
    if ((await stat(existing)).isFile()) return existing
    const index = await realpath(join(existing, 'index.html')).catch(() => null)
    return index && within(canonicalRoot, index) ? index : null
  }
  // Missing assets should be a 404; only extensionless SPA routes get fallback.
  if (extname(candidate)) return candidate
  const index = await realpath(join(canonicalRoot, 'index.html'))
  return within(canonicalRoot, index) ? index : null
}

async function invoke(message: unknown): Promise<unknown> {
  assertCall(message)
  const handler = handlerRegistry.get(message.channel)
  if (!handler) throw new Error(`Unknown channel: ${message.channel}`)
  return handler(...(message.args ?? []))
}

/** Embedded LAN browser API uses the same command registry as Electron IPC. */
export function startWebServer(rendererDir: string, port = DEFAULT_PORT): ReturnType<typeof createServer> {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '6mb' }))
  app.post('/api/call', async (req, res) => {
    try { res.json({ result: await invoke(req.body) }) }
    catch (error: any) { res.status(400).json({ error: error?.message || 'Command failed' }) }
  })
  app.post('/api/gpx/parse', (req, res) => {
    try { res.json(parseGpx(req.body?.content)) }
    catch (error: any) { res.status(400).json({ error: error?.message || 'GPX parse failed' }) }
  })
  app.get('/api/version', async (_req, res) => {
    try { res.json({ version: await invoke({ channel: 'get-app-version' }) }) }
    catch { res.status(500).json({ error: 'Version unavailable' }) }
  })
  app.get('/api/client-ip', (req, res) => res.json({ ip: req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? null }))
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown API endpoint' }) })
  app.get('*', async (req, res) => {
    try {
      const path = await staticPath(rendererDir, req.originalUrl)
      if (!path) { res.status(403).send('Forbidden'); return }
      if (!(await stat(path).catch(() => null))?.isFile()) { res.status(404).send('Not found'); return }
      const content = await readFile(path)
      res.setHeader('Cache-Control', /[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\./.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache')
      res.type(extname(path)).send(content)
    } catch { res.status(400).send('Invalid path') }
  })
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error?.status === 413 ? 413 : 400).json({ error: 'Invalid request body' })
  })
  const server = createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024,
    verifyClient: ({ origin, req }) => {
      if (!origin) return true
      try { return new URL(origin).host === req.headers.host } catch { return false }
    }
  })
  const send = (ws: WebSocket, data: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)) }
  const unsubscribe = addBroadcastListener((channel, data) => {
    for (const ws of wss.clients) send(ws, { type: 'event', channel, data })
  })
  wss.on('connection', (ws) => {
    // Registry snapshot handlers are synchronous today; keep a single revision
    // so the client can reject a snapshot overtaken by live events.
    const revision = nextEventRevision()
    void (async () => {
      const devices: any = await invoke({ channel: 'get-devices' })
      const serial = devices.activeDevice ?? undefined
      const location: any = await invoke({ channel: 'get-location-state', args: [serial] })
      const route = await invoke({ channel: 'route-get-state', args: [serial] })
      send(ws, { type: 'init', data: { ...devices, serial, revision, ...location, route } })
    })().catch(() => {})
    ws.on('message', async (raw) => {
      let id: string | undefined
      try {
        const message = JSON.parse(raw.toString())
        assertCall(message)
        if (!message.id) throw new Error('Missing command id')
        id = message.id
        send(ws, { type: 'response', id, result: await invoke(message) })
      } catch (error: any) { send(ws, { type: 'response', id, error: error?.message || 'Command failed' }) }
    })
    ws.on('error', () => {})
  })
  const close = server.close.bind(server)
  server.close = (callback) => {
    unsubscribe()
    for (const ws of wss.clients) ws.terminate()
    wss.close()
    return close(callback)
  }
  server.listen(port, '0.0.0.0', () => log('ok', `[WebServer] listening on port ${(server.address() as any)?.port}`))
  server.on('error', (error: any) => log('error', `[WebServer] ${error.message}`))
  return server
}
