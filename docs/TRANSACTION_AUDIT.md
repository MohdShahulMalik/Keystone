# Transaction audit

No write path in this codebase needs `$transaction` today. Each multi-step flow below was checked; every one is either cross-system, retry-safe, or deliberately best-effort.

## Multi-step flows and why each is fine without one

### `app/actions/research.ts:60-98` (startResearch)

Creates the remote OpenCode session, then the DB session row, then sends the prompt. A transaction cannot span the external OpenCode API call, so it could never make this flow atomic anyway. The existing manual compensation, deleting the remote session when the DB insert fails, is already the correct pattern for cross-system work.

### `app/actions/jobs.ts:139-182` (bulkCreateJobsFromResearch)

User upsert, then read-for-dedup, then `createMany`. A transaction would not fix the real hazard here, the check-then-insert race between two concurrent streams. The correct tool for that is a unique constraint on `(userId, title, company, url)`, not a transaction. Partial failure is retry-safe since the upsert is idempotent and the dedup check re-runs.

### `app/api/research/stream/route.ts:32-44` (completeSearchSession)

Counts results, then marks the session completed. Retry just recomputes the same values, and double completion writes identical terminal state. Idempotent, no transaction needed.

### `app/api/research/stream/route.ts:73-127` (persist / persistToolUpdate)

Single creates and update-or-create fallbacks on a hot streaming path, each segment independent. Wrapping these would add latency per SSE event for zero consistency gain. Deliberately best-effort is right.

### `lib/research/stream.ts:548-631` (subagent session lifecycle)

Upsert at start, update at completion of one row at different points in time, not a unit of work. No.

### Single-statement writes

`resumes.ts`, `status.ts`, `import-to-db.ts` batches, and both `createMany` calls. Each is already atomic by itself.

## When that changes

Reach for `$transaction` if a future change writes two dependent rows in one go, for example inserting jobs while incrementing a session `resultCount` in the same step. Note the adapter implication: the HTTP Neon adapter rejects the transaction path, so the day a transaction becomes genuinely needed is the day to reconsider the `PrismaNeonHttp` switch. Until then the switch stays safe.
