# Research resume gaps

Tracked follow-ups for hydrate-then-tail (`ResearchClient` + `useResearchStream`).

## Resolved (was on this list)

1. **Sidebar highlights the active session** — `app/(protected)/research/[mode]/page.tsx`
   now reads `searchParams.sessionId` and passes it through as `activeSessionId`.
2. **Subagent reload works** — `getSubagentHistory` (`app/actions/search.ts`) resolves
   child ids via `SubagentSession`/`SubagentSegment`, and `SubagentView` renders that
   history when an id resolves to a child instead of the parent form.
3. **Reloading shows preferences and the session title** — `startResearch` persists
   the `preferences` JSON, `title`, and `resultCount` on `SearchSession` creation; the
   client hydrates them from the DB before the live stream attaches.

## Open items (INTENT tests)

The seeded `INTENT (FAILS now)` tests document capabilities that are still NOT
implemented. Current red set (16) after the pre-ship fixes:

- Model discovery has no bounded timeout (`getAvailableModelsAction` can block
  on a hung OpenCode server).
- Job-persist flush has unbounded retries (infinite requeue during an outage)
  and terminal handlers still report success when the persist fails.
- Background prompt-send failures are not surfaced to the caller reliably
  (`sendResearchPromptWithRetry` swallows via `.catch`).
- `db-create` compensation failures can mask the original error.

These live in `tests/unit/stream-flush-repro.test.ts`,
`tests/integration/research-dbcreate-error.repro.test.ts`,
`tests/integration/stream-route.test.ts`, and `tests/integration/*.repro.test.ts`.
