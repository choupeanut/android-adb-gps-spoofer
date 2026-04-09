# Android ADB GPS Spoofer

GPS location spoofing application for Android devices via ADB.
Dual architecture: Electron desktop app + standalone web server (Docker).
Compatible with Pikmin Bloom and Pokemon GO.

## Tech Stack

### Desktop (Electron)
- **Electron 33** — main/preload/renderer three-process architecture
- **electron-vite** — bundler (Vite for renderer, esbuild for main/preload)
- **React 19 + TypeScript** — renderer UI
- **Tailwind CSS v3** — utility CSS with CSS variable color tokens (dark theme only)
- **Zustand** — client state management
- **better-sqlite3** — local SQLite database (userData path)
- **lucide-react** — SVG icon library (no emoji icons)
- **react-leaflet** — interactive map (OpenStreetMap tiles)

### Web Server (Docker)
- **Express** — REST API + static file serving
- **WebSocket (ws)** — real-time location/device/route events
- **esbuild** — server bundle (build-server.cjs)
- **Vite** — client build (vite.web.config.ts)
- Shares `src/shared/` types and constants with Electron

### Common
- **ADB (Android Debug Bridge)** — communicates with Android devices
- **better-sqlite3** — persistent saved locations + history

## Project Layout

```
src/
├── main/                           # Electron main process (Node.js)
│   ├── index.ts                    # App entry: BrowserWindow, Tray, DeviceManager init
│   ├── logger.ts                   # In-memory ring buffer; broadcasts log-entry via BrowserWindow
│   ├── ipc/
│   │   ├── register.ts             # All ipcMain.handle() registrations
│   │   └── gpx.ipc.ts              # Electron dialog -> GPX file parse
│   ├── server/
│   │   └── index.ts                # Optional embedded WebSocket/REST server in Electron
│   ├── services/
│   │   ├── adb.service.ts          # All ADB shell commands (listDevices, pushLocation, etc.)
│   │   ├── anti-detect.ts          # Jitter, speed fluctuation, bearing smoothing
│   │   ├── broadcast.ts            # Event broadcast abstraction (BrowserWindow + WebSocket)
│   │   ├── device-engine-manager.ts # Per-device engine lifecycle (multi-device support)
│   │   ├── device-manager.ts       # ADB polling every 3 s; notifies renderer
│   │   ├── location-engine.ts      # Teleport, joystick keep-alive, graceful stop
│   │   ├── route-engine.ts         # Waypoint routing, pause/resume, wander mode, return-to-GPS
│   │   └── db.ts                   # SavedLocations + LocationHistory (SQLite)
│   └── utils/
│       ├── coordinates.ts          # haversineDistance, bearing, interpolatePoints, destinationPoint
│       └── cooldown.ts             # Cooldown calculation utilities
│
├── preload/
│   └── index.ts                    # contextBridge.exposeInMainWorld('api', ...) — full API surface
│
├── renderer/                       # React SPA (shared by Electron & web client)
│   ├── App.tsx                     # IPC subscriptions (onDevicesChanged, onLocationUpdated, etc.)
│   ├── main.tsx                    # ReactDOM.createRoot entry
│   ├── env.d.ts                    # declare Window.api type
│   ├── stores/
│   │   ├── device.store.ts         # devices[], activeDevice, selectedSerials, getTargetSerials()
│   │   ├── location.store.ts       # location, mode, realGpsLocation, pendingTeleport
│   │   ├── route.store.ts          # waypoints, playing, speedMs, wanderEnabled, etc.
│   │   ├── ui.store.ts             # activeTab, panel states
│   │   └── log.store.ts            # LogEntry ring buffer (last 500)
│   ├── components/
│   │   ├── TopBar.tsx              # App header bar
│   │   ├── StopAllModal.tsx        # Confirmation modal for Stop All action
│   │   ├── controls/
│   │   │   ├── TeleportPanel.tsx   # Coord input, geocoding, anti-cheat warning, pending dest
│   │   │   ├── RoutePanel.tsx      # Waypoint list, Play/Pause/Resume/Return/Stop, wander
│   │   │   ├── SpeedControl.tsx    # Walk/Cycle/Drive/HSR/Plane/Custom presets
│   │   │   ├── Joystick.tsx        # nipplejs virtual joystick
│   │   │   └── CooldownTimer.tsx   # Manual cooldown countdown widget
│   │   ├── device/
│   │   │   ├── DeviceList.tsx      # Device list + multi-select + ConnectionDialog trigger
│   │   │   ├── DeviceCard.tsx      # Per-device card: status, Test ADB, Setup GPS buttons
│   │   │   └── ConnectionDialog.tsx # WiFi / USB-to-WiFi ADB connection wizard
│   │   ├── layout/
│   │   │   ├── CollapsiblePanel.tsx # Animated collapsible container
│   │   │   ├── DevicePanel.tsx     # Device panel layout wrapper
│   │   │   ├── FloatingPanel.tsx   # Floating overlay panels
│   │   │   ├── FloatingControlPanel.tsx # Floating control panel
│   │   │   ├── JoystickFloating.tsx # Floating joystick overlay
│   │   │   └── LogPanel.tsx        # Layout-level log panel
│   │   ├── map/
│   │   │   ├── MapView.tsx         # Leaflet map, markers, click handler, refresh GPS
│   │   │   └── RouteOverlay.tsx    # Polyline + waypoint markers for route mode
│   │   ├── panels/
│   │   │   ├── LeftPanel.tsx       # Left sidebar panel
│   │   │   ├── RightPanel.tsx      # Right sidebar panel
│   │   │   └── BottomSheet.tsx     # Mobile bottom sheet
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx         # Tab navigation, Stop All button
│   │   │   ├── SavedLocations.tsx  # Starred locations list
│   │   │   ├── LocationHistory.tsx # Recent 100 visited coords
│   │   │   └── LogPanel.tsx        # Scrollable log output
│   │   └── ui/                     # Reusable UI primitives
│   │       ├── Button.tsx, Card.tsx, Input.tsx, Modal.tsx
│   │       ├── Badge.tsx, Tabs.tsx, SegmentedControl.tsx, ToggleButton.tsx
│   │       └── index.ts           # Barrel export
│   ├── hooks/
│   │   └── useBreakpoint.ts       # Responsive breakpoint hook
│   ├── lib/
│   │   └── utils.ts               # Shared utilities
│   ├── utils/
│   │   └── cn.ts                   # className merge utility
│   └── styles/globals.css          # Tailwind directives + CSS variable theme
│
├── shared/                         # Imported by main, renderer, and web server
│   ├── types.ts                    # LocationUpdate, DeviceInfo, RouteWaypoint, SpoofMode, etc.
│   ├── constants.ts                # SPEED_PRESETS, UPDATE_INTERVAL_MS, COOLDOWN_TABLE, etc.
│   └── geo.ts                      # haversineKm, getCooldownMinutes (renderer-side helpers)
│
web/                                # Standalone web server (Docker)
├── package.json                    # Web-specific dependencies (express, cors, ws)
├── client/
│   ├── index.html                  # Web client entry HTML
│   ├── main-web.ts                 # Web client entry (replaces Electron preload)
│   └── web-api.ts                  # HTTP/WS API adapter (same interface as preload)
└── server/
    ├── index.ts                    # Express + WebSocket server entry
    ├── broadcast.ts                # WebSocket broadcast helper
    ├── logger.ts                   # Server-side logger
    └── services/                   # Mirrors src/main/services/ for web context
        ├── adb.service.ts
        ├── anti-detect.ts
        ├── coordinates.ts
        ├── db.ts
        ├── device-engine-manager.ts
        ├── device-manager.ts
        ├── location-engine.ts
        └── route-engine.ts

tests/
├── unit/                           # Vitest unit tests
│   ├── anti-detect.test.ts
│   ├── cooldown.test.ts
│   ├── coordinates.test.ts
│   └── device-engine-manager.test.ts
└── integration/
    └── websocket.test.ts
```

## Dual Architecture

The app runs in two modes:

### 1. Electron Desktop
```
renderer -> window.api.xxx() -> ipcRenderer.invoke()
main     -> ipcMain.handle() -> returns result
main     -> BrowserWindow.send('event', data) -> window.api.onXxx(callback)
```

### 2. Web Server (Docker / standalone)
```
browser -> fetch('/api/xxx') or ws.send({type:'xxx'})
server  -> Express route handler / WS message handler
server  -> ws.send({type:'event', data}) -> client callback
```

Both share `src/shared/` types and constants. The web server mirrors main process services.

## IPC Events

**Events pushed from main to renderer:**
- `devices-changed` — ADB poll found new/removed/status-changed device
- `location-updated` — location or mode changed (`{ location, mode }`)
- `route-updated` — route state changed (`{ state, location }`)
- `log-entry` — new log line (`{ ts, level, msg }`)

**Adding a new IPC call:**
1. Add handler in `src/main/ipc/register.ts`
2. Expose in `src/preload/index.ts`
3. Call via `window.api.xxx()` in renderer
4. For web: add REST/WS handler in `web/server/index.ts` + client method in `web/client/web-api.ts`

## Key Services

### AdbService (`adb.service.ts`)
- No Electron imports — pure Node.js `child_process`
- `ADB_PATH` env var overrides binary path; fallback to bundled `resources/platform-tools/adb`
- `getRealLocation`: tries 4 parse strategies for Android 6-16 compatibility:
  - Format A: `fused: Location[fused LAT,LNG`
  - Format B: JSON `"latitude":LAT`
  - Format C: bare `fused: LAT,LNG`
  - Format D: `Location[fused LAT,LNG` (Android 16 — no prefix)
  - Fallback: key=value scan (`lat=`, `lon=`)
- `pushLocation`: uses `cmd location providers set-test-provider-location gps --location LAT,LNG`

### LocationEngine (`location-engine.ts`)
- Manages teleport (instant or glide <= 1 km), joystick keep-alive, graceful stop
- Glide threshold: `GLIDE_MAX_KM = 1.0` — distances > 1 km teleport instantly
- Notifies renderer via broadcast abstraction on every state change

### RouteEngine (`route-engine.ts`)
- Tick interval: `UPDATE_INTERVAL_MS = 1000 ms`
- **Critical tick fix**: clamp `progressFraction` to 1 BEFORE advancing segment index
- Pause -> `startKeepAlive()` (1 Hz position push, keeps test provider alive)
- Stop -> removes test providers immediately via `adb.removeTestProvider()`
- `returnToRealGps()` -> walks at route speed, removes provider on arrival
- Wander: random point within radius (5-25 s intervals), glides between points
- `finishedNaturally` flag: set when route ends non-loop, used for auto-return

### DeviceEngineManager (`device-engine-manager.ts`)
- Per-device LocationEngine + RouteEngine lifecycle management
- Supports simultaneous multi-device spoofing
- Cleans up engines when devices disconnect

### DeviceManager (`device-manager.ts`)
- Polls `adb devices -l` every `ADB_POLL_INTERVAL_MS = 3000 ms`
- Auto-sets first connected device as activeDevice
- Broadcasts `devices-changed` only when list/status actually changes

## State Management

Zustand stores, no persistence (state resets on app restart except SQLite):

| Store | Key state |
|---|---|
| `device.store` | `devices[]`, `activeDevice`, `selectedSerials` |
| `location.store` | `location` (spoofed), `mode`, `realGpsLocation`, `pendingTeleport` |
| `route.store` | `waypoints[]`, `playing`, `speedMs`, `wanderEnabled`, `returnOnFinish` |
| `ui.store` | `activeTab`, panel collapse states |
| `log.store` | `entries[]` (last 500) |

**`getTargetSerials()`** — returns `selectedSerials` if non-empty, else `[activeDevice]`.

**`pendingTeleport`** — set by map click in teleport tab; cleared after teleport executes.

## Anti-Cheat System

- **Jitter** (`applyJitter`): Gaussian noise on lat/lng (sigma = 0.00009 deg ≈ 10 m) + accuracy randomisation
- **Speed fluctuation** (`applySpeedFluctuation`): +/-15% random variation
- **Bearing smoothing** (`smoothBearing`): 30% interpolation per tick (no instant direction changes)
- **Cooldown warning** (`TeleportPanel`): shown for distances >= 500 m; table in `COOLDOWN_TABLE`
- **Speed presets**: Walk 1.4 m/s, Cycle 5.14 m/s, Drive 11.0 m/s, HSR 83.3 m/s, Plane 250 m/s

## Map Behaviour

- **Teleport tab**: map click -> `setPendingTeleport()` (orange marker) -> user clicks Teleport button
- **Route tab**: map click -> `addWaypoint()` directly
- **Other tabs**: map click does nothing

## Build & Distribution

```bash
# Desktop (Electron)
pnpm dev              # Dev mode (hot reload)
pnpm build            # Build to out/
pnpm dist:win         # Windows NSIS installer -> dist/
pnpm dist:linux       # Linux AppImage -> dist/

# Web server
node build-server.cjs                      # Bundle server -> dist/server/
npx vite build --config vite.web.config.ts # Bundle client -> dist/client/

# Docker
docker build -t android-adb-gps-spoofer .
docker run -d -p 3000:3000 --privileged -v /dev/bus/usb:/dev/bus/usb android-adb-gps-spoofer
```

## Testing

```bash
pnpm test         # Run all tests (vitest)
pnpm test:watch   # Watch mode
```

## Common Gotchas

- **Never call `window.api` outside components/stores** — only available after contextBridge setup
- **Route speed change while playing**: call `window.api.routeSetSpeed(ms)` in addition to store update — engine holds its own `speedMs`
- **Pause vs Resume**: RoutePanel tracks `isPaused` locally. Resume must NOT pass `fromLat/fromLng` to `routePlay` — engine already holds position
- **Stop vs Return**: Stop = instant removal of provider; Return = walks back then removes
- **Android 16**: `cmd location get-last-location` returns "Unknown command" — fall through to `dumpsys location` Format D
- **ADB commands throw on non-zero exit** — use `safeRun` pattern in `adb.service.ts`
- **Tailwind CSS variables**: Colors defined as `hsl(var(--xxx))` in `tailwind.config.js`; raw hex values must not appear in components
- **Web server services mirror Electron services** — changes to core logic must be applied to both `src/main/services/` and `web/server/services/`
