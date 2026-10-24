# syntax=docker/dockerfile:1

# ── deps: install node_modules once ─────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# ignore-scripts keeps sharp/unrs-resolver postinstalls out; trustedDependencies
# in package.json whitelists the two that must run.
RUN bun install --frozen-lockfile

# ── builder: prisma client + next build ─────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time dummy values: no DB is reachable during docker build, and
# better-auth only validates BETTER_AUTH_SECRET at request time in production.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# Generate the prisma client into app/ before next build imports it.
RUN bunx prisma generate
RUN bun run build

# ── runner: runtime image ───────────────────────────────────────────────────
# The opencode binary must be present: the app spawns its own OpenCode server
# on 127.0.0.1:3211 via createOpencodeServer() at first research request.
FROM oven/bun:1-slim AS opencode
ARG OPENCODE_VERSION=latest
#oven/bun ships without curl; the installer and release download both need it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*
# v2 installer (opencode.ai/install only ships OpenCode 1; the app's SDK
# targets the 2.x server API).
RUN curl -fsSL https://opencode.ai/v2/install | bash \
  && test -x /root/.opencode/bin/opencode

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=opencode /root/.opencode/bin/opencode /usr/local/bin/opencode

# Full node_modules: prisma CLI is needed for `prisma migrate deploy` at boot.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Resumes are written to ./uploads — mount a volume here to persist them.
RUN mkdir -p /app/uploads /tmp/opencode

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "start"]
