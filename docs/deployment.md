# Android ADB GPS Spoofer — Deployment Guide

## Overview

The standalone web version runs the same core spoofing services without Electron. It serves the React UI, exposes REST and WebSocket APIs, and talks to Android devices through ADB.

```text
Browser UI  ->  HTTP / WebSocket  ->  Docker container
                                      Express + ws
                                      ADB child_process
                                      SQLite at DATA_DIR

Android target device  <->  USB ADB or Wi-Fi ADB  <->  container adb
```

Default URL: `http://<host-ip>:3001`. The container listens on `3000`; host port `3000` is reserved for the existing CISSP site and must not be used by this stack.

## What Gets Built

| File | Role |
|---|---|
| `Dockerfile` | Multi-stage Node 20 Alpine build and runtime image |
| `build-server.cjs` | Bundles `web/server/index.ts` into `dist/server/index.js` |
| `vite.web.config.ts` | Builds browser assets into `dist/client/` |
| `web/package.json` | Runtime dependencies for the container |
| `web/server/index.ts` | Express API, static serving, WebSocket server at `/ws` |
| `web/client/web-api.ts` | Browser-side `window.api` adapter |

## Server Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/call` | REST fallback for registered command handlers |
| `POST /api/gpx/parse` | Parse GPX content and return waypoints |
| `GET /api/version` | Return `APP_VERSION` or `dev` |
| `GET /api/client-ip` | Return detected client IP for Wi-Fi ADB setup |
| `GET /ws` | WebSocket command/response and push events |

WebSocket messages use:

```json
{ "id": "1", "channel": "teleport", "args": [["SERIAL"], 25.0, 121.5] }
```

Server responses use `type: "response"`, and push events use `type: "event"` with channels such as `devices-changed`, `location-updated`, `route-updated`, and `log-entry`.

## Prerequisites

- Docker Engine on the host
- Android device with developer options and USB debugging enabled
- A data-capable USB cable for USB ADB or initial Wi-Fi ADB setup
- LAN access from browser clients to the Docker host

For USB ADB inside the container, use:

- `--privileged`
- `/dev/bus/usb:/dev/bus/usb`

For Wi-Fi ADB only, USB passthrough is not required after `adb tcpip 5555` has been enabled.

## Build

```bash
docker build -t android-adb-gps-spoofer:latest .
```

Or use the helper:

```bash
./build-web.sh
```

The helper also writes `dist/docker/android-adb-gps-spoofer-latest.tar`.

## Run With Docker

```bash
docker run -d \
  --name android-adb-gps-spoofer \
  --restart unless-stopped \
  --privileged \
  -p 3001:3000 \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  -e PORT=3000 \
  -e DATA_DIR=/data \
  android-adb-gps-spoofer:latest
```

## Run With Docker Compose

```yaml
services:
  gps-spoofer:
    image: android-adb-gps-spoofer:latest
    container_name: android-adb-gps-spoofer
    restart: unless-stopped
    privileged: true
    ports:
      - "3001:3000"
    volumes:
      - /dev/bus/usb:/dev/bus/usb
      - gps-spoofer-data:/data
    environment:
      NODE_ENV: production
      PORT: "3000"
      DATA_DIR: /data

volumes:
  gps-spoofer-data:
```

```bash
docker compose up -d
```

## Portainer

The repo includes a helper that creates or updates a Portainer stack.

```bash
cp .env.deploy.example .env.deploy.local
```

Edit `.env.deploy.local`:

```bash
PORTAINER_TOKEN=ptr_your_token_here
PORTAINER_URL=https://portainer.example.com
PORTAINER_ENDPOINT_ID=3
STACK_NAME=android-adb-gps-spoofer
OLD_STACK_NAME=pikmin-keep-web
DATA_VOLUME=gps-spoofer-data
OLD_DATA_VOLUME=pikmin-data
APP_PORT=3001
REMOTE_BUILD=1
MIGRATE_OLD_STACK=1
```

Then run:

```bash
./build-web.sh
./deploy-portainer.sh
```

The helper-generated stack uses:

- image `android-adb-gps-spoofer:latest`
- container `android-adb-gps-spoofer`
- port `3001:3000`
- volume `gps-spoofer-data:/data`
- USB passthrough and privileged mode

When `MIGRATE_OLD_STACK=1`, the helper stops the old `pikmin-keep-web` stack, copies `pikmin-data` into `gps-spoofer-data`, then deploys the new stack. The old stack is left in Portainer for rollback/reference.

## Environment Variables

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3000` | Container HTTP and WebSocket port |
| `APP_PORT` | `3001` | Host port used by Portainer deployment scripts |
| `DATA_DIR` | `/data` in Docker | SQLite database directory |
| `APP_VERSION` | `dev` | Version returned by `/api/version` |
| `ADB_PATH` | unset | Override `adb` binary path |
| `ALLOW_CONTAMINATED_REAL_GPS` | `0` | Allow fallback GPS providers for diagnostics |
| `EXPERIMENTAL_DISABLE_REAL_GPS_ON_FAKE` | `0` | Best-effort system location disable while spoofing |

## Android Connection

### USB

1. Connect the target Android device to the Docker host.
2. Accept the USB debugging RSA prompt on the phone.
3. Check device visibility:

```bash
docker exec android-adb-gps-spoofer adb devices
```

4. Open the UI and click **Setup GPS** on the device card.

### Wi-Fi ADB

1. Connect by USB once.
2. In the UI, choose **Add Device -> USB -> Wi-Fi setup**, or run `adb tcpip 5555`.
3. Enter the phone LAN IP and port `5555`.
4. If the phone reboots, repeat the USB `tcpip` step.

## Data Persistence

The web database is stored at:

```text
${DATA_DIR}/pikmin-keep.db
```

It contains saved locations, last 100 history entries, and session settings.

## Troubleshooting

**No devices found**

```bash
docker exec android-adb-gps-spoofer adb devices -l
```

- Confirm USB debugging is enabled.
- Confirm the RSA prompt was accepted.
- Confirm `--privileged` and `/dev/bus/usb` are present.
- Try Wi-Fi ADB if the host cannot pass USB devices to Docker.

**Web UI cannot connect**

- Confirm the container is listening: `docker logs android-adb-gps-spoofer`
- Confirm firewall rules allow the configured host port, default `3001`.
- Use `http://<host-ip>:3001`, not `https`, unless a reverse proxy is configured.

**SQLite or session data is missing**

- Confirm `/data` is mounted and writable:

```bash
docker exec android-adb-gps-spoofer ls -la /data
```

**Wi-Fi ADB is unstable**

- Keep the phone and host on the same LAN.
- Avoid phone Wi-Fi sleep.
- Re-run `adb tcpip 5555` after reboot.
- The app applies best-effort Wi-Fi hardening on setup, but TCP ADB can still drop.

## Security

- Treat the UI as a privileged control surface for connected Android devices.
- Keep it on a trusted LAN or VPN.
- Add authentication and TLS at a reverse proxy before exposing it beyond a trusted network.
- Avoid committing `.env.deploy.local` or API tokens.
