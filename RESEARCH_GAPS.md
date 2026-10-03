# Research resume gaps

Tracked follow-ups for hydrate-then-tail (`ResearchClient` + `useResearchStream`).

## 1. Sidebar never highlights active session
- File: `app/research/[mode]/page.tsx:24`
- `activeSessionId={undefined}` is hardcoded.
- Fix: read `searchParams.sessionId` in the page and pass it through to `ResearchSessionSidebar`.
- Effect if skipped: navigation works, but no active highlight.

## 2. Subagent reload is broken
- Files: `hooks/useResearchStream.ts:71`, `prisma/models/search.prisma` (`SubagentSession`, `SubagentSegment`), `app/actions/search.ts`
- Live view renders subagent links as `/research/job?sessionId=<childId>`, but the client only looks up `SearchSession` via `getSearchSessionByAnyId`. Child ids live in `SubagentSession`, so clicks land on the "Session not found" form.
- Fix: add `getSubagentHistory(childId)` (subagent row + ordered `SubagentSegment`s) and either a dedicated subagent view/route or a branch in `ResearchClient` that renders subagent history when the id resolves to a child.
- Effect if skipped: parent resume works, subagent drill-down does not survive reload.

## 3. Reload shows no preferences and "Untitled session"
- Files: `app/actions/research.ts` (`startResearch`), `app/research/component/ResearchClient.tsx` (prefs box), `app/actions/search.ts` (`getSearchSessionsWithMetaData`)
- `startResearch` persists `query/status/openCodeSessionId` but not the `preferences` JSON, so `userPreferences` (memory-only) is empty after reload and Model/JobTypes/Countries can't render.
- `SearchSession.title` is never set on create, so the sidebar falls back to "Untitled session". `resultCount` only updates in `completeSearchSession` on stream completion — verify it ran for older rows.
- Fix: save `preferences` JSON on create and render prefs/title from DB when `userPreferences` is null; backfill or generate titles for existing rows.
- Effect if skipped: history body loads, but context header stays empty.

## Lint (pre-existing, still failing)
- `bun run lint` exits non-zero on issues that predate this change:
  - `hooks/useResearchStream.ts`: unused `name`, `title`, `prefix`
  - `app/research/component/ResearchClient.tsx`: import order, skeleton `key={i}`
- The new seed-effect exhaustive-deps warning is already suppressed via `biome-ignore` (seed by length on purpose).
