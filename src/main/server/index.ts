import { createServer, IncomingMessage, ServerResponse } from 'http'
import { join, extname } from 'path'
import { readFile, stat } from 'fs/promises'
import { WebSocketServer, WebSocket } from 'ws'
import { addBroadcastListener } from '../services/broadcast'
import { log } from '../logger'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

const DEFAULT_PORT = 3388

/**
 * Handler registry shared between IPC and WebSocket.
 * IPC register.ts writes handlers here; WebSocket reads them.
 */
const handlerRegistry = new Map<string, (...args: any[]) => any>()

export function registerHandler(channel: string, handler: (...args: any[]) => any): void {
  handlerRegistry.set(channel, handler)
}

export function getHandler(channel: string): ((...args: any[]) => any) | undefined {
  return handlerRegistry.get(channel)
}

/**
 * Embedded HTTP + WebSocket server.
 * - HTTP: serves the renderer build as static files (for phone browser access)
 * - WS: mirrors the IPC surface so browser clients can control the app
 */
export function startWebServer(rendererDir: string, port = DEFAULT_PORT): ReturnType<typeof createServer> {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      let url = req.url ?? '/'
      if (url === '/') url = '/index.html'

      // Strip query string
      const qIdx = url.indexOf('?')
      if (qIdx >= 0) url = url.substring(0, qIdx)

      const filePath = join(rendererDir, url)

      // Security: prevent path traversal
      if (!filePath.startsWith(rendererDir)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      const fileStat = await stat(filePath).catch(() => null)
      if (!fileStat || !fileStat.isFile()) {
        // SPA fallback: serve index.html for non-file routes
        const indexPath = join(rendererDir, 'index.html')
        const html = await readFile(indexPath)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html)
        return
      }

      const ext = extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
      const content = await readFile(filePath)
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
      })
      res.end(content)
    } catch {
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  })

  // ─── WebSocket server ────────────────────────────────────────────────────

  const wss = new WebSocketServer({ server: httpServer })

  // Register a broadcast listener so all WS clients get push events
  addBroadcastListener((channel: string, data: unknown) => {
    const msg = JSON.stringify({ type: 'event', channel, data })
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  })

  wss.on('connection', (ws: WebSocket) => {
    log('info', '[WebServer] WebSocket client connected')

    ws.on('message', async (raw: Buffer | string) => {
      let msgId: string | undefined
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
        const { id, channel, args } = msg
        msgId = id

        if (!channel || !id) {
          ws.send(JSON.stringify({ type: 'error', id, error: 'Missing channel or id' }))
          return
        }

        const handler = handlerRegistry.get(channel)
        if (!handler) {
          ws.send(JSON.stringify({ type: 'response', id, error: `Unknown channel: ${channel}` }))
          return
        }

        const result = await handler(...(args ?? []))
        ws.send(JSON.stringify({ type: 'response', id, result }))
      } catch (err: any) {
        ws.send(JSON.stringify({
          type: 'response',
          id: msgId,
          error: err?.message ?? 'Unknown error'
        }))
      }
    })

    ws.on('close', () => {
      log('info', '[WebServer] WebSocket client disconnected')
    })
  })

  httpServer.listen(port, '0.0.0.0', () => {
    log('ok', `[WebServer] listening on http://0.0.0.0:${port}`)
  })

  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log('warn', `[WebServer] port ${port} in use, trying ${port + 1}`)
      httpServer.listen(port + 1, '0.0.0.0')
    } else {
      log('error', `[WebServer] ${err.message}`)
    }
  })

  return httpServer
}
