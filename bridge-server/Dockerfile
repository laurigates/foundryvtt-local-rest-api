# Node 24 is Active LTS (EOL 2028-04-30); CI tests 22.x and 24.x.
FROM node:24-alpine AS deps

WORKDIR /app

# Production dependencies only; the cache mount keeps rebuilds fast
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

FROM node:24-alpine

LABEL org.opencontainers.image.source="https://github.com/laurigates/foundryvtt-local-rest-api" \
      org.opencontainers.image.description="Local REST API bridge server for FoundryVTT" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production

WORKDIR /app

# Application files and dependencies, owned by the unprivileged `node` user
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Data directory for configuration
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3030/api/status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
