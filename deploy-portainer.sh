#!/bin/bash
set -euo pipefail

echo "=== Deploying to Portainer ==="

# Load deployment config (local-first to avoid committing secrets)
if [ -f .env.deploy.local ]; then
  source .env.deploy.local
elif [ -f .env.deploy ]; then
  source .env.deploy
else
  echo "Error: no deployment env file found"
  echo "Create .env.deploy.local (preferred) or .env.deploy from .env.deploy.example"
  exit 1
fi

# Validate required variables
if [ -z "$PORTAINER_TOKEN" ]; then
  echo "Error: PORTAINER_TOKEN not set in deployment env file"
  exit 1
fi

if [ -z "$PORTAINER_URL" ]; then
  echo "Error: PORTAINER_URL not set (e.g., https://portainer.yourdomain.com)"
  exit 1
fi

PORTAINER_ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-1}"
STACK_NAME="${STACK_NAME:-android-adb-gps-spoofer}"
IMAGE_NAME="android-adb-gps-spoofer"
IMAGE_TAG="${1:-latest}"

# Always generate compose content first (used by both create and update paths)
cat > /tmp/docker-compose-deploy.yml <<EOF
version: '3.8'

services:
  gps-spoofer:
    image: ${IMAGE_NAME}:${IMAGE_TAG}
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
EOF

# Check if stack exists
echo "Checking if stack '${STACK_NAME}' exists..."
STACK_ID=$(curl -s -H "X-API-Key: ${PORTAINER_TOKEN}" \
  "${PORTAINER_URL}/api/stacks" | \
  jq -r ".[] | select(.Name == \"${STACK_NAME}\") | .Id" || echo "")

if [ -z "$STACK_ID" ]; then
  echo "Stack not found. Creating new stack..."

  # Create stack via Portainer API
  curl -X POST \
    -H "X-API-Key: ${PORTAINER_TOKEN}" \
    -H "Content-Type: application/json" \
    "${PORTAINER_URL}/api/stacks?type=2&method=string&endpointId=${PORTAINER_ENDPOINT_ID}" \
    -d @- <<EOF
{
  "Name": "${STACK_NAME}",
  "StackFileContent": "$(cat /tmp/docker-compose-deploy.yml | sed 's/"/\\"/g' | sed 's/$/\\n/g' | tr -d '\n')",
  "Env": []
}
EOF

  echo ""
  echo "✓ Stack created: ${STACK_NAME}"
else
  echo "Stack found (ID: ${STACK_ID}). Updating..."
  
  # Update stack
  curl -X PUT \
    -H "X-API-Key: ${PORTAINER_TOKEN}" \
    -H "Content-Type: application/json" \
    "${PORTAINER_URL}/api/stacks/${STACK_ID}?endpointId=${PORTAINER_ENDPOINT_ID}" \
    -d @- <<EOF
{
  "StackFileContent": "$(cat /tmp/docker-compose-deploy.yml | sed 's/"/\\"/g' | sed 's/$/\\n/g' | tr -d '\n')",
  "Env": [],
  "Prune": false,
  "PullImage": true
}
EOF

  echo ""
  echo "✓ Stack updated: ${STACK_NAME}"
fi

rm -f /tmp/docker-compose-deploy.yml

echo ""
echo "=== Deployment Complete ==="
echo "Stack: ${STACK_NAME}"
echo "URL: ${PORTAINER_URL}"
echo "Web interface should be available at: http://your-server:3000"
