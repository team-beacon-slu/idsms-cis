# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f deploy/Dockerfile -t idsms-cis .

# ---- deps: clean, reproducible install. Scripts are skipped because
# postinstall (prisma generate) needs the schema, which is copied later.
FROM node:24-alpine3.22 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# ---- builder: generate the Prisma client, then a standalone Next.js build.
FROM node:24-alpine3.22 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    STORAGE_DRIVER=s3 \
    NEXTAUTH_SECRET=build-placeholder \
    NEXTAUTH_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_URL=postgresql://build:build@localhost:5432/build \
    STUDENT_DEFAULT_PASSWORD_PEPPER=build-placeholder-pepper-value-32bytes
# Placeholders only satisfy imports during the build; real values come from
# .env.production at run time.
RUN npx prisma generate && npm run build && mkdir -p public

# ---- runner: the standalone server as a non-root user, plus Alpine's
# Chromium for server-side PDFs (the bundled one in @sparticuz/chromium is
# built for Amazon Linux, not Alpine).
FROM node:24-alpine3.22 AS runner
WORKDIR /app
# font-liberation is metric-compatible with the Arial/Helvetica the PDF templates use.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont font-liberation \
 && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DRIVER=s3 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_ARGS="--no-sandbox --disable-dev-shm-usage"
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
