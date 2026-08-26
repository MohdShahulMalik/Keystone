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

export interface StreamCtx {
  sessionId: string;
  childSessions: Map<string, string>;
  buffers: { chunk: string; thinking: string };
  parts: Map<string, { sessionId: string; type: string }>;
  pendingDeltas: Map<string, string[]>;
  emittedTools: Set<string>;
  send: (text: string) => void;
}

function deliverDelta(
  ctx: StreamCtx,
  type: string,
  sessionID: string,
  isParent: boolean,
  delta: string,
) {
  if (type === "reasoning") {
    ctx.buffers.thinking += delta;
    return;
  }

  if (isParent) {
    ctx.buffers.chunk += delta;
    return;
  }

  ctx.send(
    sse("subagent.chunk", {
      id: sessionID,
      childSessionId: sessionID,
      text: delta,
    }),
  );
}

function registerPart(ctx: StreamCtx, part: Part) {
  ctx.parts.set(part.id, { sessionId: part.sessionID, type: part.type });

  const pending = ctx.pendingDeltas.get(part.id);
  if (!pending) return;
  ctx.pendingDeltas.delete(part.id);

  const isParent = part.sessionID === ctx.sessionId;
  for (const delta of pending) {
    deliverDelta(ctx, part.type, part.sessionID, isParent, delta);
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

  deliverDelta(ctx, part.type, props.sessionID, isParent, props.delta);
}

export function flush(ctx: StreamCtx) {
  if (ctx.buffers.chunk) {
    ctx.send(sse("chunk", { text: ctx.buffers.chunk }));
    ctx.buffers.chunk = "";
  }
  if (ctx.buffers.thinking) {
    ctx.send(sse("thinking", { text: ctx.buffers.thinking, done: false }));
    ctx.buffers.thinking = "";
  }
}

export function handleTextPart(
  ctx: StreamCtx,
  part: TextPart,
  delta: string | undefined,
  isParent: boolean,
) {
  if (!delta) return;

  if (isParent) {
    ctx.buffers.chunk += delta;
    return;
  }

  ctx.send(
    sse("subagent.chunk", {
      id: part.sessionID,
      childSessionId: part.sessionID,
      text: delta,
    }),
  );
}

export function handleReasoningPart(
  ctx: StreamCtx,
  part: ReasoningPart,
  delta: string | undefined,
) {
  if (delta) ctx.buffers.thinking += delta;
  if (!part.time?.end) return;

  if (ctx.buffers.chunk) {
    ctx.send(sse("chunk", { text: ctx.buffers.chunk }));
    ctx.buffers.chunk = "";
  }

  if (ctx.buffers.thinking) {
    ctx.send(sse("thinking", { text: ctx.buffers.thinking, done: true }));
    ctx.buffers.thinking = "";
  } else {
    ctx.send(sse("thinking", { text: "", done: true }));
  }
}

export function handleToolRunning(
  ctx: StreamCtx,
  part: ToolPart,
  isChild: boolean,
) {
  if (ctx.emittedTools.has(part.id)) return;
  ctx.emittedTools.add(part.id);

  const state = part.state as ToolStateRunning;
  ctx.send(
    sse("tool.started", {
      id: part.id,
      tool: part.tool,
      title: state.title,
      input: state.input,
      sessionId: isChild ? part.sessionID : undefined,
    }),
  );

  if (part.tool !== "task" || typeof state.metadata?.sessionId !== "string") {
    return;
  }

  const childSessionId = state.metadata.sessionId;
  ctx.childSessions.set(childSessionId, part.id);

  const input = state.input as Record<string, unknown>;
  ctx.send(
    sse("subagent.started", {
      id: part.id,
      childSessionId,
      description: (input.description as string) || "Subagent",
      agent: (input.subagentType as string) || undefined,
    }),
  );
}

export function handleToolCompleted(ctx: StreamCtx, part: ToolPart) {
  const state = part.state as ToolStateCompleted;
  ctx.send(
    sse("tool.completed", {
      id: part.id,
      tool: part.tool,
      title: state.title,
      input: state.input,
      durationMs: state.time.end - state.time.start,
      outputPreview: state.output?.slice(0, 2000) || "",
    }),
  );
}

export function handleToolError(ctx: StreamCtx, part: ToolPart) {
  const state = part.state as ToolStateError;
  ctx.send(
    sse("tool.error", {
      id: part.id,
      tool: part.tool,
      error: state.error,
      durationMs: state.time.end - state.time.start,
    }),
  );
}

export function handleToolPart(
  ctx: StreamCtx,
  part: ToolPart,
  isChild: boolean,
) {
  const { state } = part;
  if (state.status === "running") handleToolRunning(ctx, part, isChild);
  else if (state.status === "completed") handleToolCompleted(ctx, part);
  else if (state.status === "error") handleToolError(ctx, part);
}

export function handlePartUpdated(
  ctx: StreamCtx,
  part: Part,
  delta: string | undefined,
) {
  const isChild = ctx.childSessions.has(part.sessionID);
  const isParent = part.sessionID === ctx.sessionId;
  if (!isChild && !isParent) return;

  registerPart(ctx, part);

  if (part.type === "text") handleTextPart(ctx, part, delta, isParent);
  else if (part.type === "reasoning") handleReasoningPart(ctx, part, delta);
  else if (part.type === "tool") handleToolPart(ctx, part, isChild);
}
