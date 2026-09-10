# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ && npm install -g pnpm@10.15.0

WORKDIR /app

# Copy package files first (cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./

# Install ALL dependencies (dev + prod) for build
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile

# Copy source
COPY src/ src/
COPY web/ web/
COPY tailwind.config.js postcss.config.js vite.web.config.ts build-server.cjs ./

# Build server (esbuild → dist/server/index.js)
RUN node build-server.cjs

# Build client (Vite → dist/client/)
RUN npx vite build --config vite.web.config.ts

# ── Stage 2: Native production dependencies ─────────────────────────────────
FROM node:20-alpine AS production-deps

RUN apk add --no-cache python3 make g++ && npm install -g pnpm@10.15.0
WORKDIR /app
COPY web/package.json ./package.json
COPY pnpm-lock.yaml .pnpmfile.cjs ./
RUN pnpm install --prod --no-frozen-lockfile
# Verify the native module in the same Node/libc environment as the runtime.
RUN node -e "const DB = require('better-sqlite3'); const db = new DB(':memory:'); db.prepare('SELECT 1').get(); db.close()"

# ── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache android-tools
WORKDIR /app
COPY web/package.json ./package.json
COPY --from=production-deps /app/node_modules ./node_modules

# Copy built artefacts from builder
COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/dist/client ./dist/client

# Build-time version injection
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
