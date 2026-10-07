// Retry/backoff + ws-flavored classifier coverage for lib/db-errors.ts.
//
// Background: production logs showed a Neon pooler failure shaped as
// `ErrorEvent { clientVersion: '7.9.0', Symbol(kTarget): WebSocket
// {_closeCode: 1006, ...}, Symbol(kType): 'error',
// Symbol(kError): AggregateError { code: 'ETIMEDOUT', ... } }`.
// `instanceof ErrorEvent` alone misses cross-realm `ws` instances, so the
// classifier duck-types the symbol tags; `withResilientDb` retries only
// connectivity failures (non-null `classifyDbError`) with capped exponential
// backoff.
import { describe, expect, mock, test } from "bun:test";
import {
  classifyDbError,
  computeRetryDelayMs,
  DbTimeoutError,
  getDbRetryAttempts,
  getDbRetryBaseMs,
  getDbRetryMaxMs,
  withResilientDb,
} from "@/lib/db-errors";

const kType = Symbol.for("kType");
const kTarget = Symbol.for("kTarget");
const kError = Symbol.for("kError");

/** Faithful duck-type of the production ws failure (no instanceof lineage). */
function makeWsFlavoredFailure() {
  const wsTarget = {
    _closeCode: 1006,
    _readyState: 3,
    _url: "wss://ep-old-darkness-pooler.neon.tech/v2",
  };
  const nested = Object.assign(new Error("connect ETIMEDOUT"), {
    code: "ETIMEDOUT",
  });
  const aggregate = new AggregateError(
    [nested],
    "connect ETIMEDOUT",
  ) as AggregateError & { code: string };
  aggregate.code = "ETIMEDOUT";
  return {
    clientVersion: "7.9.0",
    type: "error",
    message: "",
    [kType]: "error",
    [kTarget]: wsTarget,
    [kError]: aggregate,
  };
}

describe("classifyDbError — ws-flavored shapes", () => {
  test("catches the production ws shape without instanceof lineage", () => {
    expect(classifyDbError(makeWsFlavoredFailure())).toEqual({
      cause: "db_unreachable",
      code: "NEON_WS_ERROR",
    });
  });

  test("keeps the bare ErrorEvent contract (NEON_WS_ERROR)", () => {
    expect(classifyDbError(new ErrorEvent("error"))).toEqual({
      cause: "db_unreachable",
      code: "NEON_WS_ERROR",
    });
  });

  test("maps a plain ETIMEDOUT error (no WS wrapper)", () => {
    expect(
      classifyDbError(
        Object.assign(new Error("connect ETIMEDOUT"), {
          code: "ETIMEDOUT",
        }),
      ),
    ).toEqual({ cause: "db_unreachable", code: "ETIMEDOUT" });
  });

  test("maps a nested AggregateError ETIMEDOUT via cause chain", () => {
    const nested = Object.assign(new Error("x"), { code: "ECONNRESET" });
    const outer = new Error("outer") as Error & { cause: unknown };
    outer.cause = new AggregateError([nested], "wrap");
    expect(classifyDbError(outer)).toEqual({
      cause: "db_unreachable",
      code: "ECONNRESET",
    });
  });

  test("leaves generic query errors opaque (no retry, no cause)", () => {
    expect(classifyDbError(new Error("connection reset by peer"))).toBeNull();
    expect(
      classifyDbError(Object.assign(new Error("not found"), { code: "P2025" })),
    ).toBeNull();
  });

  test("maps DbTimeoutError to timeout (retryable)", () => {
    expect(classifyDbError(new DbTimeoutError(8000))).toEqual({
      cause: "timeout",
      code: "DB_TIMEOUT",
    });
  });
});

describe("retry option env overrides", () => {
  test("defaults are attempts=3, base=300, max=2000", () => {
    const saved = {
      attempts: process.env.DB_RETRY_ATTEMPTS,
      base: process.env.DB_RETRY_BASE_MS,
      max: process.env.DB_RETRY_MAX_MS,
    };
    delete process.env.DB_RETRY_ATTEMPTS;
    delete process.env.DB_RETRY_BASE_MS;
    delete process.env.DB_RETRY_MAX_MS;
    try {
      expect(getDbRetryAttempts()).toBe(3);
      expect(getDbRetryBaseMs()).toBe(300);
      expect(getDbRetryMaxMs()).toBe(2000);
    } finally {
      if (saved.attempts !== undefined)
        process.env.DB_RETRY_ATTEMPTS = saved.attempts;
      if (saved.base !== undefined) process.env.DB_RETRY_BASE_MS = saved.base;
      if (saved.max !== undefined) process.env.DB_RETRY_MAX_MS = saved.max;
    }
  });

  test("clamps attempts to 1..5", () => {
    const prev = process.env.DB_RETRY_ATTEMPTS;
    try {
      process.env.DB_RETRY_ATTEMPTS = "99";
      expect(getDbRetryAttempts()).toBe(5);
      process.env.DB_RETRY_ATTEMPTS = "0";
      expect(getDbRetryAttempts()).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.DB_RETRY_ATTEMPTS;
      else process.env.DB_RETRY_ATTEMPTS = prev;
    }
  });

  test("backoff doubles per retry and caps at max", () => {
    expect(computeRetryDelayMs(1, 300, 2000)).toBe(300);
    expect(computeRetryDelayMs(2, 300, 2000)).toBe(600);
    expect(computeRetryDelayMs(3, 300, 2000)).toBe(1200);
    expect(computeRetryDelayMs(4, 300, 2000)).toBe(2000);
  });
});

describe("withResilientDb", () => {
  const fast = { attempts: 3, baseMs: 5, maxMs: 10 };

  test("succeeds after transient ws failures (factory re-invoked per attempt)", async () => {
    let calls = 0;
    const result = await withResilientDb(
      mock(async () => {
        calls++;
        if (calls < 3) throw makeWsFlavoredFailure();
        return "ok";
      }),
      500,
      fast,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("does NOT retry non-connectivity errors (fails fast)", async () => {
    let calls = 0;
    const p2025 = Object.assign(new Error("record not found"), {
      code: "P2025",
    });
    await expect(
      withResilientDb(
        mock(async () => {
          calls++;
          throw p2025;
        }),
        500,
        fast,
      ),
    ).rejects.toBe(p2025);
    expect(calls).toBe(1);
  });

  test("gives up after attempts and rethrows the last error", async () => {
    let calls = 0;
    const timeout = new DbTimeoutError(50);
    await expect(
      withResilientDb(
        mock(async () => {
          calls++;
          throw timeout;
        }),
        500,
        { attempts: 2, baseMs: 5, maxMs: 10 },
      ),
    ).rejects.toBe(timeout);
    expect(calls).toBe(2);
  });

  test("each attempt is individually time-bounded", async () => {
    let calls = 0;
    const start = performance.now();
    await expect(
      withResilientDb(
        mock(() => {
          calls++;
          return new Promise<string>(() => {});
        }),
        50,
        { attempts: 2, baseMs: 5, maxMs: 10 },
      ),
    ).rejects.toBeInstanceOf(DbTimeoutError);
    // 2 x 50ms attempts + ~2 backoff sleeps: bounded, never hangs.
    expect(performance.now() - start).toBeLessThan(500);
    expect(calls).toBe(2);
  });
});
