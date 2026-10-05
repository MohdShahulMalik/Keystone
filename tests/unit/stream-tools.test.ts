// Intent: tool lifecycle — running tools emit once and create a persist row;
// completing a known tool updates that row in place (no duplicate rows);
// task tools spawn SubagentSession rows and subagent.* events; errors emit
// tool.error and persist an ✗ row. Hub events route every global opencode
// event to the owning session only.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@/lib/db";
import {
  completeSearchSession,
  createStreamCtx,
  failSearchSession,
  handleHubEvent,
  handleToolCompleted,
  handleToolError,
  handleToolRunning,
} from "@/lib/research/stream";

const PARENT = "opencode-parent-1";

function makeCtx() {
  const sent: string[] = [];
  const ctx = createStreamCtx(PARENT, "db-1", "user-1", (t) => sent.push(t));
  const persisted: Array<{ kind: string; text: string; toolId?: string }> = [];
  const updated: Array<{ seq: number; text: string }> = [];
  ctx.persist = async (_sid, kind, text, toolId) => {
    persisted.push({ kind, text, toolId });
  };
  ctx.persistToolUpdate = async (_sid, seq, text) => {
    updated.push({ seq, text });
  };
  return { ctx, sent, persisted, updated };
}

function toolPart(overrides: Record<string, unknown> = {}) {
  return {
    id: "tool-1",
    sessionID: PARENT,
    messageID: "m",
    type: "tool",
    tool: "webfetch",
    state: {
      status: "running",
      input: { url: "https://example.com/j" },
      title: "Webfetch",
      time: { start: 1000 },
    },
    ...overrides,
  } as never;
}

function eventsOf(sent: string[]) {
  return sent.map((s) => s.split("\n")[0].replace("event: ", ""));
}

beforeEach(() => {
  (db as unknown as Record<string, unknown>).subagentSession = {
    upsert: mock(async () => ({})),
    update: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).searchSession = {
    findUnique: mock(async () => ({ status: "running" })),
    update: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).searchResult = {
    count: mock(async () => 3),
    create: mock(async () => ({})),
  };
  // job persist path (dynamic import of actions/jobs -> db.jobListing)
  (db as unknown as Record<string, unknown>).jobListing = {
    findMany: mock(async () => []),
    createMany: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).user = {
    upsert: mock(async () => ({})),
  };
});

describe("handleToolRunning", () => {
  test("emits tool.started once even if the same part arrives twice", async () => {
    const { ctx, sent, persisted } = makeCtx();
    const part = toolPart();
    await handleToolRunning(ctx, part, false);
    await handleToolRunning(ctx, part, false);
    expect(eventsOf(sent).filter((e) => e === "tool.started").length).toBe(1);
    expect(persisted.filter((p) => p.kind === "tool").length).toBe(1);
  });

  test("webfetch display text includes the fetched URL", async () => {
    const { ctx, persisted } = makeCtx();
    await handleToolRunning(ctx, toolPart(), false);
    expect(persisted[0].text).toContain("https://example.com/j");
  });

  test("task tool registers the child session and emits subagent.started", async () => {
    const { ctx, sent } = makeCtx();
    const upsert = (
      db as unknown as { subagentSession: { upsert: ReturnType<typeof mock> } }
    ).subagentSession.upsert;
    const part = toolPart({
      id: "task-tool-1",
      tool: "task",
      state: {
        status: "running",
        title: "Search slice",
        input: { description: "Rust jobs USA", subagent_type: "explore" },
        metadata: { sessionId: "child-abc" },
        time: { start: 1000 },
      },
    });
    await handleToolRunning(ctx, part, false);
    expect(ctx.childSessions.get("child-abc")).toBe("task-tool-1");
    expect(eventsOf(sent)).toContain("subagent.started");
    expect(upsert).toHaveBeenCalled();
    const arg = upsert.mock.calls[0][0] as {
      create: { parentId: string; sessionId: string; status: string };
    };
    expect(arg.create.parentId).toBe("db-1");
    expect(arg.create.status).toBe("running");
  });

  test("task tool without metadata sessionId emits tool.started but no subagent", async () => {
    const { ctx, sent } = makeCtx();
    await handleToolRunning(
      ctx,
      toolPart({
        tool: "task",
        state: {
          status: "running",
          title: "t",
          input: {},
          metadata: {},
          time: { start: 1 },
        },
      }),
      false,
    );
    expect(eventsOf(sent)).toContain("tool.started");
    expect(eventsOf(sent)).not.toContain("subagent.started");
  });
});

describe("handleToolCompleted / handleToolError", () => {
  test("completed known tool updates the running row in place (update, not create)", async () => {
    const { ctx, persisted, updated, sent } = makeCtx();
    await handleToolRunning(ctx, toolPart(), false);
    persisted.length = 0;
    await handleToolCompleted(
      ctx,
      toolPart({
        state: {
          status: "completed",
          title: "Webfetch",
          input: { url: "https://example.com/j" },
          output: "page body",
          time: { start: 1000, end: 2500 },
        },
      }),
    );
    expect(persisted.length).toBe(0); // in-place update path
    expect(updated.length).toBe(1);
    expect(updated[0].text).toContain("✓");
    expect(updated[0].text).toContain("1s");
    expect(eventsOf(sent)).toContain("tool.completed");
  });

  test("completed unknown tool (no running record) creates a new row", async () => {
    const { ctx, persisted, updated } = makeCtx();
    await handleToolCompleted(
      ctx,
      toolPart({
        id: "orphan-tool",
        state: {
          status: "completed",
          title: "Websearch",
          input: {},
          output: "results",
          time: { start: 1000, end: 2000 },
        },
      }),
    );
    expect(updated.length).toBe(0);
    expect(persisted.length).toBe(1);
  });

  test("task completion marks the subagent row completed", async () => {
    const { ctx, sent } = makeCtx();
    const update = (
      db as unknown as { subagentSession: { update: ReturnType<typeof mock> } }
    ).subagentSession.update;
    await handleToolCompleted(
      ctx,
      toolPart({
        id: "task-tool-9",
        tool: "task",
        state: {
          status: "completed",
          title: "Slice",
          input: { description: "d" },
          output: "done",
          metadata: { sessionId: "child-xyz" },
          time: { start: 1000, end: 61000 },
        },
      }),
    );
    expect(eventsOf(sent)).toContain("subagent.completed");
    expect(update).toHaveBeenCalled();
  });

  test("error persists ✗ row and emits tool.error", async () => {
    const { ctx, sent, updated } = makeCtx();
    await handleToolRunning(ctx, toolPart(), false);
    await handleToolError(
      ctx,
      toolPart({
        state: {
          status: "error",
          error: "fetch failed",
          time: { start: 1, end: 2 },
        },
      }),
    );
    expect(updated[0].text).toContain("✗");
    expect(eventsOf(sent)).toContain("tool.error");
  });
});

describe("completeSearchSession / failSearchSession", () => {
  test("complete counts results and marks completed", async () => {
    await completeSearchSession("db-1");
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    expect(update).toHaveBeenCalled();
    const arg = update.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; resultCount: number };
    };
    expect(arg.data.status).toBe("completed");
    expect(arg.data.resultCount).toBe(3);
  });

  test("complete is idempotent when already completed", async () => {
    (db as unknown as Record<string, unknown>).searchSession = {
      findUnique: mock(async () => ({ status: "completed" })),
      update: mock(async () => ({})),
    };
    await completeSearchSession("db-1");
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    expect(update).not.toHaveBeenCalled();
  });

  test("complete is a no-op for unknown sessions", async () => {
    (db as unknown as Record<string, unknown>).searchSession = {
      findUnique: mock(async () => null),
      update: mock(async () => ({})),
    };
    await completeSearchSession("missing");
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    expect(update).not.toHaveBeenCalled();
  });

  test("fail marks failed with the error message", async () => {
    await failSearchSession("db-1", "boom");
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    const arg = update.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; error: string };
    };
    expect(arg.data.status).toBe("failed");
    expect(arg.data.error).toBe("boom");
  });

  test("fail never overwrites a completed session", async () => {
    (db as unknown as Record<string, unknown>).searchSession = {
      findUnique: mock(async () => ({ status: "completed" })),
      update: mock(async () => ({})),
    };
    await failSearchSession("db-1", "late error");
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    expect(update).not.toHaveBeenCalled();
  });
});

describe("handleHubEvent routing", () => {
  test("message.updated for a completed assistant message flushes + completes + done", async () => {
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    // seed an open segment so flush has something to send
    const { handlePartDelta } = await import("@/lib/research/stream");
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: "summary",
    });
    await handleHubEvent(ctx, {
      type: "message.updated",
      properties: {
        info: {
          sessionID: PARENT,
          role: "assistant",
          id: "msg-1",
          time: { completed: "x" },
        },
      },
    } as never);
    const evts = eventsOf(sent);
    expect(evts).toContain("message.completed");
    expect(evts).toContain("done");
  });

  test("message.updated for other sessions/roles is ignored", async () => {
    const { ctx, sent } = makeCtx();
    await handleHubEvent(ctx, {
      type: "message.updated",
      properties: {
        info: {
          sessionID: "other",
          role: "assistant",
          id: "m",
          time: { completed: 1 },
        },
      },
    } as never);
    await handleHubEvent(ctx, {
      type: "message.updated",
      properties: {
        info: {
          sessionID: PARENT,
          role: "user",
          id: "m",
          time: { completed: 1 },
        },
      },
    } as never);
    expect(sent.length).toBe(0);
  });

  test("session.idle completes the session and emits status + done", async () => {
    const { ctx, sent } = makeCtx();
    await handleHubEvent(ctx, {
      type: "session.idle",
      properties: { sessionID: PARENT },
    } as never);
    expect(eventsOf(sent)).toContain("done");
  });

  test("session.error fails the session and emits error", async () => {
    const { ctx, sent } = makeCtx();
    await handleHubEvent(ctx, {
      type: "session.error",
      properties: { sessionID: PARENT, error: "crashed" },
    } as never);
    expect(eventsOf(sent)).toContain("error");
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    expect(update).toHaveBeenCalled();
  });

  test("session.status forwards only for the owning session", async () => {
    const { ctx, sent } = makeCtx();
    await handleHubEvent(ctx, {
      type: "session.status",
      properties: { sessionID: "other", status: "busy" },
    } as never);
    expect(sent.length).toBe(0);
    await handleHubEvent(ctx, {
      type: "session.status",
      properties: { sessionID: PARENT, status: "busy" },
    } as never);
    expect(eventsOf(sent)).toContain("status");
  });
});
