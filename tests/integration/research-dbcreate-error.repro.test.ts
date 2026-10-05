// REPRO for production incident:
//   POST /research/job 200 in 12.2s (next.js: 75ms, application-code: 12.1s)
//     └─ ƒ getAvailableModelsAction() in 12005ms app/actions/research.ts
//   [research] stage=db-create error= ErrorEvent {
//     type: 'error', defaultPrevented: false, cancelable: false,
//     timeStamp: 115394.001362 }
//   ⨯ Error: Failed to save research session
//       at startResearch (app/actions/research.ts:201:11)
//   POST /research/job 500 in 2.0s … ƒ startResearch({…}) in 1335ms
//   UI banner: "Failed to save research session" (see screenshot)
// ---------------------------------------------------------------------------
// Flow: `startResearch` (app/actions/research.ts:40-152) created the remote
// opencode session OK, then `db.searchSession.create` rejected with the SAME
// DOM `ErrorEvent` shape as the flushJobPersistQueue incident (Neon WS/fetch
// layer rejecting with the raw event, not an Error). The stage=db-create
// catch logged it, compensated via `deleteResearchSession(opencodeId)`, and
// threw generic "Failed to save research session" — the exact UI banner.
// Separately, `getAvailableModelsAction()` took 12s (opencode model.list +
// provider.list hung; no timeout), blocking the model dropdown first.
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

const PREFS = { jobTypes: ["Remote"], countries: ["Test"], skills: ["React"] };

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
  });
}

/** Exact prod shape at stage=db-create (same signature as the flush incident). */
function prodDbErrorEvent() {
  return new ErrorEvent("error", {
    message: "Script error.",
    filename: "",
    lineno: 0,
    colno: 0,
  });
}

let origConsoleError: typeof console.error | null = null;
let consoleErr: ReturnType<typeof mock> | null = null;

function dbCreateErrorCalls() {
  return (consoleErr?.mock.calls ?? []).filter(
    (c) => c[0] === "[research] stage=db-create error=",
  );
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
  deleteResearchSession.mockImplementation(async (_id: string) => {});
  sendResearchPrompt.mockImplementation(async (..._a: unknown[]) => ({
    ok: true,
  }));
  listAvailableModels.mockImplementation(async () => [{ id: "m" }]);
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

describe("REPRO: stage=db-create ErrorEvent → 'Failed to save research session'", () => {
  test("REPRO: DB rejecting with ErrorEvent reproduces the prod log + UI banner", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });

    await expect(research.startResearch(PREFS)).rejects.toThrow(
      "Failed to save research session",
    );

    const calls = dbCreateErrorCalls();
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("[research] stage=db-create error=");
    const logged = calls[0][1] as ErrorEvent;
    expect(logged).toBeInstanceOf(ErrorEvent);
    expect((logged as unknown as { type: string }).type).toBe("error");
  });

  test("REPRO: remote session is compensated, nothing else proceeds", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });

    await expect(research.startResearch(PREFS)).rejects.toThrow(
      "Failed to save research session",
    );

    // Remote opencode session was created (step 3 OK) → must be deleted to
    // avoid an orphaned remote session costing money/time.
    expect(createResearchSession).toHaveBeenCalledTimes(1);
    expect(deleteResearchSession).toHaveBeenCalledWith("opencode-1");
    // DB row never existed → hub boot + prompt send must never happen.
    // Hub register is fire-and-forget (void async + dynamic import), so allow
    // a macrotask tick before asserting absence.
    await new Promise((r) => setTimeout(r, 100));
    expect(sendResearchPrompt).not.toHaveBeenCalled();
    expect(hubEnsureStarted).not.toHaveBeenCalled();
    expect(hubRegister).not.toHaveBeenCalled();
  });

  test("REPRO: thrown error strips the cause (UI + logs can't tell DB-down from anything else)", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });

    const err = await research
      .startResearch(PREFS)
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(err).toBeInstanceOf(Error);
    // research.ts:201 throws a fixed string — the ErrorEvent (and any code /
    // constraint detail a real Error would carry) is dropped. The UI banner
    // and any error tracker see only this generic text.
    expect((err as Error).message).toBe("Failed to save research session");
    expect((err as Error).message).not.toContain("ErrorEvent");
    expect((err as Error).message).not.toContain("db-create");
  });

  test("REPRO: plain-Error DB failure takes the identical path (same banner, same compensation)", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw new Error("connection reset");
        }),
      },
    });
    await expect(research.startResearch(PREFS)).rejects.toThrow(
      "Failed to save research session",
    );
    expect(deleteResearchSession).toHaveBeenCalledWith("opencode-1");
    expect(dbCreateErrorCalls().length).toBe(1);
  });

  test("REPRO: compensation relies on deleteResearchSession never throwing (best-effort contract)", async () => {
    // research.ts:120 `await deleteResearchSession(...)` has no try/catch of
    // its own — it only works because the real implementation swallows all
    // errors internally. If that contract ever breaks, the compensation error
    // masks the original db-create failure.
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });
    deleteResearchSession.mockImplementation(async () => {
      throw new Error("delete exploded");
    });
    await expect(research.startResearch(PREFS)).rejects.toThrow(
      "delete exploded",
    );
  });

  test("REPRO: opencode-create failure is a DIFFERENT 500 (no compensation, different message)", async () => {
    // Distinguishes the two 500 shapes: remote-create failure throws BEFORE
    // any remote session exists, so there is nothing to compensate.
    createResearchSession.mockImplementation(async () => {
      throw new Error("refused");
    });
    await expect(research.startResearch(PREFS)).rejects.toThrow(
      "Failed to create OpenCode session",
    );
    expect(deleteResearchSession).not.toHaveBeenCalled();
    expect(dbCreateErrorCalls().length).toBe(0);
  });

  test("REPRO: validation still runs first (no remote/DB side effects on bad input)", async () => {
    await expect(
      research.startResearch({ jobTypes: [], countries: ["Test"], skills: ["R"] }),
    ).rejects.toThrow("Invalid research input");
    expect(createResearchSession).not.toHaveBeenCalled();
    expect(deleteResearchSession).not.toHaveBeenCalled();
  });
});

describe("REPRO: getAvailableModelsAction blocks with no timeout (12s hang)", () => {
  test("REPRO: slow model/provider lists stall the action 1:1 (prod: 12005ms)", async () => {
    // Prod: opencode model.list + provider.list hung ~12s; the action has no
    // timeout/abort of its own, so the model dropdown (and the POST) blocked
    // the full 12.1s. Reproduce scaled-down: 1200ms upstream delay must cost
    // the action ~1200ms — proving no timeout guard exists.
    listAvailableModels.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      return [{ id: "m" }];
    });
    const t0 = Date.now();
    const models = await research.getAvailableModelsAction();
    const elapsed = Date.now() - t0;
    expect(models).toEqual([{ id: "m" }]);
    expect(elapsed).toBeGreaterThanOrEqual(1000);
  }, 10000);

  test("REPRO: slow model load does not fail the later startResearch, but predicts it", async () => {
    // Both symptoms share one root condition (opencode server unresponsive +
    // DB flaky). A 12s model load followed by a db-create ErrorEvent is the
    // prod sequence: degraded dependencies, then the write fails.
    listAvailableModels.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return [{ id: "m" }];
    });
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });
    const models = await research.getAvailableModelsAction();
    expect(models).toEqual([{ id: "m" }]);
    await expect(research.startResearch(PREFS)).rejects.toThrow(
      "Failed to save research session",
    );
  }, 10000);

  test("INTENT (FAILS now): model load should time out instead of blocking 12s", async () => {
    listAvailableModels.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      return [{ id: "m" }];
    });
    const t0 = Date.now();
    await research.getAvailableModelsAction();
    const elapsed = Date.now() - t0;
    // Desired: bounded wait (e.g. ~2-3s) with fallback models. Current: full
    // upstream delay passes through, so this fails.
    expect(elapsed).toBeLessThan(1000);
  }, 10000);
});

describe("INTENT (FAILS now): db-create failure should preserve diagnostics", () => {
  test("INTENT (FAILS now): thrown error should name the failing stage/cause", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });
    const err = await research
      .startResearch(PREFS)
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    // Desired: message (or `cause`) carries stage + underlying detail so the
    // UI/tracker can distinguish DB-down from validation/remote failures.
    // Current: fixed generic string, so this fails.
    const msg = (err as Error).message;
    const cause = (err as unknown as { cause?: unknown }).cause;
    expect(
      msg.includes("db-create") ||
        msg.includes("ErrorEvent") ||
        cause !== undefined,
    ).toBe(true);
  });

  test("INTENT (FAILS now): compensation failure must not mask the original error", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw prodDbErrorEvent();
        }),
      },
    });
    deleteResearchSession.mockImplementation(async () => {
      throw new Error("delete exploded");
    });
    const err = await research
      .startResearch(PREFS)
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    // Desired: original "Failed to save research session" survives even if
    // cleanup fails. Current: the delete error escapes instead.
    expect((err as Error).message).toBe("Failed to save research session");
  });
});
