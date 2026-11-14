/**
 * Bridge between the OpenCode server's two native event dialects.
 *
 * Pre-2.x (`/event`) emits `message.part.delta` / `message.part.updated` /
 * `message.updated` / `session.error` with a `properties` envelope — the
 * shapes the research hub (lib/research/stream.ts) was built against.
 *
 * server 2.x (`/api/event`) emits the durable/self-descriptive dialect
 * (`session.text.delta`, `session.tool.called`, `session.execution.*`, …)
 * with a `data` envelope instead. Observed live on 2.3.0: `data` is used for
 * every event; `properties` never appears (the SDK unions them, the wire
 * doesn't). The same mapping covers a hypothetical `properties` envelope by
 * normalizing both into `properties` first.
 *
 * The bridge rewrites 2.3.0 events into the v1 shapes the hub understands:
 *
 *   session.text.started | reasoning.started  → message.part.updated (synthetic part)
 *   session.text.delta   | reasoning.delta    → message.part.delta
 *   session.text.ended   | reasoning.ended    → message.part.updated (time.end set)
 *   session.tool.input.started/ended          → message.part.updated (tool, running, input)
 *   session.tool.called                       → message.part.updated (tool, running, input)
 *   session.tool.success | session.tool.failed→ message.part.updated (tool, completed/error)
 *   session.execution.succeeded               → message.updated (assistant, completed)
 *   session.execution.failed                  → session.error
 *   session.step.failed (finish == "error")   → session.error
 *   session.status / session.idle             → passthrough
 *   everything else                            → passed through untouched
 *
 * The wire frames the SSE client hands us are JSON objects with
 * `{ id?, created?, type, data | properties }`; the bridge unwraps either
 * `data` or `properties` and re-emits v1-shaped objects. Tool identity and
 * input come from the `input.*` lifecycle; success/failed events only carry
 * the id — the bridge keeps a small per-call state map keyed by tool id.
 */

export type BridgeToolState = Map<
  string,
  { name: string; input: Record<string, unknown>; startedAt: number }
>;

export function createToolState(): BridgeToolState {
  return new Map();
}

type UnknownRecord = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const rec = (v: unknown): UnknownRecord | undefined =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as UnknownRecord)
    : undefined;

/** JSON.parse a serialized tool input; keep raw text when it isn't an object. */
function parseToolInput(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    const r = rec(v);
    if (r) return r;
    return { value: v };
  } catch {
    return { _raw: text };
  }
}

/** Tool result content blocks → text (the only part the research agent emits). */
function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const b = rec(block);
      return typeof b?.text === "string" ? b.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function structuredErrorMessage(error: unknown): string {
  const e = rec(error);
  if (!e) return typeof error === "string" ? error : "Execution failed";
  if (typeof e.message === "string" && e.message) return e.message;
  if (typeof e.type === "string" && e.type) return e.type;
  return "Execution failed";
}

/** Deep hunt for a string `sessionId` (the task tool's child session link). */
function deepFindSessionId(node: unknown, depth = 0): string | undefined {
  if (depth > 5 || node == null) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindSessionId(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const r = rec(node);
  if (!r) return undefined;
  for (const [key, value] of Object.entries(r)) {
    if (
      (key === "sessionId" || key === "sessionID") &&
      typeof value === "string" &&
      value
    ) {
      return value;
    }
    const found = deepFindSessionId(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Hunt the task tool's subagent metadata across known payload locations. */
function toolMetadata(
  input: UnknownRecord,
  native: unknown,
  metadata: unknown,
): UnknownRecord {
  const meta: UnknownRecord = { ...rec(metadata) };
  const nativeRec = rec(native);
  const nativeMeta =
    rec(nativeRec?.metadata) ?? rec(rec(nativeRec?.state)?.metadata);
  for (const src of [
    rec(input.metadata),
    nativeMeta,
    rec(nativeRec?.metadata),
  ]) {
    if (src) Object.assign(meta, src);
  }
  const sessionId =
    deepFindSessionId(meta) ??
    deepFindSessionId(input) ??
    deepFindSessionId(native);
  if (sessionId) meta.sessionId = sessionId;
  return meta;
}

/** Extract assistantMessageID-ish ids across v2 payload variants. */
function messageIdOf(props: UnknownRecord): string | undefined {
  return (
    str(props.assistantMessageID) ??
    str(props.messageID) ??
    str(props.inboxID) ??
    str(props.id)
  );
}

export function normalizeV2Event(
  raw: unknown,
  toolState: BridgeToolState,
): unknown {
  const ev = rec(raw);
  if (!ev) return raw;
  const payload = rec(ev.properties) ?? rec(ev.data);
  if (!payload) return raw; // no payload — hub has nothing to do with it anyway
  const type = str(ev.type);
  if (!type) return raw;
  const sessionID = str(payload.sessionID);
  const messageID = messageIdOf(payload);
  const ordinal = num(payload.ordinal);
  const now = Date.now();

  const out = (t: string, properties: unknown) => ({ type: t, properties });

  switch (type) {
    // ── text ────────────────────────────────────────────────────────────
    case "session.text.started":
      return out("message.part.updated", {
        part: {
          id: `${messageID}:text:${ordinal}`,
          sessionID,
          messageID,
          type: "text",
          text: "",
          time: { start: now, end: undefined },
        },
      });
    case "session.text.delta":
      return out("message.part.delta", {
        sessionID,
        messageID,
        partID: `${messageID}:text:${ordinal}`,
        field: "text",
        delta: str(payload.delta) ?? "",
      });
    case "session.text.ended":
      return out("message.part.updated", {
        part: {
          id: `${messageID}:text:${ordinal}`,
          sessionID,
          messageID,
          type: "text",
          text: str(payload.text) ?? "",
          time: { start: now, end: now },
        },
      });

    // ── reasoning ───────────────────────────────────────────────────────
    case "session.reasoning.started":
      return out("message.part.updated", {
        part: {
          id: `${messageID}:reasoning:${ordinal}`,
          sessionID,
          messageID,
          type: "reasoning",
          text: "",
          time: { start: now, end: undefined },
        },
      });
    case "session.reasoning.delta":
      // v1 pipeline ignores non-"text" fields; reasoning rides field "text"
      // with the part registered as type "reasoning" (see handlePartDelta).
      return out("message.part.delta", {
        sessionID,
        messageID,
        partID: `${messageID}:reasoning:${ordinal}`,
        field: "text",
        delta: str(payload.delta) ?? "",
      });
    case "session.reasoning.ended":
      return out("message.part.updated", {
        part: {
          id: `${messageID}:reasoning:${ordinal}`,
          sessionID,
          messageID,
          type: "reasoning",
          text: "",
          time: { start: now, end: now },
        },
      });

    // ── tools ───────────────────────────────────────────────────────────
    case "session.tool.input.started": {
      const id = str(payload.id);
      const name = str(payload.name) ?? "tool";
      if (!id) return null;
      toolState.set(id, { name, input: {}, startedAt: now });
      // Deliberately not emitted yet: wait for `called`/`input.ended` so the
      // running row carries the real (e.g. webfetch url) instead of an empty
      // input — the hub emits at most one running row per tool id.
      return null;
    }
    case "session.tool.input.ended": {
      const id = str(payload.id);
      if (!id) return null;
      const pending = toolState.get(id);
      const input = parseToolInput(str(payload.text));
      const name = pending?.name ?? "tool";
      const startedAt = pending?.startedAt ?? now;
      const metadata = toolMetadata(input, undefined, undefined);
      toolState.set(id, { name, input, startedAt });
      // Fallback emission: `called` will emit again with the same data and
      // the hub dedupes running tools by id — no double counting.
      return out("message.part.updated", {
        part: {
          id,
          sessionID,
          messageID,
          type: "tool",
          callID: id,
          tool: name,
          state: {
            status: "running",
            input,
            metadata,
            time: { start: startedAt },
          },
        },
      });
    }
    case "session.tool.called": {
      const id = str(payload.id);
      if (!id) return null;
      const pending = toolState.get(id);
      const input = rec(payload.input) ?? pending?.input ?? {};
      const name = pending?.name ?? "tool";
      const startedAt = pending?.startedAt ?? now;
      if (pending) pending.input = input;
      const metadata = toolMetadata(input, payload.native, payload.metadata);
      toolState.set(id, { name, input, startedAt });
      return out("message.part.updated", {
        part: {
          id,
          sessionID,
          messageID,
          type: "tool",
          callID: id,
          tool: name,
          state: {
            status: "running",
            input,
            metadata,
            time: { start: startedAt },
          },
        },
      });
    }
    case "session.tool.progress": {
      // Metadata-only update; nothing new to show — hub ignores unknown tools.
      return null;
    }
    case "session.tool.success":
    case "session.tool.failed": {
      const id = str(payload.id);
      if (!id) return null;
      const pending = toolState.get(id);
      const name = pending?.name ?? "tool";
      const input = pending?.input ?? {};
      const startedAt = pending?.startedAt ?? now;
      const metadata = toolMetadata(input, payload.native, payload.metadata);
      const isError = type === "session.tool.failed";
      const state = isError
        ? {
            status: "error",
            input,
            error: structuredErrorMessage(payload.error),
            metadata,
            time: { start: startedAt, end: now },
          }
        : {
            status: "completed",
            input,
            output: contentToText(payload.content),
            title: str(metadata.title) ?? "",
            metadata,
            time: { start: startedAt, end: now },
          };
      toolState.delete(id);
      return out("message.part.updated", {
        part: {
          id,
          sessionID,
          messageID,
          type: "tool",
          callID: id,
          tool: name,
          state,
        },
      });
    }

    // ── execution lifecycle ─────────────────────────────────────────────
    case "session.execution.succeeded":
      // Hub's completion gate: assistant Message with time.completed set.
      return out("message.updated", {
        info: {
          id: `${sessionID}:succeeded`,
          sessionID,
          role: "assistant",
          time: { created: now, completed: now },
        },
      });
    case "session.execution.failed":
      return out("session.error", {
        sessionID,
        error: structuredErrorMessage(payload.error),
      });
    case "session.execution.interrupted":
      return out("session.error", {
        sessionID,
        error: "Execution interrupted",
      });
    case "session.step.failed": {
      // Only the terminal error case maps to failure; tool-calls/stop are fine.
      const finish = str(payload.finish);
      if (finish !== "error") return null;
      return out("session.error", { sessionID, error: "Step failed" });
    }

    // ── status (shapes identical across dialects) ───────────────────────
    case "session.status":
      return out("session.status", { sessionID, status: payload.status });
    case "session.idle":
      return out("session.idle", { sessionID });

    // ── everything else: keep payload, normalize envelope ────────────────
    default:
      return { id: ev.id, type, properties: payload };
  }
}

export async function* normalizeV2EventStream(
  stream: AsyncIterable<unknown>,
): AsyncGenerator<unknown> {
  const toolState = createToolState();
  for await (const raw of stream) {
    const mapped = normalizeV2Event(raw, toolState);
    if (mapped != null) yield mapped;
  }
}
