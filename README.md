# Keystone

AI-powered career companion. Track applications, discover opportunities, and ace your interviews, all in one place.

## Features

- Job application tracking with status management
- AI-powered job research using a locally-spawned OpenCode server
- Real-time streaming UI with sub-agent activity tracking
- Resume upload and skill extraction
- Deduplication of job listings
- Browser extension for quick job saving

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Server Actions, Prisma ORM
- **Database**: PostgreSQL (Neon)
- **AI**: OpenCode server spawned in-process via `@opencode-ai/sdk` (needs the `opencode` binary on PATH)

## Getting Started

Requirements: [Bun](https://bun.sh) ≥ 1.2, Node ≥ 20.9, an `opencode` binary for research runs.

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and BETTER_AUTH_SECRET
# (BETTER_AUTH_SECRET is required in production; generate with:
#   openssl rand -base64 32)

# Generate Prisma client
bun run gen

# Apply migrations
bun run mig        # dev: creates/applies migrations
# bun run migrate-deploy   # CI/prod: applies existing migrations only

# Run development server
bun run dev
```

Open [http://localhost:5421](http://localhost:5421) to view the app.

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Next dev server on port 5421 |
| `bun run build` | `prisma generate && next build` |
| `bun run start` | Production server |
| `bun run lint` | Biome check |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Bun test suite (`tests/`) |
| `bun run gen` / `bun run mig` / `bun run migrate-deploy` / `bun run push` | Prisma client / migrations / db push |
| `bun run scripts/create-user.ts --email <email>` | Create a bare User row (dev/import seeding, not loginable) |
| `bun run scripts/import-to-db.ts --user <id\|email> --file data/imported-jobs.json [--dry-run]` | Import job listings with schema validation + dedupe |

## Docker Deployment (Oracle VM)

The image builds the app, installs the `opencode` binary, and on boot applies
`prisma migrate deploy` (via a minimal pinned Prisma CLI in `/migrator`)
before starting the traced standalone server (`.next/standalone/server.js`).
The app then spawns its own OpenCode server on `127.0.0.1:3211`
(`OPENCODE_PORT` overrides) inside the same container — no separate service
required. A `HEALTHCHECK` probes `/` every 30s; compose caps restarts at 5
(`on-failure:5`) so a broken deploy stops instead of restart-looping.

```bash
cp .env.example .env          # fill in real values — BETTER_AUTH_URL must be
                              # the public origin, not localhost
docker compose up -d --build  # builds and starts on 127.0.0.1:3000
docker compose logs -f        # watch boot/migration logs
```

Startup aborts in production if `DATABASE_URL`, `BETTER_AUTH_SECRET` or
`BETTER_AUTH_URL` are missing/placeholders or if `BETTER_AUTH_URL` is a
loopback origin (see `instrumentation.ts`).

Notes for a VM behind a reverse proxy (Caddy/Nginx):

- Compose publishes `127.0.0.1:3000` only. Terminate TLS at the proxy; the
  container serves plain HTTP on loopback. Do not re-publish 0.0.0.0.
- Disable response buffering and raise the idle/read timeout for
  `/api/research/stream` — it is a Server-Sent-Events endpoint and streaming
  responses die silently through default proxy buffering.
- `uploads/` persists as a named volume. The spawned OpenCode server gets a
  minimal allowlisted environment (provider `*_API_KEY`s, `OPENCODE_*`,
  essentials like PATH/HOME) — it does NOT see `DATABASE_URL`,
  `APPLY_AGENT_TOKEN` or `BETTER_AUTH_SECRET`. The server password is kept in
  memory only, never written to disk.
- Model provider credentials used by OpenCode (e.g. provider API keys) live in
  OpenCode's own config — set `OPENCODE_SERVER_PASSWORD` in `.env` if you want
  the spawned server's API locked behind Basic auth. `*_API_KEY` variables in
  `.env` are passed through to it automatically.

PII note: resumes are stored twice — the PDF under `uploads/` (named volume)
and extracted text in the Postgres `Resume.content` column. Database backups
therefore contain full resume text. Treat DB dumps as PII and encrypt them at
rest.
