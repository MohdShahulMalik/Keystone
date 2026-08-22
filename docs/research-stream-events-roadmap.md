# Research Stream Events — Implementation Roadmap

Goal: surface **tool call activity** (started / completed / failed), **subagent spawns**, and
**clickable subagent drill-down** in the research UI, by extending the SSE pipeline that runs:

```
opencode server  →  lib/opencode/server.ts  →  app/api/research/stream/route.ts (SSE)
                 →  hooks/useResearchStream.ts  →  UI components
```

All findings below are verified against the installed SDK (`@opencode-ai/sdk@1.18.13`,
`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`) and opencode docs/GitHub issues.

---

## 1. Key research findings

### 1.1 There is no dedicated "tool call" event

Tool activity arrives through the same `message.part.updated` event you already handle.
The difference is the part's `type`. Today the route only reads `event.properties.delta`
(text deltas) and silently drops everything else.

A tool call looks like this (`ToolPart`, types.gen.d.ts:263):

```ts
{
  type: "tool",
  id: "prt_...",          // stable across the whole lifecycle — use as the UI key
  sessionID: "ses_...",
  messageID: "msg_...",
  callID: "...",
  tool: "bash" | "grep" | "task" | ...,
  state: ToolState,
}
```

### 1.2 Tool lifecycle is encoded in `part.state.status`

opencode re-emits `message.part.updated` for the **same `part.id`** every time state changes:

| status      | fields available                                   | UI meaning            |
|-------------|----------------------------------------------------|-----------------------|
| `pending`   | `input`, `raw`                                     | args streaming/parsed |
| `running`   | `input`, `title?`, `metadata?`, `time.start`       | executing now         |
| `completed` | `output`, `title`, `metadata`, `time.{start,end}`  | done                  |
| `error`     | `error`, `metadata?`, `time.{start,end}`           | failed                |

- **"Started"** = first event where `part.type === "tool"` && `state.status === "running"`
- **"Completed"** = same `part.id` arriving later with `status === "completed"`
- `state.title` is a human-readable summary opencode generates per tool
  (e.g. the bash command, the grep pattern) — ideal for one-line display.
- Truncate `state.output` before sending to the client; it can be enormous.

### 1.3 Subagents = child sessions linked via task-tool metadata

When the agent invokes the Task/subagent tool, opencode creates a **child session**.

- The parent's `tool` part (tool name `task`) carries `state.metadata.sessionId`
  pointing at the child session (see GitHub issue anomalyco/opencode#22348).
  Its `state.input` has `{ description, prompt, subagentType }`-style fields.
- **All child-session events flow through the same global event stream**, tagged with the
  *child's* `sessionID`. Our route currently filters them out because it only matches the
  parent `sessionId`.
- For historical drill-down, the SDK exposes:
  - `client.session.children({ path: { id } })` — list child sessions
  - `client.session.messages({ path: { id } })` — full message + parts history

### 1.4 Caveats from real-world issues

- **#22348**: if a task is aborted/interrupted, the parent task part may finish *without*
  `metadata.sessionId` even though the child exists. Mitigation: when a `task` part completes
  without metadata, fall back to diffing `session.children()` against known children.
- The global event stream is **volatile** (no replay). If the SSE connection drops, events
  during the gap are lost. For reconnect resilience, hydrate from `session.messages()` on
  mount instead of relying only on live events.

### 1.5 Thinking/reasoning traces

Reasoning arrives through the **same `message.part.updated` event** as its own part type
(`ReasoningPart`, types.gen.d.ts:158):

```ts
{
  type: "reasoning",
  id: "prt_...",          // stable per thinking block
  sessionID: "ses_...",
  messageID: "msg_...",
  text: "...",            // accumulated so far
  time: { start, end? },  // end is set when the block finishes
}
```

- Behaves exactly like text parts: repeated emissions carry `event.properties.delta`
  with the incremental text. Same buffering pattern as the existing `chunk` logic.
- Block completion = a later emission where `time.end` is set (or the assistant
  message completing).
- **Model-dependent**: only models with reasoning output (Anthropic extended-thinking,
  DeepSeek-R1-style, etc.) emit these parts. The UI must treat them as optional and
  render nothing when none arrive.
- Keep traces visually separated from the answer (collapsible, muted styling) — never
  append them to `mainText`. Consider truncating long traces in the collapsed preview.

### 1.6 Other free wins in the same event union

- `session.idle` — most reliable "turn finished" signal (properties: `{ sessionID }`)
- `permission.updated` — a tool needs approval (`title`, `callID`, `sessionID`)
- `step-finish` parts — per-step token usage and cost (`cost`, `tokens`)

---

## 2. Target SSE protocol

New/changed events emitted by `app/api/research/stream/route.ts`:

| Event              | Payload                                                                 |
|--------------------|-------------------------------------------------------------------------|
| `chunk`            | *(existing)* `{ text }` — parent text deltas                            |
| `message.completed`| *(existing)* `{ messageId }`                                            |
| `status`           | *(existing)* `{ status }`                                               |
| `error` / `done`   | *(existing)*                                                            |
| `tool.started`     | `{ id, tool, title?, sessionId? }`                                      |
| `tool.completed`   | `{ id, tool, title, durationMs, outputPreview }`                        |
| `tool.error`       | `{ id, tool, error, durationMs? }`                                      |
| `subagent.started` | `{ id, childSessionId, description, agent? }`                           |
| `subagent.chunk`   | `{ id, childSessionId, text }` — live text from inside the subagent     |
| `thinking`         | `{ text, done }` — reasoning deltas; `done: true` when block completes  |

Notes:
- `sessionId?` on tool events distinguishes parent tools from tools running *inside* a
  subagent (nested display).
- `id` is always the `ToolPart.id`, so the frontend can upsert state keyed on it.
- Keep `delta`-based buffering for `text` **and** `reasoning` parts (separate buffers);
  everything else forwards immediately.

---

## 3. Implementation steps

### Step 1 — `lib/opencode/server.ts`: add query helpers (~10 min)

Add two thin wrappers next to the existing functions (needed for click-through and hydration):

```ts
export async function getSessionMessages(sessionId: string) {
  const client = await getOpencodeClient();
  return (await client.session.messages({ path: { id: sessionId } })).data;
}

export async function getSessionChildren(sessionId: string) {
  const client = await getOpencodeClient();
  return (await client.session.children({ path: { id: sessionId } })).data;
}
```

### Step 2 — rewrite the switch in `app/api/research/stream/route.ts` (~45 min)

Inside `for await (const event of eventsStream)`:

1. Add module-level tracking state in `start()`:
   ```ts
   const childSessions = new Map<string, string>(); // childSessionID -> taskPartID
   ```
2. Replace the `message.part.updated` case:
   - Destructure `{ part, delta }`.
   - Compute `isChild = childSessions.has(part.sessionID)`; skip if neither the parent
     session nor a tracked child.
   - `part.type === "text"`:
     - parent + delta → existing `chunkBuffer += delta`
     - child + delta → emit `subagent.chunk`
   - `part.type === "reasoning"`:
     - parent + delta → append to a `thinkingBuffer` and emit `thinking` events through
       the same throttled interval as `chunkBuffer` (second buffer, same pattern);
       when the part arrives with `time.end` set, emit one final `thinking` event with
       `done: true` (and flush remaining buffer)
   - `part.type === "tool"` → switch on `part.state.status`:
     - `running` → emit `tool.started`; if `part.tool === "task"` and
       `typeof part.state.metadata?.sessionId === "string"` → register child,
       emit `subagent.started` (description from `part.state.input`)
     - `completed` → emit `tool.completed` with
       `durationMs: time.end - time.start` and `outputPreview: output.slice(0, 2000)`
     - `error` → emit `tool.error`
   - Fallback for caveat #22348: when a parent `task` part completes without
     `metadata.sessionId`, optionally diff `getSessionChildren(sessionId)` once.
3. Optionally add `case "session.idle"` to send a final `status: idle` event
   (more reliable than inferring completion from `message.time.completed`).

### Step 3 — new route `app/api/research/messages/route.ts` (~30 min)

GET endpoint taking `?sessionId=` that calls `getSessionMessages()` and returns a slimmed
shape for the drill-down view (never forward raw outputs unbounded):

```jsonc
[
  {
    "role": "assistant",
    "parts": [
      { "type": "reasoning", "textPreview": "...", "durationMs": 4200 },
      { "type": "text", "text": "..." },
      { "type": "tool", "tool": "grep", "status": "completed", "title": "...", "outputPreview": "..." }
    ]
  }
]
```

Include reasoning blocks so hydrated traces survive refreshes/reconnects (truncate
`textPreview`, e.g. 2000 chars).

### Step 4 — extend `hooks/useResearchStream.ts` (~1 h)

Keep the existing text/status handling and add structured activity state:

```ts
export type ActivityItem =
  | { kind: "tool"; id: string; name: string; title?: string;
      status: "running" | "done" | "error"; durationMs?: number; preview?: string;
      childSessionId?: string }
  | { kind: "subagent"; id: string; childSessionId: string; label: string;
      status: "running" | "done"; chunks: string[] };

export interface ResearchSession {
  /* existing fields */
  activity: ActivityItem[];
  thinking: string;      // accumulated reasoning trace
  thinkingDone: boolean;
}
```

- New listeners: `tool.started` (upsert running item), `tool.completed` /
  `tool.error` (flip status by `id`), `subagent.started` (append subagent item),
  `subagent.chunk` (append text into matching subagent's `chunks`),
  `thinking` (append to `thinking`; set `thinkingDone` when `done === true`).
- Use an accumulator keyed by `id` inside `setState` so out-of-order events can't
  create duplicates.
- On `done`, mark any still-`running` items as `done` defensively (volatile stream).

### Step 5 — new component `app/research/component/activity-feed.tsx` (~2–3 h)

Renders `activity` under/above the streaming text:

- **Thinking block** (from `stream.thinking`): collapsible panel above the answer —
  muted/italic styling, "Thinking…" header with a pulse while `thinkingDone === false`,
  auto-collapsed by default (expandable to full trace). Render nothing when empty
  (many models never emit reasoning). Truncate the collapsed preview to ~2 lines.
- **Tool rows**: spinner while `running`, checkmark/cross on `done`/`error`,
  one line from `title` or `name`, expandable `<details>`-style block showing
  `preview` after completion, duration badge from `durationMs`.
- **Subagent cards**: distinct styling (e.g. accent border, bot icon), label =
  description from `subagent.started`. Clicking toggles an expanded panel showing:
  - live: the accumulated `chunks` (+ nested tool items whose `childSessionId` matches)
  - fallback/history: fetch `/api/research/messages?sessionId=<childSessionId>` on first
    expand if `chunks` is empty (handles reconnects and already-finished subagents)
- Follow the app's existing look: `rounded-2xl border border-stroke bg-surface-*`,
  `text-foreground-*`, pill badges like the phase indicator in `research-client.tsx`.

### Step 6 — wire into `app/research/component/research-client.tsx` (~30 min)

Currently mock-driven. Replace the fake interval flow with:

```tsx
const sessionId = /* openCodeSessionId returned by startResearch() */;
const stream = useResearchStream(openCodeSessionId);
// ...
<ThinkingPanel text={stream.thinking} done={stream.thinkingDone} />
<ActivityFeed activity={stream.activity} />
<div>{stream.mainText}</div>
```

### Step 7 — verify end-to-end (~30 min)

- Run `opencode serve` on port 3211 (as `lib/opencode/client.ts` expects) and trigger a
  prompt that uses several tools, a Task/subagent, **and** a reasoning model so thinking
  traces stream.
- Watch raw SSE: `curl -N "localhost:3000/api/research/stream?sessionId=ses_xxx"`
- Confirm: tools appear as running → completed with correct durations; subagent card appears
  with its own nested tool rows; clicking expands live content; thinking block streams then
  collapses when `done: true` (and is absent entirely for non-reasoning models); abort
  mid-task doesn't wedge the UI (caveat #22348); reconnecting mid-run hydrates from
  `/api/research/messages`.

---

## 4. Effort summary

| Step                          | Est.      |
|-------------------------------|-----------|
| 1. Server helpers             | ~10 min   |
| 2. Stream route events        | ~45 min   |
| 3. Messages API route         | ~30 min   |
| 4. Hook activity state        | ~1 h      |
| 5. ActivityFeed component     | ~2–3 h    |
| 6. Client wiring              | ~30 min   |
| 7. Verification               | ~30 min   |
| **Total**                     | **~1 day**|
