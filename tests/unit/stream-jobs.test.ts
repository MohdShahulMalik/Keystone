// Intent: JOB_JSON extraction must (a) strip job lines from the narrative so
// the UI doesn't show them twice, (b) reassemble lines split across SSE
// chunks, (c) dedupe by title|company|url (case-insensitive), (d) emit/store
// main-agent jobs only, (e) queue validated jobs for DB persist.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@/lib/db";
import { createStreamCtx, flushJobPersistQueue } from "@/lib/research/stream";

const PARENT = "opencode-parent-1";

function makeCtx() {
  const sent: string[] = [];
  const ctx = createStreamCtx(PARENT, "db-1", "user-1", (t) => sent.push(t));
  ctx.persist = async () => {};
  ctx.persistToolUpdate = async () => {};
  return { ctx, sent };
}

function jobEvents(sent: string[]) {
  return sent
    .filter((s) => s.startsWith("event: job"))
    .map((s) => JSON.parse(s.split("\n")[1].replace("data: ", "")));
}

const JOB_A =
  'JOB_JSON: {"title":"Rust Engineer","company":"Acme","location":"Remote","description":"Build."}\n';
const JOB_A_DUP_DIFFERENT_CASE =
  'JOB_JSON: {"title":"rust engineer","company":"ACME","location":"Remote","description":"Build."}\n';

beforeEach(() => {
  (db as unknown as Record<string, unknown>).searchResult = {
    create: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).jobListing = {
    findMany: mock(async () => []),
    createMany: mock(async () => ({ count: 1 })),
  };
  (db as unknown as Record<string, unknown>).user = {
    upsert: mock(async () => ({})),
  };
});

describe("JOB_JSON line handling", () => {
  test("emits a job event and strips the line from the narrative", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: `Hello team\n${JOB_A}Back to narrative\n`,
    });
    const jobs = jobEvents(sent);
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toMatchObject({ title: "Rust Engineer", company: "Acme" });
    expect(jobs[0].seq).toBe(1);
    // narrative keeps surrounding text but not the JOB_JSON line
    expect(ctx.openSegments.get(PARENT)?.text).toContain("Hello team");
    expect(ctx.openSegments.get(PARENT)?.text).toContain("Back to narrative");
    expect(ctx.openSegments.get(PARENT)?.text).not.toContain("JOB_JSON");
  });

  test("reassembles a JOB_JSON line split across chunks", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { flushPendingJobs } = await import("@/lib/research/stream");
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    const full = JOB_A.trim();
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: full.slice(0, 20),
    });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: `${full.slice(20)}\n`,
    });
    expect(jobEvents(sent).length).toBe(1);
    flushPendingJobs(ctx); // must not double-emit
    expect(jobEvents(sent).length).toBe(1);
  });

  test("dedupes identical jobs case-insensitively within a session", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    for (const line of [JOB_A, JOB_A_DUP_DIFFERENT_CASE, JOB_A]) {
      handlePartDelta(ctx, {
        sessionID: PARENT,
        messageID: "m",
        partID: "p1",
        field: "text",
        delta: line,
      });
    }
    expect(jobEvents(sent).length).toBe(1);
  });

  test("treats same title+company with different url as distinct", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta:
        'JOB_JSON: {"title":"T","company":"C","location":"L","description":"D","url":"https://a.example"}\n',
    });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta:
        'JOB_JSON: {"title":"T","company":"C","location":"L","description":"D","url":"https://b.example"}\n',
    });
    expect(jobEvents(sent).length).toBe(2);
  });

  test("ignores malformed JOB_JSON without poisoning the stream", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: "JOB_JSON: not-json-at-all\n",
    });
    expect(jobEvents(sent).length).toBe(0);
    expect(ctx.openSegments.get(PARENT)?.text ?? "").not.toContain("JOB_JSON");
  });

  test("ignores JOB_JSON missing title/company", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { ctx, sent } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: 'JOB_JSON: {"location":"L","description":"D"}\n',
    });
    expect(jobEvents(sent).length).toBe(0);
  });

  test("writes a SearchResult row per emitted job (history contract)", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const create = mock(async () => ({}));
    (db as unknown as Record<string, unknown>).searchResult = { create };
    const { ctx } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: JOB_A,
    });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = (
      create.mock.calls[0] as unknown as Array<{ data: { sessionId: string } }>
    )[0];
    expect(arg.data.sessionId).toBe("db-1");
  });

  test("queues jobs for DB persist and flushes via bulkCreateJobsFromResearch", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    const { ctx } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: JOB_A,
    });
    expect(ctx.jobPersistQueue.get("db-1")?.length).toBe(1);
    await flushJobPersistQueue(ctx);
    expect(ctx.jobPersistQueue.get("db-1")?.length).toBe(0);
    const createMany = (
      db as unknown as { jobListing: { createMany: ReturnType<typeof mock> } }
    ).jobListing.createMany;
    expect(createMany).toHaveBeenCalled();
  });

  test("re-queues jobs when DB persist fails (no silent loss)", async () => {
    const { handlePartDelta } = await import("@/lib/research/stream");
    (db as unknown as Record<string, unknown>).jobListing = {
      findMany: mock(async () => {
        throw new Error("db down");
      }),
      createMany: mock(async () => ({})),
    };
    const { ctx } = makeCtx();
    ctx.parts.set("p1", { sessionId: PARENT, type: "text" });
    handlePartDelta(ctx, {
      sessionID: PARENT,
      messageID: "m",
      partID: "p1",
      field: "text",
      delta: JOB_A,
    });
    // flushJobPersistQueue catches the bulkCreate error, logs it, and
    // re-queues the batch at the head — nothing is silently dropped.
    await flushJobPersistQueue(ctx).catch(() => {});
    expect(ctx.jobPersistQueue.get("db-1")?.length).toBe(1);
  });
});
