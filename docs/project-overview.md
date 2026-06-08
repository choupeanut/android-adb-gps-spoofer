# Android ADB GPS Spoofer — Repository Analysis

## Executive Summary

This repo is a mature dual-runtime TypeScript application for Android GPS test-provider control over ADB. The same React control UI is used in two environments:

1. **Electron desktop app** with IPC and an optional embedded LAN web server.
2. **Standalone Docker web server** with Express, REST fallback, and WebSocket command/event transport.

The core product surface is operational rather than informational: connect Android devices, set up the `gps` test provider, push spoofed coordinates, run joystick or routes, and keep provider state alive aggressively enough to reduce jump-back to real GPS.

The main maintenance risk is duplicated runtime service code between `src/main/services/` and `web/server/services/`. The main correctness risk is lifecycle handling around ADB disconnects, route pause/stop handoff, and real GPS readback while a mock provider is active.

## Runtime Architecture

### Electron Desktop

```text
React renderer
  -> window.api from src/preload/index.ts
  -> ipcRenderer.invoke(channel, args)
  -> src/main/ipc/register.ts
  -> services
  -> adb child_process

services
  -> src/main/services/broadcast.ts
  -> BrowserWindow events
  -> embedded LAN WebSocket clients
```

`src/main/server/index.ts` serves the built renderer and exposes a WebSocket command surface for LAN access from the desktop runtime. Default port is `3388`.

### Standalone Web

```text
Browser
  -> web/client/web-api.ts
  -> WebSocket /ws, fallback POST /api/call
  -> web/server/index.ts handler registry
  -> web/server/services
  -> adb child_process

services
  -> web/server/broadcast.ts
  -> WebSocket events
```

The standalone server also exposes:

- `POST /api/gpx/parse`
- `GET /api/version`
- `GET /api/client-ip`

## Project Layout

```text
src/
  main/
    index.ts                    Electron bootstrap
    ipc/register.ts             IPC handlers and embedded-web handler registration
    ipc/gpx.ipc.ts              Desktop GPX file import
    server/index.ts             Embedded HTTP + WebSocket LAN server
    services/
      adb.service.ts            ADB diagnostics, setup, push, real GPS readback
      anti-detect.ts            jitter, speed variation, bearing smoothing
      broadcast.ts              event fan-out
      db.ts                     desktop SQLite
      device-manager.ts         ADB polling
      device-engine-manager.ts  per-device engine lifecycle
      location-engine.ts        teleport, joystick, graceful stop
      route-engine.ts           route playback, loop, wander, return, watchdog
      route-planner.ts          OSRM road-network planner
    utils/
      coordinates.ts
      cooldown.ts
  preload/
    index.ts                    Electron contextBridge API
  renderer/
    App.tsx                     subscriptions, session hydration, responsive layout
    components/                 map, controls, devices, panels, UI primitives
    stores/                     Zustand stores
    styles/globals.css          design tokens
  shared/
    constants.ts                speed/update/cooldown constants
    types.ts                    shared TypeScript contracts
    geo.ts                      renderer-safe geo helpers

web/
  server/
    index.ts                    Express + WebSocket server
    services/                   Electron-free service copies
  client/
    web-api.ts                  browser window.api adapter
    main-web.ts
    index.html

tests/
  unit/
  integration/
```

## Core Services

| Service | Role |
|---|---|
| `AdbService` | Resolves ADB path, lists devices, tests connection, enables mock location, pushes coordinates, reads real location, manages Wi-Fi ADB |
| `DeviceManager` | Polls `adb devices -l` every 3 seconds and broadcasts changes |
| `DeviceEngineManager` | Creates and prunes per-device location/route engines |
| `LocationEngine` | Teleport, short glide, joystick keep-alive, graceful stop |
| `RouteEngine` | Route playback, pause/resume, loop, wander, fixed speed, return-to-GPS, stale-push watchdog |
| `RoutePlannerService` | Calls OSRM and converts control points into routed waypoints |
| `Database` | Saved locations, 100-entry history, session persistence |
| `broadcast` | Runtime-specific fan-out to renderer or WebSocket clients |

## ADB Command Model

Setup flow:

```text
appops set com.android.shell android:mock_location allow
cmd location providers add-test-provider gps
cmd location providers set-test-provider-enabled gps true
```

Push flow:

```text
cmd location providers set-test-provider-location gps --location LAT,LNG --accuracy N --time T
```

Fallback push flow:

```text
cmd location providers set-test-provider-location gps LAT,LNG
```

Real GPS readback defaults to network-provider-only parsing because `gps`, `fused`, and `passive` can be contaminated once the test provider is active. `ALLOW_CONTAMINATED_REAL_GPS=1` enables fallback parsing for diagnostics.

## Location and Route Behavior

| Behavior | Implementation |
|---|---|
| Teleport | Immediate push unless existing mock location is within 1 km |
| Teleport glide | Walk-speed glide using 500 ms updates |
| Teleport hold | Primary keep-alive every 500 ms plus backup every 1000 ms |
| Joystick | Position updates at 500 ms, speed from TopBar |
| Route playback | Interpolates between waypoints every 500 ms |
| Route start glide | Glides to first waypoint if start position is within 500 m |
| Route pause | Stops route timer but keeps provider alive |
| Route stop | Removes test provider and restores experimental master location if needed |
| Route stop stay | Transfers current route position into location keep-alive |
| Wander | Random target inside configured radius after route end |
| Return to GPS | Walks from current mock position to known real GPS, then cleans up |

## Shared Constants

| Constant | Value |
|---|---:|
| `UPDATE_INTERVAL_MS` | `500` |
| `ADB_POLL_INTERVAL_MS` | `3000` |
| `DEFAULT_ACCURACY` | `10` |
| Walk | `1.4 m/s` |
| Cycle | `5.14 m/s` |
| Drive | `11.0 m/s` |
| HSR | `83.3 m/s` |
| Plane | `250.0 m/s` |

## State Management

Zustand stores:

| Store | Key state |
|---|---|
| `device.store` | devices, active device, selected serials, target serial resolution |
| `location.store` | current mock location, mode, real GPS, pending teleport, all-device real locations |
| `route.store` | waypoints, control points, route mode/profile, speed, fixed speed, loop, wander, return flags |
| `ui.store` | active tab and panel state |
| `log.store` | last 500 log entries |

Session persistence is handled through `get-session` / `save-session` and SQLite.

## UI Analysis

The current UI is map-first:

- `TopBar` handles device selection, multi-select, speed presets, shortcuts, version, and Stop All.
- Device selection includes Select All/Clear and Add Device auto-selects newly connected devices.
- Desktop uses floating control panels instead of a static three-column layout.
- Mobile/tablet use a bottom sheet.
- Route controls support manual and road-network modes.
- Device status is reflected through compact colored dots.
- Add Device records successful Wi-Fi IPs locally and in SQLite for quick reconnect buttons.
- Map tiles are configurable: CARTO, OSM local labels, or a custom tile URL with attribution.

The UI is dense and appropriate for an operational tool. The main design constraint is avoiding hidden critical controls on mobile, especially Stop All and device selection.

## Build and Distribution

Desktop:

```bash
pnpm dev
pnpm build
pnpm dist:win
pnpm dist:linux
pnpm dist:mac
```

Web:

```bash
node build-server.cjs
npx vite build --config vite.web.config.ts
docker build -t android-adb-gps-spoofer:latest .
```

Electron app ID:

```text
com.peanutchou.android-adb-gps-spoofer
```

## Test Coverage

Current tests include:

- anti-detect behavior
- cooldown calculations
- coordinate helpers
- device engine manager
- route planner
- WebSocket integration

Notable gaps:

- renderer interaction tests
- full route lifecycle with mocked ADB failures
- Wi-Fi disconnect/reconnect recovery
- parity tests between `src/main/services` and `web/server/services`

## Maintenance Risks

1. **Duplicated service trees**: Electron and web services are similar but not generated from a single source. Changes should be mirrored and tested.
2. **ADB version variance**: Android command syntax and location dumps differ across versions. Keep fallback parsing conservative.
3. **Real GPS trust**: Only `network` provider is trusted by default. UI behavior that requires real GPS should handle `null`.
4. **Provider cleanup**: Stop, return, disconnect, and shutdown paths must remove test providers unless the user explicitly chose stay.
5. **Public exposure risk**: Web UI controls connected devices and should stay on trusted LAN/VPN unless authentication is added.

## Recommended Next Work

- Add parity tests for Electron/web service behavior.
- Add mocked ADB integration tests for route stop, stop-stay, graceful stop, and disconnect cleanup.
- Consider extracting shared service logic to reduce duplicated files.
- Rename SQLite file from `pikmin-keep.db` only with a migration plan, because existing installs depend on it.
