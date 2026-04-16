# Web Version Deployment Guide

## Quick Deploy to Portainer

### 1. Configure Portainer Settings

Edit `.env.deploy` and set your Portainer details:

```bash
PORTAINER_TOKEN=ptr_K6Vjmz1g7T60EJBa8xBx0IzD5MUZPlBWDw54eH8Q+lA=
PORTAINER_URL=https://your-portainer-url.com
PORTAINER_ENDPOINT_ID=1
STACK_NAME=android-adb-gps-spoofer
```

### 2. Build & Deploy

```bash
# Build the Docker image
./build-web.sh

# Deploy to Portainer
./deploy-portainer.sh
```

## Manual Deployment

### Option 1: Direct Docker Run

```bash
docker run -d \
  --name android-adb-gps-spoofer \
  --privileged \
  -p 3000:3000 \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  android-adb-gps-spoofer:latest
```

### Option 2: Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  gps-spoofer:
    image: android-adb-gps-spoofer:latest
    container_name: android-adb-gps-spoofer
    restart: unless-stopped
    privileged: true
    ports:
      - "3000:3000"
    volumes:
      - /dev/bus/usb:/dev/bus/usb
      - gps-spoofer-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/data

volumes:
  gps-spoofer-data:
```

Then run:

```bash
docker-compose up -d
```

### Option 3: Load from Tar File

Transfer the tar file to your server:

```bash
scp dist/docker/android-adb-gps-spoofer-latest.tar user@server:/tmp/
```

On the server:

```bash
docker load < /tmp/android-adb-gps-spoofer-latest.tar
docker run -d --name android-adb-gps-spoofer --privileged -p 3000:3000 -v /dev/bus/usb:/dev/bus/usb android-adb-gps-spoofer:latest
```

## Access the App

After deployment, access the web interface at:
- Local: http://localhost:3000
- Remote: http://your-server-ip:3000

## Troubleshooting

### Check logs
```bash
docker logs android-adb-gps-spoofer
```

### Verify ADB access
```bash
docker exec android-adb-gps-spoofer adb devices
```

### Restart container
```bash
docker restart android-adb-gps-spoofer
```

## Security Notes

- `.env.deploy` contains sensitive tokens and is git-ignored
- Never commit tokens to version control
- Use environment variables for production secrets
- Restrict network access to port 3000 if needed
