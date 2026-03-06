# ── Single-stage — no build step needed ──────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache wget && \
    addgroup -g 1001 -S kinetic && \
    adduser -S kinetic -u 1001 -G kinetic

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY --chown=kinetic:kinetic server.js   ./server.js
COPY --chown=kinetic:kinetic init.sql    ./init.sql
COPY --chown=kinetic:kinetic .env.example ./.env.example

USER kinetic

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
