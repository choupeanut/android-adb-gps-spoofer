# Web Version Deployment Guide

This file is the short deployment checklist. For a deeper deployment explanation, see `docs/deployment.md`.

## Runtime Summary

- Container runtime: Node.js 20 Alpine
- Server: Express + WebSocket
- Container port: `3000`
- Default host port: `3001` (`3000` is reserved for the existing CISSP site)
- Persistent data path: `/data`
- Android tooling: Alpine `android-tools` package, including `adb`
- USB ADB requirement: privileged container plus `/dev/bus/usb` mount

## Build Image

```bash
./build-web.sh
```

The script builds `android-adb-gps-spoofer:latest`, adds a timestamp tag, and saves a tar archive under `dist/docker/`.

Manual build:

```bash
docker build -t android-adb-gps-spoofer:latest .
```

## Direct Docker Run

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

Open `http://<host-ip>:3001`.

## Docker Compose

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

Start:

```bash
docker compose up -d
```

## Portainer Deployment

1. Copy the example env file:

```bash
cp .env.deploy.example .env.deploy.local
```

2. Edit `.env.deploy.local`:

```bash
PORTAINER_TOKEN=ptr_your_token_here
PORTAINER_URL=https://portainer.example.com
PORTAINER_ENDPOINT_ID=1
STACK_NAME=android-adb-gps-spoofer
```

3. Build and deploy:

```bash
./build-web.sh
./deploy-portainer.sh
```

The deploy script can build the image on the Portainer endpoint, stop the old `pikmin-keep-web` stack, copy `pikmin-data` into `gps-spoofer-data`, and create/update the `android-adb-gps-spoofer` stack.

## Load From Tar

```bash
scp dist/docker/android-adb-gps-spoofer-latest.tar user@server:/tmp/
ssh user@server
docker load < /tmp/android-adb-gps-spoofer-latest.tar
docker run -d --name android-adb-gps-spoofer --privileged -p 3001:3000 \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  android-adb-gps-spoofer:latest
```

## Operations

```bash
docker logs android-adb-gps-spoofer
docker exec android-adb-gps-spoofer adb devices
docker restart android-adb-gps-spoofer
docker exec android-adb-gps-spoofer ls -la /data
```

## Security Notes

- Keep `.env.deploy.local` out of version control.
- Restrict the exposed host port, default `3001`, to trusted LAN/VPN clients.
- Do not expose the UI publicly unless you add authentication and TLS at a reverse proxy.
- `--privileged` is required for common USB ADB setups but increases container privileges; prefer LAN-only hosts.
