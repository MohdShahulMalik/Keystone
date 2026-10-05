// Intent: lib/research/stream.ts is the SSE pipeline. `sse()` frames events;
// `createStreamCtx` owns per-session buffers/seq/dedup state; `flush` emits
// coalesced text deltas; `commitOpenSegment` (via reasoning-end / tool
// boundaries) persists exactly once with monotonic seq.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@/lib/db";
import {
  createStreamCtx,
  flush,
  flushPendingJobs,
  handlePartDelta,
  handleReasoningPart,
  sse,
} from "@/lib/research/stream";

const PARENT = "opencode-parent-1";
const DB_SESSION = "db-session-1";

function makeCtx() {
  const sent: string[] = [];
  const ctx = createStreamCtx(PARENT, DB_SESSION, "user-1", (t) =>
    sent.push(t),
  );
  const persisted: Array<{
    sid: string;
    kind: string;
    text: string;
    toolId?: string;
  }> = [];
  const updated: Array<{ sid: string; seq: number; text: string }> = [];
  ctx.persist = async (sid, kind, text, toolId) => {
    persisted.push({ sid, kind, text, toolId });
  };
  ctx.persistToolUpdate = async (sid, seq, text) => {
    updated.push({ sid, seq, text });
  };
  return { ctx, sent, persisted, updated };
}

function parseSse(raw: string): { event: string; data: unknown } {
  const [eventLine, dataLine] = raw.split("\n");
  return {
    event: eventLine.replace("event: ", ""),
    data: JSON.parse(dataLine.replace("data: ", "")),
  };
}

beforeEach(() => {
  // tryEmitSingleJob + tool handlers touch the DB directly — neutralize.
  (db as unknown as Record<string, unknown>).searchResult = {
    create: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).subagentSession = {
    upsert: mock(async () => ({})),
    update: mock(async () => ({})),
  };
});

describe("sse framing", () => {
  test("frames event + JSON payload with double newline", () => {
    expect(sse("chunk", { text: "hi", seq: 1 })).toBe(
      'event: chunk\ndata: {"text":"hi","seq":1}\n\n',
    );
  });
});

describe("createStreamCtx — initial state", () => {
  test("starts with empty buffers, maps and sets", () => {
    const { ctx } = makeCtx();
    expect(ctx.sessionId).toBe(PARENT);
    expect(ctx.dbSessionId).toBe(DB_SESSION);
    expect(ctx.openSegments.size).toBe(0);
    expect(ctx.seq.size).toBe(0);
    expect(ctx.emittedTools.size).toBe(0);
    expect(ctx.emittedJobKeys.size).toBe(0);
  });
});

describe("handlePartDelta — routing and buffering", () => {
  test("ignores non-text fields", () => {
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "image",
      delta: "x",
    });
    expect(ctx.openSegments.size).toBe(0);
    expect(sent.length).toBe(0);
  });

  test("ignores sessions that are neither parent nor child", () => {
    const { ctx } = makeCtx();
    ctx.parts.set("p1", { sessionId: "stranger", type: "text" });
    handlePartDelta(ctx, {
      sessionID: "stranger",
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: "hello",
    });
    expect(ctx.openSegments.size).toBe(0);
  });

  test("queues deltas arriving before the part type is known, then delivers", async () => {
    const { ctx } = makeCtx();
    // delta first (part unseen) -> queued
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "late-part",
      field: "text",
      delta: "hello ",
    });
    expect(ctx.pendingDeltas.get("late-part")).toEqual(["hello "]);
    // part update registers the part and drains the queue (no delta arg needed)
    const { handlePartUpdated } = await import("@/lib/research/stream");
    await handlePartUpdated(
      ctx,
      {
        id: "late-part",
        sessionID: PARENT,
        messageID: "m",
        type: "text",
      } as never,
      undefined,
    );
    expect(ctx.pendingDeltas.has("late-part")).toBe(false);
    expect(ctx.openSegments.get(PARENT)?.text).toBe("hello ");
  });

  test("reasoning deltas coalesce into a thinking segment", async () => {
    const { ctx, sent } = makeCtx();
    ctx.parts.set("r1", { sessionId: PARENT, type: "reasoning" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "r1",
      field: "text",
      delta: "thinking...",
    });
    expect(ctx.openSegments.get(PARENT)?.kind).toBe("thinking");
    await flush(ctx);
    expect(sent.join("")).toContain("thinking");
  });
});

describe("flush — live delta emission", () => {
  test("emits only the unsent tail on repeated flushes (no duplicates)", async () => {
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: "abc",
    });
    await flush(ctx);
    const first = sent.join("");
    await flush(ctx);
    expect(sent.join("")).toBe(first); // second flush sends nothing new
    expect(first).toContain("abc");
  });

  test("child session deltas emit as subagent.chunk, parent as chunk", async () => {
    const { ctx, sent } = makeCtx();
    const child = "child-1";
    ctx.childSessions.set(child, "tool-1");
    ctx.parts.set("pc", { sessionId: child, type: "text" });
    ctx.parts.set("pp", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: child,
      messageID: "m",
      partID: "pc",
      field: "text",
      delta: "child-text",
    });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "pp",
      field: "text",
      delta: "parent-text",
    });
    await flush(ctx);
    const events = sent.map(parseSse);
    expect(events.some((e) => e.event === "subagent.chunk")).toBe(true);
    expect(events.some((e) => e.event === "chunk")).toBe(true);
  });
});

describe("commitOpenSegment via reasoning end", () => {
  test("persists thinking segment once with seq 1 and clears the buffer", async () => {
    const { ctx, persisted } = makeCtx();
    ctx.parts.set("r1", { sessionId: PARENT, type: "reasoning" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "r1",
      field: "text",
      delta: "deep thought",
    });
    await handleReasoningPart(
      ctx,
      {
        id: "r1",
        sessionID: PARENT,
        messageID: "m",
        type: "reasoning",
        time: { start: 1, end: 2 },
      } as never,
      undefined,
    );
    expect(persisted.length).toBe(1);
    expect(persisted[0]).toMatchObject({
      kind: "thinking",
      text: "deep thought",
    });
    expect(ctx.seq.get(PARENT)).toBe(1);
    expect(ctx.openSegments.has(PARENT)).toBe(false);
  });

  test("reasoning without end time does not commit", async () => {
    const { ctx, persisted } = makeCtx();
    await handleReasoningPart(
      ctx,
      {
        id: "r1",
        sessionID: PARENT,
        messageID: "m",
        type: "reasoning",
        time: { start: 1 },
      } as never,
      "partial",
    );
    expect(persisted.length).toBe(0);
    expect(ctx.openSegments.get(PARENT)?.text).toBe("partial");
  });
});

describe("flushPendingJobs — tail without trailing newline", () => {
  test("emits a JOB_JSON line buffered without newline at stream end", () => {
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta:
        'JOB_JSON: {"title":"T","company":"C","location":"L","description":"D"}',
    });
    // no newline yet -> buffered, nothing emitted
    expect(sent.join("")).not.toContain('"title":"T"');
    flushPendingJobs(ctx);
    expect(sent.join("")).toContain("job");
  });

  test("silently drops subagent JOB_JSON tails (main-agent-only contract)", () => {
    const { ctx, sent } = makeCtx();
    const child = "child-9";
    ctx.childSessions.set(child, "tool-9");
    ctx.parts.set("pc", { sessionId: child, type: "text" });
    handlePartDelta(ctx, {
      sessionID: child,
      messageID: "m",
      partID: "pc",
      field: "text",
      delta:
        'JOB_JSON: {"title":"T","company":"C","location":"L","description":"D"}',
    });
    flushPendingJobs(ctx);
    expect(sent.join("")).not.toContain("event: job");
  });
});
