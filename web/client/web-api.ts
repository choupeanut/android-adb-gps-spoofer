/**
 * Web API adapter — replaces Electron's window.api (preload contextBridge)
 * with WebSocket + REST calls for standalone web deployment.
 *
 * Injected before the React app loads.
 */

type EventCallback = (data: any) => void

// ─── WebSocket connection ──────────────────────────────────────────────────
const WS_PATH = '/ws'
let ws: WebSocket | null = null
let wsReady = false
let msgId = 0
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>()
const eventListeners: Record<string, Set<EventCallback>> = {}

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}${WS_PATH}`
}

function connectWs(): void {
  ws = new WebSocket(getWsUrl())

  ws.onopen = () => {
    wsReady = true
    console.log('[GpsSpoofer] WebSocket connected')
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)

      if (msg.type === 'response') {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          if (msg.error) p.reject(new Error(msg.error))
          else p.resolve(msg.result)
        }
      } else if (msg.type === 'event') {
        // Push event from server (devices-changed, location-updated, route-updated, log-entry)
        const listeners = eventListeners[msg.channel]
        if (listeners) {
          for (const cb of listeners) {
            try { cb(msg.data) } catch { /* ignore */ }
          }
        }
      } else if (msg.type === 'init') {
        // Initial state from server on connect
        const { devices, activeDevice, location, mode, route } = msg.data
        fire('devices-changed', { devices, activeDevice })
        fire('location-updated', { location, mode })
        if (route) fire('route-updated', { state: route, location })
      }
    } catch { /* ignore parse errors */ }
  }

  ws.onclose = () => {
    wsReady = false
    console.log('[GpsSpoofer] WebSocket disconnected, reconnecting in 2s...')
    setTimeout(connectWs, 2000)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function fire(channel: string, data: any): void {
  const listeners = eventListeners[channel]
  if (listeners) {
    for (const cb of listeners) {
      try { cb(data) } catch { /* ignore */ }
    }
  }
}

/** Send a command via WebSocket and wait for response. */
function wsInvoke(channel: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = String(++msgId)
    pending.set(id, { resolve, reject })

    const send = (): void => {
      if (ws && wsReady) {
        ws.send(JSON.stringify({ id, channel, args }))
      } else {
        // Fallback to REST if WS not ready
        restInvoke(channel, args).then(resolve).catch(reject)
        pending.delete(id)
      }
    }

    send()

    // Timeout after 15s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`Timeout: ${channel}`))
      }
    }, 15000)
  })
}

/** REST fallback. */
async function restInvoke(channel: string, args: any[]): Promise<any> {
  const res = await fetch('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.result
}

function onEvent(channel: string, cb: EventCallback): () => void {
  if (!eventListeners[channel]) eventListeners[channel] = new Set()
  eventListeners[channel].add(cb)
  return () => eventListeners[channel]?.delete(cb)
}

// ─── Build window.api ──────────────────────────────────────────────────────

const api = {
  // Device
  getDevices: () => wsInvoke('get-devices'),
  setActiveDevice: (serial: string) => wsInvoke('set-active-device', serial),
  testAdb: (serial: string) => wsInvoke('test-adb', serial),
  enableMockLocation: (serial: string) => wsInvoke('enable-mock-location', serial),
  getRealLocation: (serial: string) => wsInvoke('get-real-location', serial),
  getAllRealLocations: () => wsInvoke('get-all-real-locations'),
  getDeviceState: (serial: string) => wsInvoke('get-device-state', serial),
  getAllDeviceStates: () => wsInvoke('get-all-device-states'),

  // Location
  teleport: (serials: string[], lat: number, lng: number) =>
    wsInvoke('teleport', serials, lat, lng),
  startJoystick: (serials: string[]) => wsInvoke('start-joystick', serials),
  stopJoystick: () => wsInvoke('stop-joystick'),
  updatePosition: (lat: number, lng: number, bearing: number, speed: number) =>
    wsInvoke('update-position', lat, lng, bearing, speed),
  stopSpoofing: (serials: string[]) => wsInvoke('stop-spoofing', serials),
  stopSpoofingGraceful: (serials: string[], realLat: number, realLng: number) =>
    wsInvoke('stop-spoofing-graceful', serials, realLat, realLng),
  getLocationState: () => wsInvoke('get-location-state'),
  stopAll: (mode: 'stay' | 'graceful' | 'immediate') => wsInvoke('stop-all', mode),

  // Route
  routeSetWaypoints: (waypoints: any[], serials?: string[]) => wsInvoke('route-set-waypoints', waypoints, serials),
  routePlanRoadNetwork: (request: any) => wsInvoke('route-plan-road-network', request),
  routePlay: (serials: string[], speedMs: number, fromLat?: number, fromLng?: number) =>
    wsInvoke('route-play', serials, speedMs, fromLat, fromLng),
  routePause: () => wsInvoke('route-pause'),
  routeStop: () => wsInvoke('route-stop'),
  routeStopStay: () => wsInvoke('route-stop-stay'),
  routeReturnToGps: (realLat: number, realLng: number, speedMs: number) =>
    wsInvoke('route-return-to-gps', realLat, realLng, speedMs),
  routeSetLoop: (loop: boolean) => wsInvoke('route-set-loop', loop),
  routeGetState: () => wsInvoke('route-get-state'),
  routeSetWander: (enabled: boolean, radiusM: number) =>
    wsInvoke('route-set-wander', enabled, radiusM),
  routeSetSpeed: (speedMs: number) => wsInvoke('route-set-speed', speedMs),
  routeSetFixedSpeed: (enabled: boolean) => wsInvoke('route-set-fixed-speed', enabled),

  // GPX — web version uses file input + server-side parse
  importGpx: async () => {
    return new Promise<any[]>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.gpx'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { resolve([]); return }
        const content = await file.text()
        try {
          const res = await fetch('/api/gpx/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
          })
          const waypoints = await res.json()
          resolve(Array.isArray(waypoints) ? waypoints : [])
        } catch {
          resolve([])
        }
      }
      input.click()
    })
  },

  // WiFi ADB
  connectWifi: (ip: string, port?: number) => wsInvoke('connect-wifi', ip, port),
  enableTcpip: (serial: string) => wsInvoke('enable-tcpip', serial),

  // Saved locations
  getSavedLocations: () => wsInvoke('locations-get-saved'),
  saveLocation: (name: string, lat: number, lng: number) =>
    wsInvoke('locations-save', name, lat, lng),
  deleteLocation: (id: number) => wsInvoke('locations-delete', id),
  getLocationHistory: () => wsInvoke('locations-get-history'),
  addLocationHistory: (lat: number, lng: number) =>
    wsInvoke('locations-add-history', lat, lng),

  // Events
  onDevicesChanged: (cb: EventCallback) => onEvent('devices-changed', cb),
  onLocationUpdated: (cb: EventCallback) => onEvent('location-updated', cb),
  onRouteUpdated: (cb: EventCallback) => onEvent('route-updated', cb),

  // Session
  getSession: () => wsInvoke('get-session'),
  saveSession: (data: Record<string, unknown>) => wsInvoke('save-session', data),

  // Logs
  getLogs: () => wsInvoke('get-logs'),
  onLogEntry: (cb: EventCallback) => onEvent('log-entry', cb),

  // App version (web returns server-provided version via meta tag or env)
  getAppVersion: async (): Promise<string> => {
    try {
      const res = await fetch('/api/version')
      const data = await res.json()
      return data.version || 'web'
    } catch {
      return 'web'
    }
  },

  // Client IP detection (web-only)
  getClientIp: async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/client-ip')
      const data = await res.json()
      return data.ip || null
    } catch {
      return null
    }
  }
}

;(window as any).api = api

// Start WebSocket connection
connectWs()
