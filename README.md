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
`prisma migrate deploy` before starting `next start`. The app then spawns its
own OpenCode server on `127.0.0.1:3211` inside the same container — no
separate service required.

```bash
cp .env.example .env          # fill in real values
docker compose up -d --build  # builds and starts on port 3000
docker compose logs -f        # watch boot/migration logs
```

Notes for a VM behind a reverse proxy (Caddy/Nginx):

- Terminate TLS at the proxy; the container serves plain HTTP on 3000.
- Disable response buffering and raise the idle/read timeout for
  `/api/research/stream` — it is a Server-Sent-Events endpoint and streaming
  responses die silently through default proxy buffering.
- Mount nothing by hand: docker-compose already persists `uploads/` (resumes)
  and `/tmp/opencode` (server auth state) as named volumes.
- Model provider credentials used by OpenCode (e.g. provider API keys) live in
  OpenCode's own config — set `OPENCODE_SERVER_PASSWORD` in `.env` if you want
  the spawned server's API locked behind Basic auth.
