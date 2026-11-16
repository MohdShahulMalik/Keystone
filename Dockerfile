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
# Build-time dummy values: no DB is reachable during docker build. Runtime
# env validation lives in instrumentation.ts and runs at server boot instead.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# Generate the prisma client into app/ before next build imports it.
RUN bunx prisma generate
RUN bun run build

# ── migrator: minimal pinned prisma CLI for `migrate deploy` at boot ────────
# Standalone output ships no prisma CLI, so we install just the CLI (matching
# the app's prisma version) with its own tiny node_modules. Its config lives
# here too (migrator.prisma.config.ts) so it doesn't depend on resolving
# packages from /app.
FROM oven/bun:1 AS migrator
WORKDIR /migrator
RUN bun add prisma@7.9.0
COPY migrator.prisma.config.ts /migrator/prisma.config.ts
COPY prisma /app/prisma

# ── runner: opencode binary + traced standalone server ───────────────────────
# The opencode binary must be present: the app spawns its own OpenCode server
# on 127.0.0.1:3211 (override with OPENCODE_PORT) at first research request.
FROM oven/bun:1-slim AS opencode
ARG OPENCODE_VERSION=2.3.0
#oven/bun ships without curl; the installer and release download both need it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*
# v2 installer (opencode.ai/install only ships OpenCode 1; the app's SDK
# targets the 2.x server API). OPENCODE_VERSION pins the binary so the
# server CLI output can't drift underneath us in a rebuild.
RUN curl -fsSL https://opencode.ai/v2/install | bash -s -- --version "$OPENCODE_VERSION" \
  && test -x /root/.opencode/bin/opencode

# oven/bun:1 (not slim) for the runner: the prisma schema engine needs OpenSSL
# and friends that slim images don't carry. node_modules from the app itself
# is gone — the traced standalone output replaces it.
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=opencode /root/.opencode/bin/opencode /usr/local/bin/opencode

# Traced minimal server (node_modules subset included) + static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Schema + migrations + the self-contained migrator.
COPY --from=builder /app/prisma ./prisma
COPY --from=migrator /migrator /migrator

# Resumes are written to ./uploads — mount a volume here to persist them.
RUN mkdir -p /app/uploads

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "server.js"]
