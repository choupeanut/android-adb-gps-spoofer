# Android ADB GPS Spoofer — Contributor Notes

This repo is a dual-runtime Android GPS test-provider control app.

- Desktop runtime: Electron main/preload/renderer
- Web runtime: Docker-friendly Express + WebSocket server
- UI: React 19 + TypeScript + Tailwind CSS
- Device control: ADB through Node `child_process`
- Persistence: SQLite through `better-sqlite3`

## Current Architecture

```text
Electron:
renderer -> window.api -> ipcRenderer.invoke -> ipcMain handlers -> services -> adb
main services -> broadcast -> BrowserWindow events and embedded LAN WebSocket

Standalone web:
browser -> web/client/web-api.ts -> /ws or /api/call -> web/server handlers -> services -> adb
server services -> broadcast -> WebSocket events
```

The two runtimes intentionally mirror service behavior. When changing spoofing logic, compare both:

- `src/main/services/`
- `web/server/services/`

## Important Paths

```text
src/main/index.ts                 Electron app bootstrap, BrowserWindow, tray, embedded server
src/main/ipc/register.ts          Canonical Electron IPC handler registry
src/main/server/index.ts          Embedded desktop LAN static server + WebSocket
src/main/services/adb.service.ts  ADB path resolution, setup, push, real GPS readback
src/main/services/location-engine.ts
src/main/services/route-engine.ts
src/main/services/device-engine-manager.ts
src/main/services/route-planner.ts
src/preload/index.ts              Electron window.api
src/renderer/                     Shared React UI
src/shared/                       Shared types/constants/geo helpers
web/server/index.ts               Standalone Express + WebSocket entry
web/client/web-api.ts             Browser window.api adapter
tests/                            Vitest unit/integration tests
```

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm test:watch

# Desktop release
pnpm dist:win
pnpm dist:linux
pnpm dist:mac

# Standalone web
node build-server.cjs
npx vite build --config vite.web.config.ts
PORT=3000 DATA_DIR=./data node dist/server/index.js

# Docker
docker build -t android-adb-gps-spoofer:latest .
./build-web.sh
```

## ADB Behavior

ADB path resolution:

1. `ADB_PATH`
2. packaged resource `platform-tools/adb(.exe)`
3. development resource `resources/platform-tools/adb(.exe)`
4. system `adb`

Packaged Windows builds include:

- `resources/platform-tools/adb.exe`
- `AdbWinApi.dll`
- `AdbWinUsbApi.dll`

Packaged macOS builds include `resources/platform-tools-mac/adb`; run `scripts/download-mac-adb.sh` before `pnpm dist:mac`. The first macOS release channel is unsigned and uses `CSC_IDENTITY_AUTO_DISCOVERY=false`.

For future signed/notarized macOS releases, add Apple Developer signing credentials such as `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, or equivalent App Store Connect API key variables.

Linux builds default to system `adb`.

Mock-location setup:

- `appops set com.android.shell android:mock_location allow`
- fallback legacy op: `mock_location`
- `cmd location providers add-test-provider gps`
- `cmd location providers set-test-provider-enabled gps true`

Location push:

- primary Android 14+ syntax: `cmd location providers set-test-provider-location gps --location LAT,LNG --accuracy N --time T`
- fallback legacy syntax: `cmd location providers set-test-provider-location gps LAT,LNG`

Real GPS readback:

- strict default trusts only `network` provider
- `ALLOW_CONTAMINATED_REAL_GPS=1` allows fallback to passive/fused/gps for diagnostics
- `EXPERIMENTAL_DISABLE_REAL_GPS_ON_FAKE=1` tries to disable master location while spoofing and restore it on stop

## Core Runtime Constants

From `src/shared/constants.ts`:

- `UPDATE_INTERVAL_MS = 500`
- `ADB_POLL_INTERVAL_MS = 3000`
- `DEFAULT_ACCURACY = 10`
- speed presets:
  - walk: `1.4 m/s`
  - cycle: `5.14 m/s`
  - drive: `11.0 m/s`
  - hsr: `83.3 m/s`
  - plane: `250.0 m/s`

## Engine Model

`DeviceEngineManager` owns one `{ LocationEngine, RouteEngine }` pair per serial.

Location engine:

- teleport
- teleport always pushes the target coordinate immediately
- joystick keep-alive
- graceful stop
- backup keep-alive timer

Route engine:

- manual route playback
- road-network planned waypoints
- pause/resume
- loop
- wander
- fixed speed
- return to real GPS
- push watchdog for stale route streams

## Web API

Standalone web server:

- `POST /api/call`
- `POST /api/gpx/parse`
- `GET /api/version`
- `GET /api/client-ip`
- WebSocket at `/ws`
- Wi-Fi IP history handlers: `wifi-ip-history-get`, `wifi-ip-history-record`, `wifi-ip-history-delete`

Embedded desktop LAN server:

- static renderer build
- WebSocket command surface using the handler registry from `src/main/server/index.ts`
- default port `3388`

## UI Rules

Follow `DESIGN.md` and the tokens in `src/renderer/styles/globals.css`.

- Use Tailwind token classes, not raw hex colors.
- Use `lucide-react` icons.
- Keep the first screen operational, not promotional.
- Do not add a local Stop button to Teleport; use Stop All or route stop flows.
- Joystick speed comes from TopBar, not joystick force.
- Route speed changes while playing must call both store update and `window.api.routeSetSpeed(ms)`.
- Add Device quick IP buttons merge localStorage and SQLite history.
- Map tile provider is persisted in session as `tileProvider`.

## Common Gotchas

- `window.api` only exists after preload/web adapter setup.
- Web and Electron service copies can drift; keep logic changes in sync.
- `routePause()` intentionally keeps the mock provider alive.
- `routeStop()` removes the provider; `routeStopStay()` transfers to location keep-alive.
- `stopAll('stay')` does not restore master location; other stop modes do.
- Route events also broadcast `location-updated` so the map marker and mode stay in sync.
- Desktop DB and web DB are still named `pikmin-keep.db` for compatibility.

## Testing

```bash
pnpm test
```

Current tests cover coordinate utilities, cooldown behavior, anti-detect jitter/speed behavior, device engine manager behavior, route planner behavior, and WebSocket integration. Renderer interaction coverage is still limited.
