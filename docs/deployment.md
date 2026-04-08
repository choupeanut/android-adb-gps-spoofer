# Android ADB GPS Spoofer — Deployment Guide

## Overview

Android ADB GPS Spoofer can be deployed as a **standalone Docker container** on any machine with Docker and ADB access (e.g., a NAS with USB-connected Android devices, or a Linux server). The container runs an Express + WebSocket server that serves the React UI and communicates with Android devices via ADB.

---

## Architecture

```
┌──────────────────┐     HTTP / WebSocket      ┌───────────────────┐
│  Phone Browser   │ ◄────────────────────────► │  Docker Container │
│  (any device on  │    port 3001 (LAN)         │  pikmin-keep-web  │
│   same LAN)      │                            │                   │
└──────────────────┘                            │  ┌─────────────┐  │
                                                │  │ Express +WS │  │
┌──────────────────┐     USB / WiFi ADB         │  │ (Node.js)   │  │
│  Android Phone   │ ◄────────────────────────► │  ├─────────────┤  │
│  (target device) │    adb commands            │  │ android-tools│  │
└──────────────────┘                            │  └─────────────┘  │
                                                │  Volume: /data    │
                                                │  (SQLite DB)      │
                                                └───────────────────┘
```

---

## Prerequisites

- Docker Engine (20.x+) on the host machine
- `android-tools` / ADB accessible from the host (included in Docker image)
- Android device(s) with **Developer Options** enabled
  - **USB debugging** ON
  - **Mock location app** set (or will be set via ADB)
- Host machine and phone browser on the **same LAN**

---

## Files Involved

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: node:20-alpine builder + runtime |
| `build-server.cjs` | esbuild script — bundles `web/server/index.ts` → single CJS file |
| `vite.web.config.ts` | Vite config — builds client from `web/client/` entry |
| `web/package.json` | Production dependencies for Docker runtime stage |
| `web/server/` | Standalone server (Express + WS, no Electron deps) |
| `web/client/` | Browser entry: `web-api.ts` adapter + `main-web.ts` + `index.html` |

---

## Build Docker Image

### Option A: Build locally

```bash
# From project root
docker build -t pikmin-keep-web:latest .
```

### Option B: Build on remote Docker host (via Portainer API)

```bash
# Create tar of build context
tar czf /tmp/pikmin-build-context.tar.gz \
  Dockerfile package.json pnpm-lock.yaml pnpm-workspace.yaml \
  tailwind.config.js postcss.config.js vite.web.config.ts build-server.cjs \
  src/shared/ src/renderer/ web/

# Build via Portainer Docker build API
curl -X POST \
  'https://<PORTAINER_HOST>/api/endpoints/<ENDPOINT_ID>/docker/build?t=pikmin-keep-web:latest&dockerfile=Dockerfile' \
  -H 'X-API-Key: <API_TOKEN>' \
  -H 'Content-Type: application/x-tar' \
  --data-binary @/tmp/pikmin-build-context.tar.gz
```

### What the Dockerfile does

1. **Stage 1 (builder)**: Installs pnpm + build tools, runs `node build-server.cjs` (esbuild → `dist/server/index.js`) and `npx vite build --config vite.web.config.ts` (→ `dist/client/`)
2. **Stage 2 (runtime)**: Minimal node:20-alpine with `android-tools` (provides `adb`), copies built artifacts + production node_modules

---

## Deploy with Docker Compose

### docker-compose.yml

```yaml
services:
  pikmin-keep-web:
    image: pikmin-keep-web:latest
    container_name: pikmin-keep-web
    restart: unless-stopped
    environment:
      - PORT=3001
      - DATA_DIR=/data
    volumes:
      - pikmin-data:/data
    network_mode: host    # Required for ADB device access

volumes:
  pikmin-data:
    driver: local
```

### Start

```bash
docker compose up -d
```

The app is now available at `http://<HOST_IP>:3001`.

---

## Deploy with Portainer

1. **Build the image** (Option B above, or push to a registry)
2. **Create a Stack** in Portainer:
   - Name: `pikmin-keep-web`
   - Paste the docker-compose.yml above
   - Deploy
3. **Update an existing stack**:
   - Rebuild the image (via API or CLI)
   - Stop stack → Start stack (Portainer API or UI)

### Portainer API commands

```bash
# Stop stack
curl -X POST 'https://<PORTAINER>/api/stacks/<STACK_ID>/stop?endpointId=<EP_ID>' \
  -H 'X-API-Key: <TOKEN>'

# Start stack
curl -X POST 'https://<PORTAINER>/api/stacks/<STACK_ID>/start?endpointId=<EP_ID>' \
  -H 'X-API-Key: <TOKEN>'
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATA_DIR` | `/data` | SQLite database storage directory |
| `NODE_ENV` | `production` | Node environment |

---

## Current Production Deployment

| Property | Value |
|---|---|
| Host | Synology NAS (amd64) |
| Portainer | `https://portainer.choupeanut.synology.me` |
| Endpoint ID | 3 |
| Stack ID | 43 |
| Stack name | `pikmin-keep-web` |
| Container | `pikmin-keep-web` |
| Port | 3001 (via `network_mode: host`) |
| Data volume | `pikmin-data` → `/data` |

---

## Connecting Android Devices

### USB (direct)
1. Connect Android device to the Docker host via USB
2. Device should appear automatically via `adb devices` inside the container
3. In the web UI, click the device selector (top-left) → device should be listed

### WiFi ADB
1. Open the web UI on your phone browser: `http://<HOST_IP>:3001`
2. Click device selector → **+ Add Device**
3. The phone's LAN IP will be auto-detected and pre-filled (via `/api/client-ip`)
4. If the device was previously set up with `adb tcpip 5555`, enter IP and click Connect
5. Or use "USB → Wi-Fi setup" to enable TCP/IP mode from an already USB-connected device

---

## Rebuild & Redeploy Workflow

Quick reference for updating the deployed app:

```bash
# 1. Make code changes locally

# 2. Test locally
node build-server.cjs
npx vite build --config vite.web.config.ts

# 3. Create build context tar
tar czf /tmp/pikmin-build-context.tar.gz \
  Dockerfile package.json pnpm-lock.yaml pnpm-workspace.yaml \
  tailwind.config.js postcss.config.js vite.web.config.ts build-server.cjs \
  src/shared/ src/renderer/ web/

# 4. Build image on NAS via Portainer API
python3 -c "
import urllib.request
with open('/tmp/pikmin-build-context.tar.gz', 'rb') as f:
    data = f.read()
req = urllib.request.Request(
    'https://portainer.choupeanut.synology.me/api/endpoints/3/docker/build?t=pikmin-keep-web:latest&dockerfile=Dockerfile',
    data=data, method='POST',
    headers={'X-API-Key': '<TOKEN>', 'Content-Type': 'application/x-tar'})
resp = urllib.request.urlopen(req, timeout=600)
print(resp.read().decode()[-200:])
"

# 5. Restart stack
curl -X POST 'https://portainer.choupeanut.synology.me/api/stacks/43/stop?endpointId=3' \
  -H 'X-API-Key: <TOKEN>'
curl -X POST 'https://portainer.choupeanut.synology.me/api/stacks/43/start?endpointId=3' \
  -H 'X-API-Key: <TOKEN>'
```

---

## Troubleshooting

### Container starts but no devices found
- `network_mode: host` is required for USB ADB access
- Check `adb devices` works on the Docker host
- Verify USB cable supports data transfer (not charge-only)

### Phone browser can't connect
- Ensure phone and host are on the same LAN/subnet
- Check firewall allows the configured PORT
- Try `http://<HOST_IP>:<PORT>` (not HTTPS)

### SQLite errors on startup
- The `DATA_DIR` volume must be writable
- Check volume mount permissions: `docker exec pikmin-keep-web ls -la /data`

### "Add Device" shows wrong IP
- The auto-detected IP comes from the HTTP connection's `remoteAddress`
- If behind a reverse proxy, ensure `X-Forwarded-For` header is passed
- `network_mode: host` avoids this issue (direct connection)

### Mobile UI scrolls / top bar disappears
- Hard-refresh the browser (clear cache) — the CSS includes `position: fixed` on html/body and `100dvh` viewport units to prevent mobile browser chrome issues
