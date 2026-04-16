#!/bin/bash
set -e

echo "=== Deploying to Portainer ==="

# Load deployment config
if [ ! -f .env.deploy ]; then
  echo "Error: .env.deploy not found"
  echo "Please create .env.deploy with PORTAINER_TOKEN and PORTAINER_URL"
  exit 1
fi

source .env.deploy

# Validate required variables
if [ -z "$PORTAINER_TOKEN" ]; then
  echo "Error: PORTAINER_TOKEN not set in .env.deploy"
  exit 1
fi

if [ -z "$PORTAINER_URL" ]; then
  echo "Error: PORTAINER_URL not set in .env.deploy (e.g., https://portainer.yourdomain.com)"
  exit 1
fi

PORTAINER_ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-1}"
STACK_NAME="${STACK_NAME:-android-adb-gps-spoofer}"
IMAGE_NAME="android-adb-gps-spoofer"
IMAGE_TAG="${1:-latest}"

# Check if stack exists
echo "Checking if stack '${STACK_NAME}' exists..."
STACK_ID=$(curl -s -H "X-API-Key: ${PORTAINER_TOKEN}" \
  "${PORTAINER_URL}/api/stacks" | \
  jq -r ".[] | select(.Name == \"${STACK_NAME}\") | .Id" || echo "")

if [ -z "$STACK_ID" ]; then
  echo "Stack not found. Creating new stack..."
  
  # Create docker-compose.yml for the stack
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
