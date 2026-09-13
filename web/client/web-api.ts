/**
 * Web API adapter — replaces Electron's window.api (preload contextBridge)
 * with WebSocket + REST calls for standalone web deployment.
 *
 * Injected before the React app loads.
 */

type EventCallback = (data: any) => void

// ─── WebSocket connection ──────────────────────────────────────────────────
const WS_PATH = '/ws'
const webAuthToken = new URLSearchParams(location.search).get('token')
let ws: WebSocket | null = null
let wsReady = false
let msgId = 0
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }>()
const eventListeners: Record<string, Set<EventCallback>> = {}

function withAuthToken(path: string): string {
  if (!webAuthToken) return path
  const url = new URL(path, location.origin)
  url.searchParams.set('token', webAuthToken)
  return `${url.pathname}${url.search}`
}

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}${withAuthToken(WS_PATH)}`
}

function connectWs(): void {
  ws = new WebSocket(getWsUrl())

  ws.onopen = () => {
    wsReady = true
    fire('connection-changed', { connected: true })
    console.log('[GpsSpoofer] WebSocket connected')
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)

      if (msg.type === 'response') {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          clearTimeout(p.timer)
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
        const { devices, activeDevice, serial, revision, location, mode, route } = msg.data
        fire('devices-changed', { devices, activeDevice })
        fire('location-updated', { serial, revision, location, mode })
        if (route) fire('route-updated', { serial, revision, state: route, location, mode })
      }
    } catch { /* ignore parse errors */ }
  }

  ws.onclose = () => {
    wsReady = false
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Connection lost; the command may still complete on the device.')) }
    pending.clear()
    fire('connection-changed', { connected: false })
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
  // JSON arrays encode undefined as null; preserve omitted optional parameters.
  while (args.length && args[args.length - 1] === undefined) args.pop()
  if (!ws || !wsReady) return restInvoke(channel, args)
  return new Promise((resolve, reject) => {
    const id = String(++msgId)
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timeout: ${channel}. The device command may still complete.`))
    }, 15000)
    pending.set(id, { resolve, reject, timer })
    try { ws!.send(JSON.stringify({ id, channel, args })) }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
}

async function fetchJson(path: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([
      (async () => {
        const res = await fetch(withAuthToken(path), { ...options, signal: controller.signal })
        const data = await res.json()
        if (!res.ok || data?.error) throw new Error(data?.error || `Request failed (${res.status})`)
        return data
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new Error('Request timed out; a submitted device command may still complete.')); controller.abort() }, 15000)
      })
    ])
  } finally { clearTimeout(timer!) }
}

async function restInvoke(channel: string, args: any[]): Promise<any> {
  const data = await fetchJson('/api/call', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, args })
  })
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
  getAdbDiagnostics: () => wsInvoke('get-adb-diagnostics'),
  enableMockLocation: (serial: string) => wsInvoke('enable-mock-location', serial),
  getRealLocation: (serial: string) => wsInvoke('get-real-location', serial),
  getAllRealLocations: () => wsInvoke('get-all-real-locations'),
  getDeviceState: (serial: string) => wsInvoke('get-device-state', serial),
  getAllDeviceStates: () => wsInvoke('get-all-device-states'),

  // Location
  teleport: (serials: string[], lat: number, lng: number) =>
    wsInvoke('teleport', serials, lat, lng),
  startJoystick: (serials: string[]) => wsInvoke('start-joystick', serials),
  onConnectionChanged: (callback: EventCallback) => onEvent('connection-changed', callback),
  stopJoystick: (serials?: string[]) => wsInvoke('stop-joystick', serials),
  updatePosition: (lat: number, lng: number, bearing: number, speed: number, serials?: string[]) =>
    wsInvoke('update-position', lat, lng, bearing, speed, serials),
  stopSpoofing: (serials: string[]) => wsInvoke('stop-spoofing', serials),
  stopSpoofingGraceful: (serials: string[], realLat: number, realLng: number) =>
    wsInvoke('stop-spoofing-graceful', serials, realLat, realLng),
  getLocationState: (serial?: string) => wsInvoke('get-location-state', serial),
  stopAll: (mode: 'stay' | 'graceful' | 'immediate') => wsInvoke('stop-all', mode),

  // Route
  routeSetWaypoints: (waypoints: any[], serials?: string[]) => wsInvoke('route-set-waypoints', waypoints, serials),
  routePlanRoadNetwork: (request: any) => wsInvoke('route-plan-road-network', request),
  routePlay: (serials: string[], speedMs: number, fromLat?: number, fromLng?: number) =>
    wsInvoke('route-play', serials, speedMs, fromLat, fromLng),
  routePause: (serials?: string[]) => wsInvoke('route-pause', serials),
  routeStop: (serials?: string[]) => wsInvoke('route-stop', serials),
  routeStopStay: (serials?: string[]) => wsInvoke('route-stop-stay', serials),
  routeReturnToGps: (realLat: number, realLng: number, speedMs: number, serials?: string[]) =>
    wsInvoke('route-return-to-gps', realLat, realLng, speedMs, serials),
  routeSetLoop: (loop: boolean, serials?: string[]) => wsInvoke('route-set-loop', loop, serials),
  routeGetState: (serial?: string) => wsInvoke('route-get-state', serial),
  routeSetWander: (enabled: boolean, radiusM: number, serials?: string[]) =>
    wsInvoke('route-set-wander', enabled, radiusM, serials),
  routeSetSpeed: (speedMs: number, serials?: string[]) => wsInvoke('route-set-speed', speedMs, serials),
  routeSetFixedSpeed: (enabled: boolean, serials?: string[]) => wsInvoke('route-set-fixed-speed', enabled, serials),

  // GPX — web version uses file input + server-side parse
  importGpx: () => new Promise<any[]>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.gpx'
    input.oncancel = () => { input.remove(); resolve([]) }
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) { resolve([]); return }
        if (file.size > 5 * 1024 * 1024) throw new Error('GPX must be no larger than 5 MiB')
        const content = await file.text()
        const points = await fetchJson('/api/gpx/parse', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content })
        })
        if (!Array.isArray(points)) throw new Error('Invalid GPX response')
        resolve(points)
      } catch (error) { reject(error) }
      finally { input.remove() }
    }
    input.click()
  }),

  // WiFi ADB
  connectWifi: (ip: string, port?: number) => wsInvoke('connect-wifi', ip, port),
  enableTcpip: (serial: string) => wsInvoke('enable-tcpip', serial),

  // Saved locations
  resolveGoogleMapsLink: (url: string) => wsInvoke('maps-resolve-link', url),
  getSavedLocations: () => wsInvoke('locations-get-saved'),
  saveLocation: (name: string, lat: number, lng: number) =>
    wsInvoke('locations-save', name, lat, lng),
  renameLocation: (id: number, name: string) => wsInvoke('locations-rename', id, name),
  touchLocation: (id: number) => wsInvoke('locations-touch', id),
  deleteLocation: (id: number) => wsInvoke('locations-delete', id),
  getLocationHistory: () => wsInvoke('locations-get-history'),
  addLocationHistory: (lat: number, lng: number) =>
    wsInvoke('locations-add-history', lat, lng),
  getWifiIpHistory: () => wsInvoke('wifi-ip-history-get'),
  recordWifiIp: (ip: string, port: number) => wsInvoke('wifi-ip-history-record', ip, port),
  deleteWifiIpHistory: (ip: string, port: number) => wsInvoke('wifi-ip-history-delete', ip, port),

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
      const data = await fetchJson('/api/version')
      return data.version || 'web'
    } catch {
      return 'web'
    }
  },

  // Client IP detection (web-only)
  getClientIp: async (): Promise<string | null> => {
    try {
      const data = await fetchJson('/api/client-ip')
      return data.ip || null
    } catch {
      return null
    }
  }
}

;(window as any).api = api

// Start WebSocket connection
connectWs()

export {}
