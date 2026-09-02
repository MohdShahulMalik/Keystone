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
import type { StreamedJob } from "./job-schema";

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
  userId: string; // owner of the SearchSession — used for JobListing writes
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
  lastSent: Map<string, number>; // sessionId -> index already sent via flush
  pendingTools: Map<string, { sessionID: string; seq: number; text: string }>; // toolId -> pending running tool for in-place update
  // incremental job streaming
  jobBuffers: Map<string, string>; // sessionID -> incomplete tail for JOB_JSON line
  jobSeq: Map<string, number>; // sessionID -> monotonic seq for jobs
  emittedJobKeys: Set<string>; // dedup key: title|company|url
  // queued DB persist via app/actions/jobs.ts bulkCreateJobsFromResearch
  jobPersistQueue: Map<string, StreamedJob[]>;
  jobPersistTimers: Map<string, ReturnType<typeof setTimeout>>;
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

function getOrCreateOpenSegment(
  ctx: StreamCtx,
  sessionID: string,
  kind: SegmentKind,
  toolId?: string,
) {
  const existing = ctx.openSegments.get(sessionID);
  if (existing && existing.kind === kind && existing.toolId === toolId)
    return existing;
  const next = { kind, text: "", toolId };
  ctx.openSegments.set(sessionID, next);
  return next;
}

function emitChildSegment(
  ctx: StreamCtx,
  buf: { kind: SegmentKind; text: string; toolId?: string },
  sessionID: string,
  seq: number,
) {
  if (buf.kind === "thinking") {
    ctx.send(
      sse("subagent.thinking", {
        id: sessionID,
        childSessionId: sessionID,
        text: buf.text,
        done: true,
        seq,
      }),
    );
  } else {
    ctx.send(
      sse("subagent.chunk", {
        id: sessionID,
        childSessionId: sessionID,
        text: buf.text,
        seq,
      }),
    );
  }
}

function emitParentSegment(
  ctx: StreamCtx,
  buf: { kind: SegmentKind; text: string; toolId?: string },
  sessionID: string,
  seq: number,
) {
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
  const last = ctx.lastSent.get(sessionID) ?? 0;
  if (buf.text.length > last) {
    const delta = buf.text.slice(last);
    if (buf.kind === "thinking") {
      if (isChild) ctx.send(sse("subagent.thinking", { id: sessionID, childSessionId: sessionID, text: delta, done: false, seq: ctx.seq.get(sessionID) ?? 0 }));
      else ctx.send(sse("thinking", { text: delta, done: false, seq: ctx.seq.get(sessionID) ?? 0 }));
    } else if (buf.kind === "text") {
      if (isChild) ctx.send(sse("subagent.chunk", { id: sessionID, childSessionId: sessionID, text: delta, seq: ctx.seq.get(sessionID) ?? 0 }));
      else ctx.send(sse("chunk", { text: delta, seq: ctx.seq.get(sessionID) ?? 0, id: sessionID }));
    }
  }
  const seq = (ctx.seq.get(sessionID) ?? 0) + 1;
  ctx.seq.set(sessionID, seq);
  await ctx.persist(sessionID, buf.kind, buf.text, buf.toolId, undefined);
  if (buf.kind === "thinking") {
    if (isChild) ctx.send(sse("subagent.thinking", { id: sessionID, childSessionId: sessionID, text: "", done: true, seq }));
    else ctx.send(sse("thinking", { text: "", done: true, seq }));
  }
  ctx.openSegments.delete(sessionID);
  ctx.lastSent.delete(sessionID);
}

function appendToOpenSegment(
  ctx: StreamCtx,
  sessionID: string,
  kind: SegmentKind,
  delta: string,
  toolId?: string,
) {
  const seg = getOrCreateOpenSegment(ctx, sessionID, kind, toolId);
  seg.text += delta;
}

const JOB_PREFIX = "JOB_JSON:";
const JOB_PREFIX_TRIMMED = JOB_PREFIX; // we check trimmedStart

function makeJobKey(job: { title: string; company: string; url?: string | null }): string {
  return `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}|${(job.url ?? "").toLowerCase().trim()}`;
}

// ---- queued persist via app/actions/jobs.ts (bulkCreateJobsFromResearch) ----
const JOB_PERSIST_BATCH_SIZE = 8;
const JOB_PERSIST_FLUSH_MS = 1200;

function enqueueJobForPersist(ctx: StreamCtx, job: StreamedJob) {
  const key = ctx.dbSessionId;
  const q = ctx.jobPersistQueue.get(key) ?? [];
  q.push(job);
  ctx.jobPersistQueue.set(key, q);

  if (q.length >= JOB_PERSIST_BATCH_SIZE) {
    void flushJobPersistQueue(ctx);
  } else {
    scheduleJobPersistFlush(ctx);
  }
}

function scheduleJobPersistFlush(ctx: StreamCtx) {
  const key = ctx.dbSessionId;
  if (ctx.jobPersistTimers.has(key)) return;
  const t = setTimeout(() => {
    ctx.jobPersistTimers.delete(key);
    void flushJobPersistQueue(ctx);
  }, JOB_PERSIST_FLUSH_MS);
  // allow process to exit even if timer pending
  if (typeof (t as unknown as { unref?: () => void }).unref === "function") {
    (t as unknown as { unref: () => void }).unref();
  }
  ctx.jobPersistTimers.set(key, t);
}

export async function flushJobPersistQueue(ctx: StreamCtx): Promise<void> {
  const key = ctx.dbSessionId;
  const timer = ctx.jobPersistTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    ctx.jobPersistTimers.delete(key);
  }
  const batch = ctx.jobPersistQueue.get(key);
  if (!batch || batch.length === 0) return;
  ctx.jobPersistQueue.set(key, []);
  const toPersist = [...batch];
  try {
    // dynamic import to avoid circular dep: stream.ts <-> app/actions/jobs.ts
    const { bulkCreateJobsFromResearch } = await import("@/app/actions/jobs");
    await bulkCreateJobsFromResearch(ctx.userId, toPersist);
  } catch (e) {
    console.error("[research] flushJobPersistQueue failed", e);
    // re-queue on failure (avoid loss) — prepend
    const existing = ctx.jobPersistQueue.get(key) ?? [];
    ctx.jobPersistQueue.set(key, [...toPersist, ...existing]);
  }
}

export async function flushAllJobPersistQueues(ctx: StreamCtx): Promise<void> {
  await flushJobPersistQueue(ctx);
}

function tryEmitSingleJob(ctx: StreamCtx, sessionID: string, jsonStr: string) {
  // ONLY main agent jobs should be sent to client / stored — ignore subagent JOB_JSON
  if (sessionID !== ctx.sessionId) return;
  const trimmed = jsonStr.trim();
  if (!trimmed) return;
  // allow both object and JSON with trailing chars; extract first {...}
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    // try to recover: find first { and last } (handles stray prefix/suffix)
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return;
    try {
      obj = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return;
    }
  }
  // lazy import to avoid cycle - validate shape minimally here, full Zod on client
  const maybe = obj as Record<string, unknown>;
  if (typeof maybe.title !== "string" || typeof maybe.company !== "string") return;
  const key = makeJobKey(maybe as { title: string; company: string; url?: string | null });
  if (ctx.emittedJobKeys.has(key)) return;
  ctx.emittedJobKeys.add(key);
  const seq = (ctx.jobSeq.get(sessionID) ?? 0) + 1;
  ctx.jobSeq.set(sessionID, seq);
  // normalize minimal fields for client; client will re-validate via StreamedJobSchema
  const payload = {
    id: `${sessionID}-${seq}-${Date.now()}`,
    sessionId: sessionID,
    seq,
    title: String(maybe.title),
    company: String(maybe.company),
    location: String(maybe.location ?? ""),
    url: (maybe.url as string | null) ?? null,
    description: String(maybe.description ?? ""),
    salary: (maybe.salary as string | null) ?? null,
    experience: String(maybe.experience ?? "Mid"),
    visa: (maybe.visa as string | null) ?? null,
    type: String(maybe.type ?? "remote"),
    country: (maybe.country as string | null) ?? null,
    notes: (maybe.notes as string | null) ?? null,
  };
  ctx.send(sse("job", payload));
  // queue for DB via app/actions/jobs.ts bulkCreateJobsFromResearch + keep lightweight searchResult for history
  const streamedForDb: StreamedJob = {
    title: payload.title,
    company: payload.company,
    location: payload.location,
    url: payload.url,
    description: payload.description,
    salary: payload.salary,
    experience: payload.experience,
    visa: payload.visa,
    type: payload.type as StreamedJob["type"],
    country: payload.country,
    notes: payload.notes,
  };
  enqueueJobForPersist(ctx, streamedForDb);
  void db.searchResult
    .create({
      data: {
        sessionId: ctx.dbSessionId,
        jobListingJson: payload as unknown as object,
      },
    })
    .catch(() => {});
}

function stripJobLines(ctx: StreamCtx, sessionID: string, rawDelta: string): string {
  // combine with any pending tail from previous incomplete JOB_JSON line
  const prevTail = ctx.jobBuffers.get(sessionID) ?? "";
  let pending = prevTail + rawDelta;
  let filtered = "";

  // process complete lines (terminated by \n)
  while (true) {
    const nlIdx = pending.indexOf("\n");
    if (nlIdx === -1) break;
    const line = pending.slice(0, nlIdx + 1); // include newline
    pending = pending.slice(nlIdx + 1);
    const trimmedStart = line.trimStart();
    if (trimmedStart.startsWith(JOB_PREFIX_TRIMMED)) {
      const jsonStr = trimmedStart.slice(JOB_PREFIX_TRIMMED.length);
      tryEmitSingleJob(ctx, sessionID, jsonStr);
      // drop this line from narrative entirely
      continue;
    }
    filtered += line;
  }

  // pending is remainder without \n
  // Heuristic: if remainder looks like it could be the start/middle of a JOB_JSON line, buffer it
  // covers splits like "JOB", "JOB_JSON:", "JOB_JSON: {\"title\""
  const trimmedPending = pending.trimStart();
  const isPotentialJobStart =
    pending.length > 0 &&
    (trimmedPending.length === 0 ||
      JOB_PREFIX.startsWith(trimmedPending) ||
      trimmedPending.startsWith(JOB_PREFIX) ||
      trimmedPending.startsWith("JOB") ||
      // already inside JSON fragment after prefix but no newline yet: keep buffered only if we saw prefix earlier
      // we detect that prevTail already held a JOB prefix and we never completed
      (prevTail.trimStart().startsWith(JOB_PREFIX) && pending.length > prevTail.length));

  // More robust: if previous tail was a partial job line, keep buffering until newline
  const wasInJob = prevTail.trimStart().startsWith(JOB_PREFIX) && !prevTail.includes("\n");
  if (wasInJob) {
    // pending still part of same job line
    ctx.jobBuffers.set(sessionID, pending);
    return filtered;
  }

  if (isPotentialJobStart && trimmedPending.startsWith("JOB")) {
    // Could be "JOB_JSON: ..." split across chunks without newline yet
    ctx.jobBuffers.set(sessionID, pending);
    return filtered;
  }

  // normal text fragment without newline -> forward immediately (don't buffer)
  filtered += pending;
  ctx.jobBuffers.set(sessionID, "");
  return filtered;
}

function deliverDelta(
  ctx: StreamCtx,
  type: string,
  sessionID: string,
  delta: string,
) {
  if (type === "reasoning") {
    appendToOpenSegment(ctx, sessionID, "thinking", delta);
    return;
  }
  const filtered = stripJobLines(ctx, sessionID, delta);
  if (filtered) appendToOpenSegment(ctx, sessionID, "text", filtered);
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

export function flushPendingJobs(ctx: StreamCtx) {
  for (const [sid, tail] of ctx.jobBuffers) {
    const trimmed = tail.trimStart();
    if (trimmed.startsWith(JOB_PREFIX)) {
      const jsonStr = trimmed.slice(JOB_PREFIX.length);
      if (jsonStr.trim()) {
        tryEmitSingleJob(ctx, sid, jsonStr);
      }
      ctx.jobBuffers.set(sid, "");
    } else {
      // subagent tails that look like JOB_JSON are dropped silently (no emit)
      if (sid !== ctx.sessionId) ctx.jobBuffers.set(sid, "");
    }
  }
}

export async function flush(ctx: StreamCtx) {
  // emit any job line that got buffered without trailing newline (end of stream)
  // we only flush jobs when no open text delta remains, to avoid premature emit of incomplete JSON
  // caller should call flushPendingJobs explicitly at idle/done; here we just flush text segments
  for (const [sid, buf] of ctx.openSegments) {
    if (buf.kind !== "text" && buf.kind !== "thinking") continue;
    const last = ctx.lastSent.get(sid) ?? 0;
    if (buf.text.length <= last) continue;
    const delta = buf.text.slice(last);
    const isChild = ctx.childSessions.has(sid);
    if (buf.kind === "thinking") {
      if (isChild) ctx.send(sse("subagent.thinking", { id: sid, childSessionId: sid, text: delta, done: false, seq: ctx.seq.get(sid) ?? 0 }));
      else ctx.send(sse("thinking", { text: delta, done: false, seq: ctx.seq.get(sid) ?? 0 }));
    } else {
      if (isChild) ctx.send(sse("subagent.chunk", { id: sid, childSessionId: sid, text: delta, seq: ctx.seq.get(sid) ?? 0 }));
      else ctx.send(sse("chunk", { text: delta, seq: ctx.seq.get(sid) ?? 0, id: sid }));
    }
    ctx.lastSent.set(sid, buf.text.length);
  }

  // legacy buffers kept for compat - drain if anything remains there
  if (ctx.buffers.chunk) {
    appendToOpenSegment(ctx, ctx.sessionId, "text", ctx.buffers.chunk);
    ctx.buffers.chunk = "";
  }
  if (ctx.buffers.thinking) {
    appendToOpenSegment(ctx, ctx.sessionId, "thinking", ctx.buffers.thinking);
    ctx.buffers.thinking = "";
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

  // emit running via same commit path but store pending for in-place update on completed
  const seq = (ctx.seq.get(part.sessionID) ?? 0) + 1;
  ctx.seq.set(part.sessionID, seq);
  const displayText = webfetchDisplayText(part);
  ctx.pendingTools.set(part.id, { sessionID: part.sessionID, seq, text: displayText });
  await ctx.persist(part.sessionID, "tool", displayText, part.id, undefined);

  ctx.send(
    sse("tool.started", {
      id: part.id,
      tool: part.tool,
      title: state.title,
      input: state.input,
      sessionId: isChild ? part.sessionID : undefined,
      seq,
    }),
  );

  if (part.tool !== "task" || typeof state.metadata?.sessionId !== "string") {
    return;
  }

  const childSessionId = state.metadata.sessionId;
  ctx.childSessions.set(childSessionId, part.id);

  const input = state.input as Record<string, unknown>;
  const title =
    (state.title as string) || (input.description as string) || "Subagent";
  const description = input.description as string | undefined;
  const subagentType =
    (input.subagent_type as string) || (input.subagent as string) || undefined;

  // ensure SubagentSession row exists for FK of SubagentSegment
  try {
    await db.subagentSession.upsert({
      where: { sessionId: childSessionId },
      create: {
        sessionId: childSessionId,
        parentId: ctx.dbSessionId,
        title,
        description,
        subagentType,
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
      description,
      subagentType,
    }),
  );
}

export async function handleToolCompleted(ctx: StreamCtx, part: ToolPart) {
  const state = part.state as ToolStateCompleted;
  const durationStr = formatDuration(state.time.end - state.time.start);
  const isChild = ctx.childSessions.has(part.sessionID);
  const pending = ctx.pendingTools.get(part.id);
  const seq = pending?.seq ?? (ctx.seq.get(part.sessionID) ?? 0) + 1;
  if (!pending) ctx.seq.set(part.sessionID, seq);
  const displayText =
    part.tool === "webfetch" && typeof (state.input as Record<string, unknown>)?.url === "string"
      ? `${toTitleCase(part.tool)} ↳ ${(state.input as Record<string, unknown>).url as string}`
      : state.title ?? toTitleCase(part.tool);
  const completedText = `✓ ${displayText} (${durationStr})`;
  if (pending) {
    await ctx.persistToolUpdate(part.sessionID, seq, completedText, part.id, durationStr);
    ctx.pendingTools.delete(part.id);
  } else {
    await ctx.persist(part.sessionID, "tool", completedText, part.id, durationStr);
  }

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
      sessionId: isChild ? part.sessionID : undefined,
    }),
  );

  if (part.tool === "task" && typeof state.metadata?.sessionId === "string") {
    const childSessionId = state.metadata.sessionId as string;
    const input = state.input as Record<string, unknown>;
    const title = (state.title as string) || (input.description as string) || "Subagent";
    const description = input.description as string | undefined;
    const subagentType = (input.subagent_type as string) || (input.subagent as string) || undefined;
    ctx.send(
      sse("subagent.completed", {
        id: part.id,
        childSessionId,
        title,
        description,
        subagentType,
        durationMs: state.time.end - state.time.start,
        timeTaken: durationStr,
      }),
    );
    try {
      await db.subagentSession.update({
        where: { sessionId: childSessionId },
        data: { status: "completed", completedAt: new Date(), timeTaken: durationStr },
      });
    } catch {}
  }
}

export async function handleToolError(ctx: StreamCtx, part: ToolPart) {
  const state = part.state as ToolStateError;
  await commitOpenSegment(ctx, part.sessionID);
  const durationStr = formatDuration(state.time.end - state.time.start);
  const isChild = ctx.childSessions.has(part.sessionID);
  const pending = ctx.pendingTools.get(part.id);
  const seq = pending?.seq ?? (ctx.seq.get(part.sessionID) ?? 0) + 1;
  if (!pending) ctx.seq.set(part.sessionID, seq);
  const errorText = `✗ ${toTitleCase(part.tool)}: ${state.error}`;
  if (pending) {
    await ctx.persistToolUpdate(part.sessionID, seq, errorText, part.id, durationStr);
    ctx.pendingTools.delete(part.id);
  } else {
    await ctx.persist(part.sessionID, "tool", errorText, part.id, durationStr);
  }

  ctx.send(
    sse("tool.error", {
      id: part.id,
      tool: part.tool,
      error: state.error,
      durationMs: state.time.end - state.time.start,
      timeTaken: durationStr,
      seq,
      sessionId: isChild ? part.sessionID : undefined,
    }),
  );
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
  if (open && open.kind !== (part.type as SegmentKind)) {
    await commitOpenSegment(ctx, part.sessionID);
  }

  registerPart(ctx, part);

  if (part.type === "tool") {
    await handleToolPart(ctx, part, isChild);
  } else if (part.type === "reasoning") {
    const reasoning = part as ReasoningPart;
    if (reasoning.time?.end) await commitOpenSegment(ctx, part.sessionID);
  }
  // text/reasoning deltas are handled solely via handlePartDelta -> deliverDelta
}
