import type {
  Event,
  Part,
  ReasoningPart,
  TextPart,
  ToolPart,
  ToolStateCompleted,
  ToolStateError,
  ToolStateRunning,
} from "@opencode-ai/sdk";
import { db } from "@/lib/db";

export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface PartDeltaProperties {
  sessionID: string;
  messageID: string;
  partID: string;
  field: string;
  delta: string;
}

export type StreamEvent =
  | Event
  | { type: "message.part.delta"; properties: PartDeltaProperties };

export type SegmentKind = "text" | "thinking" | "tool";

export interface StreamCtx {
  sessionId: string; // opencode parent session id
  dbSessionId: string; // SearchSession.id for FK
  childSessions: Map<string, string>; // childSessionId (opencode) -> parentToolId (task tool id)
  buffers: { chunk: string; thinking: string };
  parts: Map<string, { sessionId: string; type: string }>; // partId -> {sessionId, type: "text" | "reasoning" | "tool"}
  pendingDeltas: Map<string, string[]>; // partId -> delta[] queued before part type known
  emittedTools: Set<string>; // toolId set already sent as tool.started
  send: (text: string) => void;
  openSegments: Map<
    string,
    { kind: SegmentKind; text: string; toolId?: string }
  >; // sessionId (opencode) -> coalesced segment buffer
  seq: Map<string, number>; // sessionId (opencode) -> last seq written
  pendingTools: Map<string, { sessionID: string; seq: number; text: string }>; // toolId -> pending running tool for in-place update
  persist: (
    sessionId: string,
    kind: SegmentKind,
    text: string,
    toolId?: string,
    timeTaken?: string,
  ) => Promise<void>;
  persistToolUpdate: (
    sessionId: string,
    seq: number,
    text: string,
    toolId: string,
    timeTaken?: string,
  ) => Promise<void>;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  if (s > 0) return `${s}s`;
  return `${ms}ms`;
}

function toTitleCase(tool: string): string {
  return tool.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function webfetchDisplayText(part: ToolPart): string {
  if (part.tool === "webfetch") {
    const url = (part.state as ToolStateRunning).input?.url as string | undefined;
    const name = toTitleCase(part.tool);
    if (url) return `${name} ↳ ${url}`;
    return name;
  }
  const state: unknown = part.state;
  if (state && typeof state === "object" && "title" in (state as Record<string, unknown>)) {
    const t = (state as { title?: string }).title;
    if (t) return t;
  }
  return toTitleCase(part.tool);
}

function getOrCreateOpenSegment(ctx: StreamCtx, sessionID: string, kind: SegmentKind, toolId?: string) {
  const existing = ctx.openSegments.get(sessionID);
  if (existing && existing.kind === kind && existing.toolId === toolId) return existing;
  const next = { kind, text: "", toolId };
  ctx.openSegments.set(sessionID, next);
  return next;
}

function emitChildSegment(ctx: StreamCtx, buf: { kind: SegmentKind; text: string; toolId?: string }, sessionID: string, seq: number) {
  if (buf.kind === "thinking") {
    ctx.send(sse("subagent.thinking", { id: sessionID, childSessionId: sessionID, text: buf.text, done: true, seq }));
  } else {
    ctx.send(sse("subagent.chunk", { id: sessionID, childSessionId: sessionID, text: buf.text, seq }));
  }
}

function emitParentSegment(ctx: StreamCtx, buf: { kind: SegmentKind; text: string; toolId?: string }, sessionID: string, seq: number) {
  if (buf.kind === "thinking") {
    ctx.send(sse("thinking", { text: buf.text, done: true, seq }));
  } else {
    ctx.send(sse("chunk", { text: buf.text, seq, id: sessionID }));
  }
}

async function commitOpenSegment(ctx: StreamCtx, sessionID: string) {
  const buf = ctx.openSegments.get(sessionID);
  if (!buf || !buf.text) return;
  const isChild = ctx.childSessions.has(sessionID);
  const seq = (ctx.seq.get(sessionID) ?? 0) + 1;
  ctx.seq.set(sessionID, seq);

  // persist - text/thinking have no timeTaken, tool uses commitOpenSegmentWithDuration
  await ctx.persist(sessionID, buf.kind, buf.text, buf.toolId, undefined);

  if (isChild) {
    emitChildSegment(ctx, buf, sessionID, seq);
  } else {
    emitParentSegment(ctx, buf, sessionID, seq);
  }

  ctx.openSegments.delete(sessionID);
}

function appendToOpenSegment(ctx: StreamCtx, sessionID: string, kind: SegmentKind, delta: string, toolId?: string) {
  const seg = getOrCreateOpenSegment(ctx, sessionID, kind, toolId);
  seg.text += delta;
}

function deliverDelta(ctx: StreamCtx, type: string, sessionID: string, delta: string) {
  if (type === "reasoning") {
    appendToOpenSegment(ctx, sessionID, "thinking", delta);
    return;
  }
  appendToOpenSegment(ctx, sessionID, "text", delta);
}

function registerPart(ctx: StreamCtx, part: Part) {
  ctx.parts.set(part.id, { sessionId: part.sessionID, type: part.type });

  const pending = ctx.pendingDeltas.get(part.id);
  if (!pending) return;
  ctx.pendingDeltas.delete(part.id);

  for (const delta of pending) {
    deliverDelta(ctx, part.type, part.sessionID, delta);
  }
}

export function handlePartDelta(ctx: StreamCtx, props: PartDeltaProperties) {
  if (props.field !== "text") return;

  const isChild = ctx.childSessions.has(props.sessionID);
  const isParent = props.sessionID === ctx.sessionId;
  if (!isChild && !isParent) return;

  const part = ctx.parts.get(props.partID);
  if (!part) {
    const pending = ctx.pendingDeltas.get(props.partID) ?? [];
    pending.push(props.delta);
    ctx.pendingDeltas.set(props.partID, pending);
    return;
  }

  deliverDelta(ctx, part.type, props.sessionID, props.delta);
}

export async function flush(ctx: StreamCtx) {
  // commit any open text/thinking segments as single coalesced row
  const sessions = Array.from(ctx.openSegments.keys());
  for (const sid of sessions) {
    const buf = ctx.openSegments.get(sid);
    if (!buf) continue;
    // only flush text/thinking via periodic flush; tool segments are committed on tool completion
    if (buf.kind === "text" || buf.kind === "thinking") {
      await commitOpenSegment(ctx, sid);
    }
  }

  // legacy buffers kept for compat - drain if anything remains there
  if (ctx.buffers.chunk) {
    appendToOpenSegment(ctx, ctx.sessionId, "text", ctx.buffers.chunk);
    ctx.buffers.chunk = "";
    await commitOpenSegment(ctx, ctx.sessionId);
  }
  if (ctx.buffers.thinking) {
    appendToOpenSegment(ctx, ctx.sessionId, "thinking", ctx.buffers.thinking);
    ctx.buffers.thinking = "";
    await commitOpenSegment(ctx, ctx.sessionId);
  }
}

export function handleTextPart(
  ctx: StreamCtx,
  part: TextPart,
  delta: string | undefined,
) {
  if (!delta) return;
  appendToOpenSegment(ctx, part.sessionID, "text", delta);
}

export async function handleReasoningPart(
  ctx: StreamCtx,
  part: ReasoningPart,
  delta: string | undefined,
) {
  if (delta) appendToOpenSegment(ctx, part.sessionID, "thinking", delta);
  if (!part.time?.end) return;

  await commitOpenSegment(ctx, part.sessionID);
}

export async function handleToolRunning(
  ctx: StreamCtx,
  part: ToolPart,
  isChild: boolean,
) {
  if (ctx.emittedTools.has(part.id)) return;
  ctx.emittedTools.add(part.id);

  // commit any open text/thinking before tool
  await commitOpenSegment(ctx, part.sessionID);

  const state = part.state as ToolStateRunning;

  // tool calls are not coalesced - emit and persist directly
  const seq = (ctx.seq.get(part.sessionID) ?? 0) + 1;
  ctx.seq.set(part.sessionID, seq);
  await ctx.persist(part.sessionID, "tool", state.title ?? part.tool, part.id, undefined);

  if (isChild) {
    ctx.send(
      sse("subagent.tool", {
        id: part.id,
        tool: part.tool,
        title: state.title,
        input: state.input,
        sessionId: part.sessionID,
        seq,
      }),
    );
  } else {
    ctx.send(
      sse("tool.started", {
        id: part.id,
        tool: part.tool,
        title: state.title,
        input: state.input,
        seq,
      }),
    );
  }

  if (part.tool !== "task" || typeof state.metadata?.sessionId !== "string") {
    return;
  }

  const childSessionId = state.metadata.sessionId;
  ctx.childSessions.set(childSessionId, part.id);

  const input = state.input as Record<string, unknown>;
  const title = (input.title as string) || (input.description as string) || "Subagent";

  // ensure SubagentSession row exists for FK of SubagentSegment
  try {
    await db.subagentSession.upsert({
      where: { sessionId: childSessionId },
      create: {
        sessionId: childSessionId,
        parentId: ctx.dbSessionId,
        title,
        status: "running",
        openCodeParentToolId: part.id,
      },
      update: {},
    });
    // init seq for child
    if (!ctx.seq.has(childSessionId)) ctx.seq.set(childSessionId, 0);
  } catch {}

  ctx.send(
    sse("subagent.started", {
      id: part.id,
      childSessionId,
      title,
    }),
  );
}

export async function handleToolCompleted(ctx: StreamCtx, part: ToolPart) {
  const state = part.state as ToolStateCompleted;
  const durationStr = formatDuration(state.time.end - state.time.start);
  const isChild = ctx.childSessions.has(part.sessionID);
  const seq = (ctx.seq.get(part.sessionID) ?? 0) + 1;
  ctx.seq.set(part.sessionID, seq);
  await ctx.persist(part.sessionID, "tool", state.title ?? part.tool, part.id, durationStr);

  if (isChild) {
    ctx.send(
      sse("subagent.tool", {
        id: part.id,
        tool: part.tool,
        title: state.title,
        input: state.input,
        durationMs: state.time.end - state.time.start,
        outputPreview: state.output?.slice(0, 2000) || "",
        seq,
        timeTaken: durationStr,
        sessionId: part.sessionID,
      }),
    );
  } else {
    ctx.send(
      sse("tool.completed", {
        id: part.id,
        tool: part.tool,
        title: state.title,
        input: state.input,
        durationMs: state.time.end - state.time.start,
        outputPreview: state.output?.slice(0, 2000) || "",
        seq,
        timeTaken: durationStr,
      }),
    );
  }
}

export async function handleToolError(ctx: StreamCtx, part: ToolPart) {
  const state = part.state as ToolStateError;
  await commitOpenSegment(ctx, part.sessionID);
  const durationStr = formatDuration(state.time.end - state.time.start);
  const isChild = ctx.childSessions.has(part.sessionID);
  const seq = (ctx.seq.get(part.sessionID) ?? 0) + 1;
  ctx.seq.set(part.sessionID, seq);
  await ctx.persist(part.sessionID, "tool", `${part.tool}: ${state.error}`, part.id, durationStr);

  if (isChild) {
    ctx.send(
      sse("subagent.tool", {
        id: part.id,
        tool: part.tool,
        error: state.error,
        durationMs: state.time.end - state.time.start,
        timeTaken: durationStr,
        sessionId: part.sessionID,
        seq,
      }),
    );
  } else {
    ctx.send(
      sse("tool.error", {
        id: part.id,
        tool: part.tool,
        error: state.error,
        durationMs: state.time.end - state.time.start,
        timeTaken: durationStr,
        seq,
      }),
    );
  }
}

export async function handleToolPart(
  ctx: StreamCtx,
  part: ToolPart,
  isChild: boolean,
) {
  const { state } = part;
  if (state.status === "running") await handleToolRunning(ctx, part, isChild);
  else if (state.status === "completed") await handleToolCompleted(ctx, part);
  else if (state.status === "error") await handleToolError(ctx, part);
}

export async function handlePartUpdated(
  ctx: StreamCtx,
  part: Part,
  delta: string | undefined,
) {
  const isChild = ctx.childSessions.has(part.sessionID);
  const isParent = part.sessionID === ctx.sessionId;
  if (!isChild && !isParent) return;

  const open = ctx.openSegments.get(part.sessionID);
  if (open && open.kind !== part.type as SegmentKind) {
    await commitOpenSegment(ctx, part.sessionID);
  }

  registerPart(ctx, part);

  if (part.type === "text") handleTextPart(ctx, part, delta);
  else if (part.type === "reasoning") await handleReasoningPart(ctx, part, delta);
  else if (part.type === "tool") await handleToolPart(ctx, part, isChild);
}
