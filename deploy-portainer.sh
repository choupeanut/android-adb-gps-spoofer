#!/bin/bash
set -euo pipefail

echo "=== Deploying to Portainer ==="

if [ -f .env.deploy.local ]; then
  source .env.deploy.local
elif [ -f .env.deploy ]; then
  source .env.deploy
else
  echo "Error: no deployment env file found"
  echo "Create .env.deploy.local (preferred) or .env.deploy from .env.deploy.example"
  exit 1
fi

if [ -z "${PORTAINER_TOKEN:-}" ]; then
  echo "Error: PORTAINER_TOKEN not set in deployment env file"
  exit 1
fi

if [ -z "${PORTAINER_URL:-}" ]; then
  echo "Error: PORTAINER_URL not set (e.g., https://portainer.yourdomain.com)"
  exit 1
fi

PORTAINER_ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-3}"
STACK_NAME="${STACK_NAME:-android-adb-gps-spoofer}"
OLD_STACK_NAME="${OLD_STACK_NAME:-pikmin-keep-web}"
IMAGE_NAME="${IMAGE_NAME:-android-adb-gps-spoofer}"
IMAGE_TAG="${1:-latest}"
DATA_VOLUME="${DATA_VOLUME:-gps-spoofer-data}"
OLD_DATA_VOLUME="${OLD_DATA_VOLUME:-pikmin-data}"
APP_PORT="${APP_PORT:-3001}"
REMOTE_BUILD="${REMOTE_BUILD:-1}"
MIGRATE_OLD_STACK="${MIGRATE_OLD_STACK:-1}"

if [ "${APP_PORT}" = "3000" ]; then
  echo "Error: host port 3000 is reserved for another site. Set APP_PORT to another value."
  exit 1
fi

api() {
  curl -fsS -H "X-API-Key: ${PORTAINER_TOKEN}" "$@"
}

api_json() {
  curl -fsS -H "X-API-Key: ${PORTAINER_TOKEN}" -H "Content-Type: application/json" "$@"
}

stack_json="$(api "${PORTAINER_URL}/api/stacks")"

stack_id_for() {
  local name="$1"
  echo "${stack_json}" | jq -r ".[] | select(.Name == \"${name}\") | .Id" | head -n 1
}

stack_endpoint_for() {
  local name="$1"
  echo "${stack_json}" | jq -r ".[] | select(.Name == \"${name}\") | .EndpointId" | head -n 1
}

if [ "${REMOTE_BUILD}" = "1" ]; then
  echo "Building image on Portainer endpoint ${PORTAINER_ENDPOINT_ID}: ${IMAGE_NAME}:${IMAGE_TAG}"
  build_context="$(mktemp --suffix=.tar)"
  tar \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='out' \
    --exclude='data' \
    --exclude='*.log' \
    -cf "${build_context}" \
    Dockerfile package.json pnpm-lock.yaml pnpm-workspace.yaml \
    tailwind.config.js postcss.config.js vite.web.config.ts build-server.cjs \
    tsconfig.json tsconfig.web.json tsconfig.web-server.json tsconfig.node.json \
    src web

  curl -fsS -X POST \
    -H "X-API-Key: ${PORTAINER_TOKEN}" \
    -H "Content-Type: application/x-tar" \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/build?t=${IMAGE_NAME}:${IMAGE_TAG}&dockerfile=Dockerfile" \
    --data-binary @"${build_context}" >/tmp/portainer-build.log
  rm -f "${build_context}"
  tail -n 20 /tmp/portainer-build.log || true
fi

new_stack_id="$(stack_id_for "${STACK_NAME}")"
old_stack_id="$(stack_id_for "${OLD_STACK_NAME}")"
old_stack_endpoint="$(stack_endpoint_for "${OLD_STACK_NAME}")"

if [ "${MIGRATE_OLD_STACK}" = "1" ] && [ -n "${old_stack_id}" ] && [ "${OLD_STACK_NAME}" != "${STACK_NAME}" ]; then
  echo "Stopping old stack ${OLD_STACK_NAME} (ID ${old_stack_id})"
  api -X POST "${PORTAINER_URL}/api/stacks/${old_stack_id}/stop?endpointId=${old_stack_endpoint}" >/dev/null || true

  echo "Migrating data volume ${OLD_DATA_VOLUME} -> ${DATA_VOLUME}"
  api_json -X POST \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/volumes/create" \
    -d "{\"Name\":\"${DATA_VOLUME}\"}" >/dev/null || true

  api -X POST \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/images/create?fromImage=alpine&tag=3.20" >/dev/null || true

  migrate_name="gps-spoofer-data-migrate-$(date +%s)"
  create_response="$(api_json -X POST \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/create?name=${migrate_name}" \
    -d "{
      \"Image\":\"alpine:3.20\",
      \"Cmd\":[\"sh\",\"-c\",\"if [ -f /new/pikmin-keep.db ]; then echo 'new volume already has database'; else cp -a /old/. /new/ 2>/dev/null || true; fi\"],
      \"HostConfig\":{
        \"Mounts\":[
          {\"Type\":\"volume\",\"Source\":\"${OLD_DATA_VOLUME}\",\"Target\":\"/old\",\"ReadOnly\":true},
          {\"Type\":\"volume\",\"Source\":\"${DATA_VOLUME}\",\"Target\":\"/new\"}
        ]
      }
    }")"
  migrate_id="$(echo "${create_response}" | jq -r '.Id')"
  api -X POST "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${migrate_id}/start" >/dev/null
  api -X POST "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${migrate_id}/wait" >/dev/null
  api "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${migrate_id}/logs?stdout=1&stderr=1" || true
  api -X DELETE "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${migrate_id}?force=1" >/dev/null || true
fi

api_json -X POST \
  "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/volumes/create" \
  -d "{\"Name\":\"${DATA_VOLUME}\"}" >/dev/null || true

compose_file="$(mktemp --suffix=.yml)"
cat > "${compose_file}" <<EOF
version: '3.8'

services:
  gps-spoofer:
    image: ${IMAGE_NAME}:${IMAGE_TAG}
    container_name: android-adb-gps-spoofer
    restart: unless-stopped
    privileged: true
    ports:
      - "${APP_PORT}:3000"
    volumes:
      - /dev/bus/usb:/dev/bus/usb
      - ${DATA_VOLUME}:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/data
      - APP_VERSION=${IMAGE_TAG}

volumes:
  ${DATA_VOLUME}:
    external: true
EOF

stack_content="$(python3 - <<PY
import json
from pathlib import Path
print(json.dumps(Path("${compose_file}").read_text()))
PY
)"

if [ -z "${new_stack_id}" ]; then
  echo "Creating stack ${STACK_NAME}"
  api_json -X POST \
    "${PORTAINER_URL}/api/stacks/create/standalone/string?endpointId=${PORTAINER_ENDPOINT_ID}" \
    -d "{\"Name\":\"${STACK_NAME}\",\"StackFileContent\":${stack_content},\"Env\":[]}" >/dev/null
  echo "✓ Stack created: ${STACK_NAME}"
else
  echo "Updating stack ${STACK_NAME} (ID ${new_stack_id})"
  api_json -X PUT \
    "${PORTAINER_URL}/api/stacks/${new_stack_id}?endpointId=${PORTAINER_ENDPOINT_ID}" \
    -d "{\"StackFileContent\":${stack_content},\"Env\":[],\"Prune\":false,\"PullImage\":false}" >/dev/null
  echo "✓ Stack updated: ${STACK_NAME}"
fi

rm -f "${compose_file}"

echo ""
echo "=== Deployment Complete ==="
echo "Stack: ${STACK_NAME}"
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Portainer: ${PORTAINER_URL}"
echo "Web interface: http://your-server:${APP_PORT}"
