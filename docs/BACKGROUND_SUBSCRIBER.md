# Background subscriber (singleton event hub)

## Problem in plain language

Today, research progress is saved to the database only while the
research page is open.

- Opening `/research/job?sessionId=...` opens a live connection
  (`GET app/api/research/stream/route.ts`).
- That request subscribes to the opencode event stream
  (`subscribeToEvents()` in `lib/opencode/server.ts:234`) and runs all
  the `persist` logic (`route.ts:73-152`, `lib/research/stream.ts`).
- The page also keeps a live tail in browser memory
  (`hooks/useResearchStream.ts`: segments, subagent transcripts, jobs).
- Close the tab or navigate away: the connection closes, saving stops,
  memory is wiped. Anything not yet committed to the DB is gone.
- Reconnecting rebuilds all per-connection state (`seq`, buffers)
  from zero, so it can collide on `@@unique([sessionId, seq])` and
  silently drop rows.

Analogy: every viewer takes their own notes, so an empty room means
no notes. We want one dedicated note-taker that always sits in the
room, while viewers just read copies.

## Goal

One always-on server-side subscriber that persists every session's
events to the DB whether or not any browser tab is open. The SSE
route becomes replay + live fan-out. Closing and reopening a session
loses nothing beyond ~100ms.

## Non-goals

- Multi-instance hosting (would need Redis for shared state).
- Serverless production (background loops freeze after the response;
  this design assumes one long-lived `next dev` / `next start`
  process plus the local opencode server at `127.0.0.1:3211`).

## Current architecture

| Piece | File | Role |
|---|---|---|
| Event source | `lib/opencode/server.ts:234-238` | `client.event.subscribe()` global stream |
| Per-connection ctx + persist | `app/api/research/stream/route.ts:54-152` | `seq`, `openSegments`, `persist`, `persistToolUpdate` |
| Segment coalescing, jobs | `lib/research/stream.ts` | `commitOpenSegment`, `handleTool*`, job buffers |
| Live state (memory only) | `hooks/useResearchStream.ts:109-191,670-686` | `useState` segments/jobs/subagents, `EventSource` cleanup |
| History seed | `app/actions/search.ts:77-97` | `getSearchSessionHistory()` |
| Session start | `app/actions/research.ts:40-140` | create opencode session, create DB row, fire prompt |

## Proposed architecture

```
opencode server (event stream)
        |
        v
event-hub (singleton, one subscription)
  |-- persist to DB (ResearchSegment / SubagentSegment /
  |                  SearchResult / JobListing)
  |-- keep per-session live buffers in memory
  |
  +-- SSE route (many readers): replay missed rows + forward live
  +-- browser: render only, no aggregation ownership
```

New module: `lib/research/event-hub.ts`.

- `globalThis` guard (`started`, `starting: Promise`, `sessions`,
  `listeners`) — same pattern as `lib/opencode/client.ts` and
  `lib/db.ts`. Prevents double loops under HMR.
- `ensureStarted()`: exactly one `subscribeToEvents()` loop with
  reconnect backoff if the opencode server restarts.
- `register(dbSessionId, openCodeSessionId, userId)`: build ctx via
  extracted `createStreamCtx()`, hydrate `seq` from
  `MAX(seq)` in `ResearchSegment` / `SubagentSegment` and
  `jobSeq` / `emittedJobKeys` from existing rows.
- `subscribe(dbSessionId, send) / unsubscribe()`: SSE routes attach
  here instead of subscribing themselves.
- Boot resume: on first start, `findMany(searchSession where
  status = 'running')` and register each.

## Implementation steps

### 1. Extract ctx creation from the route

Move `route.ts:54-152` (`StreamCtx` init + `persist` /
`persistToolUpdate` closures) into `lib/research/stream.ts` as
`createStreamCtx(openCodeSessionId, dbSessionId, userId, send)`.
No logic change, pure move so both hub and route can use it.

### 2. Create `lib/research/event-hub.ts`

- `ensureStarted()`: if `started` return; if `starting` await it;
  else open `subscribeToEvents()`, loop events through the existing
  handlers (`handlePartDelta`, `handlePartUpdated`, `flush`,
  `flushPendingJobs`, `flushJobPersistQueue`, `completeSearchSession`).
- Per-event routing stays by `sessionID` as today
  (`stream.ts:480-496,797-820`).
- Fan-out: after each `ctx.send(...)`, also call every registered
  `listener` for that session.
- Reconnect: on stream end/error, sleep with backoff
  (e.g. 1s, 2s, 5s), resubscribe, re-register running sessions.

### 3. Register on session start

In `app/actions/research.ts` after `db.searchSession.create` and
`sendResearchPrompt`, call `hub.register()` fire-and-forget
(catch and log only — never fail the action if the hub is busy).
Also call `ensureStarted()` lazily here so the very first research
boots the hub with no page open.

### 4. Thin out the SSE route

`app/api/research/stream/route.ts` `GET`:

1. Resolve `dbSessionId / openCodeSessionId / userId` (keep `:47-52`).
2. Accept `?sinceSeq=`; query missed `ResearchSegment` /
   `SubagentSegment` / `SearchResult` rows and emit them first as
   `chunk / subagent.chunk / job` events (replay).
3. `hub.subscribe(dbSessionId, controllerSend)` then keep the
   connection open for live fan-out only. Remove direct
   `subscribeToEvents()`, per-connection `ctx`, and the 100ms
   `flush` interval.
4. Keep `completeSearchSession` but make it idempotent (hub also
   calls it on `message.updated` / `session.idle`).

### 5. Hook becomes a dumb renderer

`hooks/useResearchStream.ts`:

- Keep `EventSource` wiring, display formatting (`toTitleCase`,
  `∴` links, `✓/✗`), and client-side dedup as a safety net.
- Add `sinceSeq` (max seen seq) as a query param so reconnects get
  replay instead of relying on memory.
- Remove ownership of seq allocation and transcript assembly —
  server is now the authority.

### 6. Boot without `instrumentation.ts`

No `instrumentation.ts` exists in the repo, so lazy-start from both
entry points (`startResearch` action, first SSE `GET`) via
`ensureStarted()`. This covers dev and HMR with no extra config.

## Correctness notes

- **Seq collisions (must fix):** init from DB `MAX(seq)`, never `0`
  on a resumed session. The existing `@@unique([sessionId, seq])`
  plus the update-fallback in `persistToolUpdate` then act as a
  real idempotency guard instead of a gap source.
- **Jobs:** `SearchResult.create` per job plus
  `bulkCreateJobsFromResearch` (`jobs.ts:162-188`) already dedup
  against the DB — keep both, seed `emittedJobKeys` from existing
  rows on register.
- **Write pressure:** keep commit-on-boundary persistence first;
  escalate to debounced per-flush upserts (~500ms) only if reload
  gaps remain. Neon HTTP latency is the cost to watch.
- **Memory:** drop dead `send` callbacks on `controller.close()`;
  cap listeners per session.
- **Failure modes:** opencode restart → backoff resubscribe;
  DB error → log with session/seq context, re-queue jobs
  (existing `flushJobPersistQueue` retry already does this).

## Verification

1. Start research, close the tab mid-run.
2. `select count(*) from "ResearchSegment"` keeps growing with no
   browser open.
3. Reopen `?sessionId=<dbId>`: full transcript + jobs present, no
   gap between pre-close tail and post-reopen head.
4. Two tabs on the same session show identical content.
5. Dev-server restart with a `running` session resumes persisting
   after boot.

## If this later moves to serverless

Replace the in-process hub with a dedicated `bun worker.ts`
process (same `subscribeToEvents` + `createStreamCtx` code) managed
by systemd/pm2/docker, or poll via the existing
`getSessionMessages / getSessionChildren` (`server.ts:220-232`)
on a cron. The SSE route stays unchanged (replay + fan-out).
