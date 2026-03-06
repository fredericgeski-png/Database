# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache wget && \
    addgroup -g 1001 -S kinetic && \
    adduser -S kinetic -u 1001 -G kinetic

WORKDIR /app

# Copy only what's needed
COPY --from=builder --chown=kinetic:kinetic /app/node_modules ./node_modules
COPY --from=builder --chown=kinetic:kinetic /app/dist         ./dist
COPY --from=builder --chown=kinetic:kinetic /app/package.json ./package.json

USER kinetic

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server/index.js"]
