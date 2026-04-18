# syntax=docker/dockerfile:1.7
# =========================================================
#  coolify-11d — Containerized SSE connector + setup UI
# =========================================================

# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package manifests first for better layer caching
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source
COPY tsconfig.json tsup.config.ts ./
COPY src ./src

RUN npm run build

# Prune dev deps for the runtime stage
RUN npm prune --omit=dev

# ---- Stage 2: Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3111 \
    COOLIFY_BASE_URL="" \
    COOLIFY_TOKEN="" \
    CONNECTOR_AUTH_TOKEN=""

# Run as non-root
RUN addgroup -S coolify && adduser -S -G coolify coolify

COPY --from=builder --chown=coolify:coolify /app/dist         ./dist
COPY --from=builder --chown=coolify:coolify /app/node_modules ./node_modules
COPY --from=builder --chown=coolify:coolify /app/package.json ./package.json

USER coolify

EXPOSE 3111

# Healthcheck: connector exposes /api/status
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/status" || exit 1

CMD ["node", "dist/connector/server.js"]
