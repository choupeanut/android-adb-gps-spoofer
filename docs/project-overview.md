# Pikmin Keep — Project Overview

**Pikmin Keep** is a GPS location spoofing application for Android devices via ADB. It supports two deployment modes: an **Electron desktop app** and a **standalone web server** (Docker-based). Both let Pokémon GO / Pikmin Bloom players control their Android device's GPS from a browser or desktop, with teleport, joystick movement, waypoint routing, and anti-cheat features.

## Dual Architecture

### Mode 1: Electron Desktop App (Original)

```
┌─────────────┐     IPC (invoke/handle)     ┌──────────────┐
│  Renderer    │ ◄─────────────────────────► │  Main Process│
│  (React UI)  │     Events (send/on)        │  (Node.js)   │
└──────┬───────┘                             └──────┬───────┘
       │ contextBridge                              │ child_process
┌──────┴───────┐                             ┌──────┴───────┐
│   Preload    │                             │  ADB Binary  │
└──────────────┘                             └──────────────┘
```

### Mode 2: Standalone Web Server (Docker)

```
┌───────────────┐     WebSocket / REST       ┌──────────────┐
│  Browser UI   │ ◄─────────────────────────►│  Express +   │
│  (React SPA)  │     (same React code)      │  WS Server   │
│ phone/desktop │                            │  (Node.js)   │
└───────────────┘                            └──────┬───────┘
       │ window.api (web-api.ts adapter)            │ child_process
       │                                     ┌──────┴───────┐
       │                                     │  ADB Binary  │
       │                                     │ (in Docker)  │
       └─────────────────────────────────────└──────────────┘
```

The web build reuses the **same React renderer code**. `web/client/web-api.ts` provides a `window.api` object that routes all calls over WebSocket/REST instead of Electron IPC.

## Project Layout

```
src/
├── main/                        # Electron main process (Node.js)
│   ├── index.ts                 # App entry: BrowserWindow, Tray, DeviceManager init
│   ├── logger.ts                # In-memory ring buffer; broadcasts log-entry
│   ├── ipc/
│   │   ├── register.ts          # All ipcMain.handle() registrations
│   │   └── gpx.ipc.ts           # Electron dialog → GPX file parse
│   ├── services/
│   │   ├── adb.service.ts       # All ADB shell commands
│   │   ├── anti-detect.ts       # Jitter, speed fluctuation, bearing smoothing
│   │   ├── device-manager.ts    # ADB polling every 3s
│   │   ├── device-engine-manager.ts # Per-device LocationEngine + RouteEngine
│   │   ├── location-engine.ts   # Teleport, joystick keep-alive, graceful stop
│   │   ├── route-engine.ts      # Waypoint routing, pause/resume, wander, return-to-GPS
│   │   └── db.ts                # SQLite (better-sqlite3) saved locations + history
│   └── utils/
│       ├── coordinates.ts       # haversine, bearing, interpolation, destinationPoint
│       └── cooldown.ts          # Cooldown time calculation
│
├── preload/
│   └── index.ts                 # contextBridge → window.api
│
├── renderer/                    # React SPA (shared by Electron + Web)
│   ├── App.tsx                  # IPC subscriptions, responsive layout
│   ├── main.tsx                 # ReactDOM entry
│   ├── hooks/
│   │   └── useBreakpoint.ts     # mobile / tablet / desktop breakpoints
│   ├── stores/
│   │   ├── device.store.ts      # devices[], activeDevice, selectedSerials
│   │   ├── location.store.ts    # location, mode, realGpsLocation, pendingTeleport
│   │   ├── route.store.ts       # waypoints, playing, speedMs, wanderEnabled
│   │   ├── ui.store.ts          # activeTab, mapClickMode
│   │   └── log.store.ts         # LogEntry ring buffer (last 500)
│   ├── components/
│   │   ├── TopBar.tsx           # Device selector, speed pills, Stop All, Add Device
│   │   ├── StopAllModal.tsx     # Stay / Graceful / Immediate stop dialog
│   │   ├── controls/
│   │   │   ├── TeleportPanel.tsx
│   │   │   ├── Joystick.tsx
│   │   │   ├── RoutePanel.tsx
│   │   │   ├── SpeedControl.tsx
│   │   │   └── CooldownTimer.tsx
│   │   ├── device/
│   │   │   ├── DeviceList.tsx
│   │   │   ├── DeviceCard.tsx
│   │   │   └── ConnectionDialog.tsx  # WiFi ADB connection wizard + auto LAN IP
│   │   ├── map/
│   │   │   ├── MapView.tsx
│   │   │   └── RouteOverlay.tsx
│   │   ├── panels/
│   │   │   ├── LeftPanel.tsx    # Desktop: Teleport + Joystick
│   │   │   ├── RightPanel.tsx   # Desktop: Route + Logs/Devices
│   │   │   └── BottomSheet.tsx  # Mobile: swipeable sheet with tab switcher
│   │   └── sidebar/
│   │       ├── SavedLocations.tsx
│   │       ├── LocationHistory.tsx
│   │       └── LogPanel.tsx
│   └── styles/globals.css
│
├── shared/                      # Used by both main and renderer
│   ├── types.ts
│   ├── constants.ts
│   └── geo.ts
│
web/                             # Standalone web deployment (Docker)
├── client/
│   ├── index.html               # Web entry HTML
│   ├── main-web.ts              # Loads web-api then renderer/main
│   └── web-api.ts               # window.api via WebSocket + REST
├── server/
│   ├── index.ts                 # Express + WebSocket server
│   ├── broadcast.ts             # WS-only event broadcast (no Electron)
│   ├── logger.ts                # Standalone logger
│   └── services/                # Electron-free copies of all services
│       ├── adb.service.ts
│       ├── anti-detect.ts
│       ├── coordinates.ts
│       ├── db.ts
│       ├── device-manager.ts
│       ├── device-engine-manager.ts
│       ├── location-engine.ts
│       └── route-engine.ts
└── package.json                 # Production deps for Docker
```

## Key Services

| Service | Role |
|---|---|
| **AdbService** | ADB shell commands — list devices, push GPS, read real location. Handles Android 6–16 format differences (4 parse strategies + fallback). |
| **DeviceManager** | Polls `adb devices` every 3s, broadcasts changes. |
| **DeviceEngineManager** | Maintains per-device `{ LocationEngine, RouteEngine }` pairs. Lazy creation, auto-cleanup on disconnect. |
| **LocationEngine** | Teleport (instant or glide ≤1km), joystick keep-alive, graceful stop. |
| **RouteEngine** | Waypoint routing with play/pause/resume, wander mode, loop, return-to-real-GPS. Ticks at 1Hz. |
| **AntiDetect** | Gaussian jitter (σ=10m), ±15% speed fluctuation, 30% bearing smoothing. |
| **DB** | SQLite for saved locations & location history. |

## UI Layout

### Desktop (≥1024px)

```
┌──────────────────────────────────────────────────────────┐
│ TopBar: [Device ▼][+Add] [Walk Cycle Drive HSR Plane] [⏹]│
├───────────┬──────────────────────────┬───────────────────┤
│ Teleport  │                          │   Route Panel     │
│  Panel    │     Map (Leaflet)        │                   │
├───────────┤                          ├───────────────────┤
│ Joystick  │                          │  Logs / Devices   │
└───────────┴──────────────────────────┴───────────────────┘
```

### Mobile (<768px)

```
┌───────────────────────┐
│ TopBar: [Device▾][⏹]  │
├───────────────────────┤
│   Map (full width)    │
├───────────────────────┤
│ [Teleport][Move][Route]│  ← swipeable BottomSheet
│  Active tab content    │    drag handle to minimize
└───────────────────────┘
```

## State Management (Zustand)

| Store | Key state |
|---|---|
| `device.store` | `devices[]`, `activeDevice`, `selectedSerials`, `getTargetSerials()` |
| `location.store` | `location`, `mode`, `realGpsLocation`, `pendingTeleport`, `allDeviceLocations` |
| `route.store` | `waypoints[]`, `playing`, `wandering`, `speedMs`, `wanderEnabled`, `returnOnFinish` |
| `ui.store` | `activeTab`, `mapClickMode` |
| `log.store` | `entries[]` (last 500) |

## Communication Protocol

### Electron Mode (IPC)
```
window.api.teleport(serials, lat, lng)
  → ipcRenderer.invoke → ipcMain.handle → LocationEngine.teleport()
  → BrowserWindow.send('location-updated', data)
```

### Web Mode (WebSocket + REST)
```
window.api.teleport(serials, lat, lng)
  → ws.send({ id, channel: 'teleport', args: [serials, lat, lng] })
  → Express handler → LocationEngine.teleport()
  → ws.send({ type: 'event', channel: 'location-updated', data })
```

Four push event channels: `devices-changed`, `location-updated`, `route-updated`, `log-entry`

## Anti-Cheat Measures

- **GPS jitter**: Gaussian noise (σ=0.00009°, ~10m) — 95% within ±20m
- **Speed fluctuation**: ±15% random variation on movement speed
- **Bearing smoothing**: 30% interpolation per tick (no instant direction changes)
- **Cooldown timer**: Warns before teleporting long distances per Pokémon GO cooldown table
- **Speed presets**: Walk 1.4 m/s, Cycle 4.2 m/s, Drive 11.0 m/s, HSR 83.3 m/s, Plane 250 m/s

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop App | Electron 33, electron-vite |
| Web Server | Express 4, ws (WebSocket) |
| UI | React 19, TypeScript, Tailwind CSS v3, Zustand |
| Map | react-leaflet (OpenStreetMap tiles) |
| Icons | lucide-react |
| Database | better-sqlite3 (SQLite) |
| ADB | Android Debug Bridge via child_process |
| Build | esbuild (server bundle), Vite (client), Docker |
| Deployment | Docker (node:20-alpine + android-tools), Portainer |

## Build & Distribution

### Electron Desktop
```bash
pnpm dev          # Dev mode (hot reload)
pnpm build        # Build → out/
pnpm dist:win     # Windows NSIS installer → dist/
pnpm dist:linux   # Linux AppImage → dist/
```

### Web (Docker)
```bash
node build-server.cjs                      # Bundle server → dist/server/index.js
npx vite build --config vite.web.config.ts # Build client → dist/client/
docker build -t pikmin-keep-web .          # Multi-stage Docker build
```

See `docs/deployment.md` for full Docker/Portainer deployment instructions.

App ID: `com.pikminkeep`
