# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

WORKDIR /app

# Copy package files first (cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install ALL dependencies (dev + prod) for build
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY src/ src/
COPY web/ web/
COPY tailwind.config.js postcss.config.js vite.web.config.ts build-server.cjs ./

# Build server (esbuild → dist/server/index.js)
RUN node build-server.cjs

# Build client (Vite → dist/client/)
RUN npx vite build --config vite.web.config.ts

# ── Stage 2: Production runtime ───────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache android-tools && npm install -g pnpm

WORKDIR /app

# Copy only production deps manifest
COPY web/package.json ./package.json
COPY pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --no-frozen-lockfile

# Copy built artefacts from builder
COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/dist/client ./dist/client

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
