// REPRO for production incident:
//   GET /api/research/stream?sessionId=ses_...&sinceSeq=0 200 in 4.5min
//     (next.js: 203ms, application-code: 4.5min)
//   [research] flushJobPersistQueue failed ErrorEvent {
//     type: 'error', defaultPrevented: false, cancelable: false,
//     timeStamp: 482755.217454 }
// ---------------------------------------------------------------------------
// What this file does:
// - Recreates the exact log line by making the DB layer reject with a DOM
//   `ErrorEvent` (the same shape as production) during `flushJobPersistQueue`.
// - Shows the blast radius: infinite requeue with no retry bound/backoff,
//   opaque log with zero session/batch context, terminal handlers that still
//   emit `done` + mark the session completed even though JobListing rows were
//   never written (the 4.5min "hang then done with missing jobs" shape).
//
// Convention below:
// - `REPRO:` tests PASS against current code and document the broken behavior.
//   They are the "somehow recreate this situation" part.
// - `INTENT (FAILS now):` tests assert the behavior a fix should provide.
//   They FAIL against current code on purpose — that failure pinpoints where
//   to fix. Delete or flip them once fixed.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@/lib/db";
import {
  createStreamCtx,
  flushJobPersistQueue,
  handlePartDelta,
  type StreamCtx,
} from "@/lib/research/stream";

const PARENT = "ses_ef3a20614ffeGFhnLAr8UqZSXH"; // opencode session from prod log
const DB_SESSION = "db-ses-repro-1";
const USER = "user-repro-1";

function makeCtx() {
  const sent: string[] = [];
  const ctx = createStreamCtx(PARENT, DB_SESSION, USER, (t) => sent.push(t));
  ctx.persist = async () => {};
  ctx.persistToolUpdate = async () => {};
  return { ctx, sent };
}

function jobLine(i: number, extra: Record<string, unknown> = {}) {
  return (
    `JOB_JSON: ${JSON.stringify({
      title: `Engineer ${i}`,
      company: `Acme ${i}`,
      location: "Remote",
      description: `Build ${i}.`,
      url: `https://a.example/j/${i}`,
      ...extra,
    })}\n`
  );
}

function feedJob(ctx: StreamCtx, partId: string, line: string) {
  ctx.parts.set(partId, { sessionId: PARENT, type: "text" });
  handlePartDelta(ctx, {
    sessionID: PARENT,
    messageID: "m",
    partID: partId,
    field: "text",
    delta: line,
  });
}

/** The exact non-Error shape seen in production logs. */
function prodErrorEvent() {
  // DOM ErrorEvent — note: no `.code`, often no useful `.message`/`.stack`
  // once serialized by console.error, which is why the prod log is opaque.
  return new ErrorEvent("error", {
    message: "Script error.",
    filename: "",
    lineno: 0,
    colno: 0,
  });
}

// ---- console.error capture (flushJobPersistQueue logs here) ----
let consoleErr: ReturnType<typeof mock> | null = null;
let origConsoleError: typeof console.error | null = null;

function captureConsoleError() {
  origConsoleError = console.error;
  consoleErr = mock(() => {});
  console.error = consoleErr as unknown as typeof console.error;
  return consoleErr;
}

function flushErrorCalls() {
  return (consoleErr?.mock.calls ?? []).filter(
    (c) => c[0] === "[research] flushJobPersistQueue failed",
  );
}

function stubHealthyDb(opts: {
  persistImpl?: (args: unknown) => Promise<unknown>;
} = {}) {
  const persistImpl =
    opts.persistImpl ?? (async () => ({ _max: { seq: null } }));
  (db as unknown as Record<string, unknown>).searchResult = {
    create: mock(async () => ({})),
    findMany: mock(async () => []),
    count: mock(async () => 0),
  };
  (db as unknown as Record<string, unknown>).user = {
    upsert: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).jobListing = {
    findMany: mock(async () => []),
    createMany: mock(async () => ({ count: 1 })),
  };
  (db as unknown as Record<string, unknown>).searchSession = {
    findUnique: mock(async () => ({ status: "running" })),
    update: mock(async () => ({})),
  };
  (db as unknown as Record<string, unknown>).researchSegment = {
    aggregate: persistImpl as unknown,
    findMany: mock(async () => []),
  };
}

/** Make ONLY the job-persist read fail with an ErrorEvent (prod shape). */
function stubErrorEventOnJobFindMany() {
  stubHealthyDb();
  (db as unknown as Record<string, unknown>).jobListing = {
    findMany: mock(async () => {
      throw prodErrorEvent();
    }),
    createMany: mock(async () => ({ count: 1 })),
  };
}

function clearJobTimers(ctx: StreamCtx) {
  for (const t of ctx.jobPersistTimers.values()) clearTimeout(t);
  ctx.jobPersistTimers.clear();
}

beforeEach(() => {
  captureConsoleError();
  stubHealthyDb();
});

afterEach(() => {
  if (origConsoleError) console.error = origConsoleError;
  consoleErr = null;
  origConsoleError = null;
});

describe("REPRO: production log line — flushJobPersistQueue failed ErrorEvent", () => {
  test("REPRO: DB rejecting with ErrorEvent reproduces the exact prod log", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(1);

      await flushJobPersistQueue(ctx); // must not throw — it catches + logs

      const calls = flushErrorCalls();
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe("[research] flushJobPersistQueue failed");
      const logged = calls[0][1] as ErrorEvent;
      // Same shape as the production log excerpt.
      expect(logged).toBeInstanceOf(ErrorEvent);
      expect((logged as unknown as { type: string }).type).toBe("error");
    } finally {
      clearJobTimers(ctx);
    }
  });

  test("REPRO: logged ErrorEvent carries no actionable diagnostics", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      await flushJobPersistQueue(ctx);

      const calls = flushErrorCalls();
      expect(calls.length).toBe(1);
      const [msg, err] = calls[0] as [string, ErrorEvent];
      expect(msg).toBe("[research] flushJobPersistQueue failed");
      // The log has no session/user/batch context — grepping prod logs for
      // the sessionId finds nothing, which is why the 4.5min stream could
      // not be correlated to a root cause.
      expect(msg).not.toContain(DB_SESSION);
      expect(msg).not.toContain(USER);
      expect(JSON.stringify(msg)).not.toContain("batch");
      // ErrorEvent itself is opaque once serialized (generic "Script error.").
      expect(err instanceof ErrorEvent).toBe(true);
      expect(typeof (err as unknown as { timeStamp?: unknown }).timeStamp).toBe(
        "number",
      );
    } finally {
      clearJobTimers(ctx);
    }
  });

  test("REPRO: non-Error throw (string / DOMException) takes the same opaque path", async () => {
    stubHealthyDb();
    (db as unknown as Record<string, unknown>).jobListing = {
      findMany: mock(async () => {
        // Neon/prisma/fetch layers can reject with non-Errors under load.
        throw "connection reset";
      }),
      createMany: mock(async () => ({ count: 1 })),
    };
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      await flushJobPersistQueue(ctx); // resolves, does not propagate
      expect(flushErrorCalls().length).toBe(1);
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(1);
    } finally {
      clearJobTimers(ctx);
    }
  });
});

describe("REPRO: infinite requeue — the 4.5min stall shape", () => {
  test("REPRO: failed batch is requeued at head, so every retry re-attempts the same work", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      feedJob(ctx, "p2", jobLine(2));
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(2);

      await flushJobPersistQueue(ctx);
      expect(flushErrorCalls().length).toBe(1);
      // Nothing drained — same 2 jobs back at the head.
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(2);

      await flushJobPersistQueue(ctx);
      expect(flushErrorCalls().length).toBe(2);
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(2);
    } finally {
      clearJobTimers(ctx);
    }
  });

  test("REPRO: sustained outage => queue grows without bound while stream stays open", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      // Simulate a long research run (prod: 4.5min of JOB_JSON output)
      // where the DB is down the whole time: 20 jobs stream in, each
      // terminal/timer flush fails and requeues.
      for (let i = 0; i < 20; i++) feedJob(ctx, `p${i}`, jobLine(i));
      // Feeding >=8 jobs fires fire-and-forget batch flushes + arms the
      // 1200ms timer. Let those settle, then isolate the 5 manual terminal
      // flushes below so the count is deterministic.
      await new Promise((r) => setTimeout(r, 50));
      clearJobTimers(ctx);
      consoleErr?.mockClear();
      // Below BATCH_SIZE jobs sit behind the 1200ms timer; force-flush like
      // the session.idle / message.updated terminal path does.
      for (let attempt = 0; attempt < 5; attempt++) {
        await flushJobPersistQueue(ctx);
      }
      // 5 failed flushes, 0 jobs persisted, queue still holds all 20.
      expect(flushErrorCalls().length).toBe(5);
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(20);
      const createMany = (
        db as unknown as { jobListing: { createMany: ReturnType<typeof mock> } }
      ).jobListing.createMany;
      expect(createMany).not.toHaveBeenCalled();
    } finally {
      clearJobTimers(ctx);
    }
  });

  test("REPRO: batch-size trigger (8 jobs) fire-and-forgets a failing flush", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      // enqueueJobForPersist calls `void flushJobPersistQueue(ctx)` once the
      // queue hits JOB_PERSIST_BATCH_SIZE (8) — fire-and-forget, so the
      // failure only surfaces via console.error, never to the caller.
      for (let i = 0; i < 8; i++) feedJob(ctx, `p${i}`, jobLine(i));
      // Let the void flush settle.
      await new Promise((r) => setTimeout(r, 50));
      expect(flushErrorCalls().length).toBeGreaterThanOrEqual(1);
      // Batch requeued instead of dropped — next flush will retry the same 8.
      expect(
        (ctx.jobPersistQueue.get(DB_SESSION)?.length ?? 0),
      ).toBeGreaterThanOrEqual(8);
    } finally {
      clearJobTimers(ctx);
    }
  });

  test("REPRO: 1200ms timer flush fails the same way (background, no caller)", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1)); // < batch size => timer path
      expect(ctx.jobPersistTimers.has(DB_SESSION)).toBe(true);
      await new Promise((r) => setTimeout(r, 1500));
      expect(flushErrorCalls().length).toBeGreaterThanOrEqual(1);
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(1);
    } finally {
      clearJobTimers(ctx);
    }
  }, 5000);

  test("INTENT (FAILS now): retries should be bounded (no infinite requeue)", async () => {
    stubErrorEventOnJobFindMany();
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      // A fixed policy (e.g. max 3 attempts, then dead-letter + surface)
      // would keep a 4.5min outage from retrying forever.
      for (let i = 0; i < 10; i++) await flushJobPersistQueue(ctx);
      // Desired: queue eventually drained/dropped or error propagated.
      // Current: still holding the job after 10 failures.
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(0);
    } finally {
      clearJobTimers(ctx);
    }
  });
});

describe("REPRO: terminal handlers report success despite persist failure", () => {
  async function emitSessionIdle(ctx: StreamCtx) {
    const { handleHubEvent } = await import("@/lib/research/stream");
    await handleHubEvent(ctx, {
      type: "session.idle",
      properties: { sessionID: PARENT },
    } as never);
  }

  test("REPRO: session.idle sends done + completes session while jobs never persisted", async () => {
    stubErrorEventOnJobFindMany();
    // completeSearchSession path: session still running, zero results.
    (db as unknown as Record<string, unknown>).searchSession = {
      findUnique: mock(async () => ({ status: "running" })),
      update: mock(async () => ({})),
    };
    const { ctx, sent } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      await emitSessionIdle(ctx);

      expect(flushErrorCalls().length).toBeGreaterThanOrEqual(1);
      // Jobs still queued — JobListing.createMany never succeeded.
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(1);
      const createMany = (
        db as unknown as { jobListing: { createMany: ReturnType<typeof mock> } }
      ).jobListing.createMany;
      expect(createMany).not.toHaveBeenCalled();
      // ...but the client was told the stream is done and the session was
      // marked completed — the "200 in 4.5min, jobs missing" shape.
      expect(sent.join("")).toContain("event: done");
      const update = (
        db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
      ).searchSession.update;
      expect(update).toHaveBeenCalled();
    } finally {
      clearJobTimers(ctx);
    }
  });

  test("INTENT (FAILS now): terminal flush failure should not report clean done", async () => {
    stubErrorEventOnJobFindMany();
    (db as unknown as Record<string, unknown>).searchSession = {
      findUnique: mock(async () => ({ status: "running" })),
      update: mock(async () => ({})),
    };
    const { ctx, sent } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      await emitSessionIdle(ctx);
      // Desired: either no `done`, an `error` event, or the session marked
      // failed/incomplete while jobs are still queued. Current code sends a
      // clean `done`, so this fails and pinpoints handleHubEvent.
      const hasQueued = (ctx.jobPersistQueue.get(DB_SESSION)?.length ?? 0) > 0;
      const sentDone = sent.join("").includes("event: done");
      expect(!(hasQueued && sentDone)).toBe(true);
    } finally {
      clearJobTimers(ctx);
    }
  });
});

describe("REPRO: dynamic-import failure takes the same requeue path", () => {
  test("REPRO: documents that flushJobPersistQueue swallows import errors identically", async () => {
    // stream.ts does `await import("@/app/actions/jobs")` inside the same
    // try/catch. If that import throws (HMR/restart/version skew — common
    // around long-lived SSE connections), the batch is requeued and the log
    // line is identical, hiding whether the DB or the import failed.
    stubHealthyDb();
    const { ctx } = makeCtx();
    try {
      feedJob(ctx, "p1", jobLine(1));
      // Force the catch block directly with a non-DB throw by breaking the
      // persist read with an import-like error.
      (db as unknown as Record<string, unknown>).jobListing = {
        findMany: mock(async () => {
          throw new Error("Cannot find module '@/app/actions/jobs'");
        }),
        createMany: mock(async () => ({ count: 1 })),
      };
      await flushJobPersistQueue(ctx);
      expect(flushErrorCalls().length).toBe(1);
      expect(ctx.jobPersistQueue.get(DB_SESSION)?.length).toBe(1);
      // Log line is indistinguishable from the DB-down case above — that
      // ambiguity is the diagnostic gap to fix (include error source +
      // batch context in the log).
      expect(flushErrorCalls()[0][0]).toBe(
        "[research] flushJobPersistQueue failed",
      );
    } finally {
      clearJobTimers(ctx);
    }
  });
});
