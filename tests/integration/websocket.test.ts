import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { WebSocket } from 'ws'
import { createServer, type Server } from 'http'
import { WebSocketServer } from 'ws'
import { registerHandler, getHandler } from '../../src/main/server/index'

/**
 * Integration test for the handler registry + WebSocket message dispatch.
 * We set up a minimal WS server using the shared handler registry
 * (same logic as the real server) and verify round-trip message flow.
 */

let httpServer: Server
let wss: WebSocketServer
let port: number

function startTestServer(): Promise<number> {
  return new Promise((resolve) => {
    httpServer = createServer()
    wss = new WebSocketServer({ server: httpServer })

    wss.on('connection', (ws) => {
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

          const handler = getHandler(channel)
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
    })

    // Listen on random port
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as { port: number }
      resolve(addr.port)
    })
  })
}

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

function sendAndReceive(ws: WebSocket, msg: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 3000)
    ws.once('message', (data: Buffer | string) => {
      clearTimeout(timeout)
      resolve(JSON.parse(typeof data === 'string' ? data : data.toString()))
    })
    ws.send(JSON.stringify(msg))
  })
}

beforeAll(async () => {
  // Register a test handler
  registerHandler('test-echo', async (value: string) => {
    return { echo: value }
  })

  registerHandler('test-sum', async (a: number, b: number) => {
    return a + b
  })

  port = await startTestServer()
})

afterAll(() => {
  wss?.close()
  httpServer?.close()
})

describe('WebSocket integration', () => {
  it('receives response for a registered handler', async () => {
    const ws = await connectWs()
    try {
      const resp = await sendAndReceive(ws, {
        id: '1',
        channel: 'test-echo',
        args: ['hello']
      })
      expect(resp.type).toBe('response')
      expect(resp.id).toBe('1')
      expect(resp.result).toEqual({ echo: 'hello' })
    } finally {
      ws.close()
    }
  })

  it('passes multiple args correctly', async () => {
    const ws = await connectWs()
    try {
      const resp = await sendAndReceive(ws, {
        id: '2',
        channel: 'test-sum',
        args: [3, 7]
      })
      expect(resp.type).toBe('response')
      expect(resp.id).toBe('2')
      expect(resp.result).toBe(10)
    } finally {
      ws.close()
    }
  })

  it('returns error for unknown channel', async () => {
    const ws = await connectWs()
    try {
      const resp = await sendAndReceive(ws, {
        id: '3',
        channel: 'non-existent-channel',
        args: []
      })
      expect(resp.type).toBe('response')
      expect(resp.id).toBe('3')
      expect(resp.error).toContain('Unknown channel')
    } finally {
      ws.close()
    }
  })

  it('returns error for missing channel/id', async () => {
    const ws = await connectWs()
    try {
      const resp = await sendAndReceive(ws, { id: '4' })
      expect(resp.type).toBe('error')
    } finally {
      ws.close()
    }
  })

  it('handles broadcast events to connected clients', async () => {
    const ws = await connectWs()
    try {
      // Broadcast from server to all clients
      const receivePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 3000)
        ws.once('message', (data: Buffer | string) => {
          clearTimeout(timeout)
          resolve(JSON.parse(typeof data === 'string' ? data : data.toString()))
        })
      })

      // Simulate broadcast via wss
      const broadcastMsg = JSON.stringify({ type: 'event', channel: 'test-broadcast', data: { foo: 'bar' } })
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastMsg)
        }
      }

      const event = await receivePromise
      expect(event.type).toBe('event')
      expect(event.channel).toBe('test-broadcast')
      expect(event.data).toEqual({ foo: 'bar' })
    } finally {
      ws.close()
    }
  })
})
