// REPRO for production incident:
//   POST /research/job?sessionId=cmuvdt9f9007ab5ouovmfhxtp 200 in 220ms
//     (next.js: 6ms, application-code: 214ms)
//     └─ ƒ getSearchSessionHistory("cmuvdt9f9007ab5ouovmfhxtp") in 197ms
//        app/actions/search.ts
//   Error sending research prompt: [TypeError: fetch failed] {
//     [cause]: Error [HeadersTimeoutError]: Headers Timeout Error
//         at ignore-listed frames { code: 'UND_ERR_HEADERS_TIMEOUT' } }
// ---------------------------------------------------------------------------
// Flow: POST /research/job runs `startResearch` (app/actions/research.ts).
// It returns { sessionId } immediately and fires `sendResearchPrompt` in the
// background (research.ts:135 `.catch(...)`). The opencode SDK call
// `client.session.prompt` → fetch http://127.0.0.1:3211 never received
// response headers in time, so undici rejected with TypeError(fetch failed)
// caused by HeadersTimeoutError. The .catch logged it and marked the session
// failed — but the POST had already returned 200, and the stored error kept
// only "fetch failed" (cause stripped).
//
// Convention:
// - `REPRO:` passes now, documents the broken/lossy behavior.
// - `INTENT (FAILS now):` asserts the fixed behavior; fails now to pinpoint
//   where to fix.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const createResearchSession = mock(async (_m?: unknown) => ({
  id: "opencode-1",
}));
const deleteResearchSession = mock(async (_id: string) => {});
const sendResearchPrompt = mock(async (..._a: unknown[]) => ({ ok: true }));
const listAvailableModels = mock(async () => [{ id: "m" }]);
mock.module("@/lib/opencode/server", () => ({
  createResearchSession,
  deleteResearchSession,
  sendResearchPrompt,
  listAvailableModels,
}));

const hubEnsureStarted = mock(async () => {});
const hubRegister = mock(async (..._a: unknown[]) => {});
mock.module("@/lib/research/event-hub", () => ({
  ensureStarted: hubEnsureStarted,
  register: hubRegister,
}));

const { db } = await import("@/lib/db");
const research = await import("@/app/actions/research");
const searchActions = await import("@/app/actions/search");

const PREFS = { jobTypes: ["remote"], countries: ["USA"], skills: ["React"] };

function stub(models: Record<string, Record<string, unknown>>) {
  for (const [model, methods] of Object.entries(models)) {
    const target = (db as unknown as Record<string, object>)[model];
    if (target) Object.assign(target, methods);
    else (db as unknown as Record<string, object>)[model] = methods as object;
  }
}

function stubHealthyDb() {
  stub({
    resume: { findUnique: mock(async () => null) },
    searchSession: {
      create: mock(async (args: unknown) => ({
        id: "db-1",
        ...(args as { data: object }).data,
      })),
      findUnique: mock(async () => null),
      update: mock(async () => ({})),
    },
    researchSegment: { findMany: mock(async () => []) },
    searchResult: { findMany: mock(async () => []) },
  });
}

/** Exact prod shape: TypeError(fetch failed) caused by HeadersTimeoutError. */
function prodHeadersTimeoutError() {
  const cause = new Error("Headers Timeout Error") as Error & {
    code: string;
  };
  cause.name = "HeadersTimeoutError";
  cause.code = "UND_ERR_HEADERS_TIMEOUT";
  return new TypeError("fetch failed", { cause });
}

function prodConnectionRefusedError() {
  const cause = new Error("connect ECONNREFUSED 127.0.0.1:3211") as Error & {
    code: string;
  };
  cause.name = "Error";
  cause.code = "ECONNREFUSED";
  return new TypeError("fetch failed", { cause });
}

// Poll until fn stops throwing (background .catch runs off-microtask).
async function waitFor(fn: () => void, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      fn();
      return;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

let origConsoleError: typeof console.error | null = null;
let consoleErr: ReturnType<typeof mock> | null = null;

function promptErrorCalls() {
  return (consoleErr?.mock.calls ?? []).filter(
    (c) => c[0] === "Error sending research prompt:",
  );
}

function sessionUpdateMock() {
  return (db as unknown as { searchSession: { update: ReturnType<typeof mock> } })
    .searchSession.update;
}

beforeEach(() => {
  createResearchSession.mockClear();
  deleteResearchSession.mockClear();
  sendResearchPrompt.mockClear();
  listAvailableModels.mockClear();
  hubEnsureStarted.mockClear();
  hubRegister.mockClear();
  createResearchSession.mockImplementation(async (_m?: unknown) => ({
    id: "opencode-1",
  }));
  sendResearchPrompt.mockImplementation(async (..._a: unknown[]) => ({
    ok: true,
  }));
  stubHealthyDb();
  origConsoleError = console.error;
  consoleErr = mock(() => {});
  console.error = consoleErr as unknown as typeof console.error;
});

afterEach(() => {
  if (origConsoleError) console.error = origConsoleError;
  consoleErr = null;
  origConsoleError = null;
});

describe("REPRO: HeadersTimeoutError during background prompt send", () => {
  test("REPRO: prod TypeError(fetch failed) + HeadersTimeoutError cause reproduces the log", async () => {
    sendResearchPrompt.mockImplementation(async () => {
      throw prodHeadersTimeoutError();
    });
    await research.startResearch(PREFS);
    await waitFor(() => expect(sessionUpdateMock()).toHaveBeenCalled());

    const calls = promptErrorCalls();
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("Error sending research prompt:");
    const err = calls[0][1] as TypeError;
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toBe("fetch failed");
    const cause = (err as TypeError & { cause?: unknown }).cause as {
      name?: string;
      code?: string;
    };
    expect(cause?.name).toBe("HeadersTimeoutError");
    expect(cause?.code).toBe("UND_ERR_HEADERS_TIMEOUT");
  });

  test("REPRO: POST returns 200-style success BEFORE the prompt outcome is known", async () => {
    // startResearch returns ids synchronously; the prompt failure only lands
    // later via the background .catch → session.update. The client that POSTed
    // /research/job already got 200 with a sessionId for a session whose
    // prompt never sent.
    let rejectPrompt!: (e: unknown) => void;
    sendResearchPrompt.mockImplementation(
      () => new Promise((_res, rej) => void (rejectPrompt = rej)),
    );
    const result = await research.startResearch(PREFS);
    expect(result).toEqual({ sessionId: "db-1", openCodeSessionId: "opencode-1" });
    expect(sessionUpdateMock()).not.toHaveBeenCalled(); // not failed *yet*

    rejectPrompt(prodHeadersTimeoutError());
    await waitFor(() => expect(sessionUpdateMock()).toHaveBeenCalled());
    const arg = sessionUpdateMock().mock.calls[0][0] as {
      data: { status: string };
    };
    expect(arg.data.status).toBe("failed");
  });

  test("REPRO: stored session error strips the cause (only 'fetch failed' kept)", async () => {
    sendResearchPrompt.mockImplementation(async () => {
      throw prodHeadersTimeoutError();
    });
    await research.startResearch(PREFS);
    await waitFor(() => expect(sessionUpdateMock()).toHaveBeenCalled());

    const arg = sessionUpdateMock().mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; error: string };
    };
    expect(arg.where.id).toBe("db-1");
    expect(arg.data.status).toBe("failed");
    // research.ts:143 `error instanceof Error ? error.message : ...` keeps
    // just the outer TypeError message — the HeadersTimeoutError cause that
    // distinguishes "opencode overloaded" from "opencode down" is lost.
    expect(arg.data.error).toBe("fetch failed");
    expect(arg.data.error).not.toContain("HeadersTimeoutError");
    expect(arg.data.error).not.toContain("UND_ERR_HEADERS_TIMEOUT");
  });

  test("REPRO: prompt send is NOT retried (single attempt, unlike session create)", async () => {
    sendResearchPrompt.mockImplementation(async () => {
      throw prodHeadersTimeoutError();
    });
    await research.startResearch(PREFS);
    await waitFor(() => expect(sessionUpdateMock()).toHaveBeenCalled());
    // createResearchSession retries internally (cold-boot: v2 x2, v1 x3);
    // sendResearchPrompt gets exactly one shot — a transient headers timeout
    // is immediately terminal.
    expect(sendResearchPrompt).toHaveBeenCalledTimes(1);
  });

  test("REPRO: connection-refused takes the identical lossy path", async () => {
    sendResearchPrompt.mockImplementation(async () => {
      throw prodConnectionRefusedError();
    });
    await research.startResearch(PREFS);
    await waitFor(() => expect(sessionUpdateMock()).toHaveBeenCalled());
    expect(promptErrorCalls().length).toBe(1);
    const arg = sessionUpdateMock().mock.calls[0][0] as {
      data: { status: string; error: string };
    };
    expect(arg.data.status).toBe("failed");
    expect(arg.data.error).toBe("fetch failed"); // ECONNREFUSED also stripped
  });

  test("REPRO: slow history load dominates the request budget (197/220ms shape)", async () => {
    // getSearchSessionHistory = Promise.all(segments, results). A slow DB
    // makes history most of the request time; the prompt fetch then has no
    // headroom left before client/proxy timeouts.
    const DELAY_MS = 150;
    const delayed = (rows: unknown[]) =>
      mock(async () => {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        return rows;
      });
    stub({
      researchSegment: { findMany: delayed([{ seq: 1 }]) },
      searchResult: { findMany: delayed([{ id: "r1" }]) },
    });
    const t0 = Date.now();
    const history = await searchActions.getSearchSessionHistory("db-1");
    const elapsed = Date.now() - t0;
    expect(history.segments.length).toBe(1);
    expect(history.results.length).toBe(1);
    // Parallel (Promise.all): ~DELAY not 2xDELAY; but slow enough to dominate.
    expect(elapsed).toBeGreaterThanOrEqual(120);
    expect(elapsed).toBeLessThan(3000);
  });

  test("REPRO: raw undici error reaches the action catch unwrapped (throw site)", async () => {
    // Pins the throw-site contract without ESM surgery: server.ts does not
    // wrap/retry — research.ts .catch is the first handler, which is why the
    // prod log line names research.ts ("Error sending research prompt:").
    const raw = prodHeadersTimeoutError();
    sendResearchPrompt.mockImplementation(async () => {
      throw raw;
    });
    await research.startResearch(PREFS);
    await waitFor(() => expect(promptErrorCalls().length).toBe(1));
    expect(promptErrorCalls()[0][1]).toBe(raw);
    expect(
      (promptErrorCalls()[0][1] as TypeError & { cause?: unknown }).cause,
    ).toBe(raw.cause);
  });

  test("INTENT (FAILS now): stored error should preserve the timeout cause", async () => {
    sendResearchPrompt.mockImplementation(async () => {
      throw prodHeadersTimeoutError();
    });
    await research.startResearch(PREFS);
    await waitFor(() => expect(sessionUpdateMock()).toHaveBeenCalled());
    const arg = sessionUpdateMock().mock.calls[0][0] as {
      data: { error: string };
    };
    // Desired: error names the cause so on-call can tell "opencode slow"
    // from "opencode down". Current code stores just "fetch failed".
    expect(
      arg.data.error.includes("UND_ERR_HEADERS_TIMEOUT") ||
        arg.data.error.includes("HeadersTimeoutError") ||
        arg.data.error.includes("Headers Timeout"),
    ).toBe(true);
  });

  test("INTENT (FAILS now): transient headers timeout should be retried, not immediately terminal", async () => {
    let calls = 0;
    sendResearchPrompt.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw prodHeadersTimeoutError();
      return { ok: true };
    });
    await research.startResearch(PREFS);
    // Give a retry policy (if one existed) time to fire a 2nd attempt.
    await new Promise((r) => setTimeout(r, 500));
    // Desired: >=2 attempts on transient timeout. Current: exactly 1, then
    // session marked failed.
    expect(sendResearchPrompt).toHaveBeenCalledTimes(2);
  });
});
