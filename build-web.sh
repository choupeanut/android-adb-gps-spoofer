#!/bin/bash
set -euo pipefail

echo "=== Building Web Version ==="

# Load deployment config (optional; local-first)
if [ -f .env.deploy.local ]; then
  source .env.deploy.local
elif [ -f .env.deploy ]; then
  source .env.deploy
fi

# Configuration
IMAGE_NAME="android-adb-gps-spoofer"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building Docker image: ${FULL_IMAGE}"

# Build the Docker image
docker build -t "${FULL_IMAGE}" .

echo "✓ Docker image built successfully: ${FULL_IMAGE}"

# Tag with timestamp for versioning
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker tag "${FULL_IMAGE}" "${IMAGE_NAME}:${TIMESTAMP}"
echo "✓ Tagged as: ${IMAGE_NAME}:${TIMESTAMP}"

# Save image to tar (optional, for manual transfer)
echo "Saving image to tar file..."
mkdir -p dist/docker
docker save "${FULL_IMAGE}" -o "dist/docker/${IMAGE_NAME}-${IMAGE_TAG}.tar"
echo "✓ Image saved to: dist/docker/${IMAGE_NAME}-${IMAGE_TAG}.tar"

echo ""
echo "=== Build Complete ==="
echo "Image: ${FULL_IMAGE}"
echo "Backup: dist/docker/${IMAGE_NAME}-${IMAGE_TAG}.tar"
echo ""
echo "Next steps:"
echo "1. For Portainer deployment: ./deploy-portainer.sh"
echo "2. For manual deployment: docker load < dist/docker/${IMAGE_NAME}-${IMAGE_TAG}.tar"
