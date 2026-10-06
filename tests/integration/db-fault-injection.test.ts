// Layer 2 — fault injection: what happens when the DB connection drops?
//
// Reproduces the exact overlay signatures seen in the browser:
//   1/2  Runtime Error (Server): ErrorEvent
//        at resolveErrorDev / processFullStringRow / processBinaryChunk
//        (react-server-dom-turbopack-client — i.e. the Flight stream carried
//        a thrown value that could not be deserialized)
//   2/2  Runtime TypeError: Performance.measure: Given attribute end cannot
//        be negative (dev-only instrumentation noise from flushComponent-
//        Performance after the failed stream — ignore it, fix 1/2)
//
// Root cause pinned here: `getJobListings` (app/actions/jobs.ts:19) has NO
// try/catch, so a Neon WebSocket `ErrorEvent` propagates raw into the RSC /
// server-action Flight response. Next cannot serialize it (see assertions
// below), so the overlay is empty and the browser logs
// `Uncaught Error: ErrorEvent`.
//
// NOTE (disclaimer): PINPOINT tests are *expected to fail* until the actions
// handle connection errors. They reproduce the issue; they are not broken.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getJobListings } from "@/app/actions/jobs";
import { updateStatus } from "@/app/actions/status";
import { db } from "@/lib/db";

// The real throw from @neondatabase/serverless when its WebSocket dies.
// Verified characteristics in this repo's runtime (Bun/Node):
//   - NOT instanceof Error, .message === ""
//   - JSON.stringify(e) === '{"isTrusted":false}' (all diagnostics lost)
//   - structuredClone(e) throws DataCloneError (Flight/RSC cannot carry it)
function makeNeonWsErrorEvent(): unknown {
  return new ErrorEvent("error");
}

function stubJobListing(methods: Record<string, unknown>) {
  const target = (db as unknown as Record<string, object>).jobListing;
  const originals: Record<string, unknown> = {};
  for (const key of Object.keys(methods)) {
    originals[key] = (target as Record<string, unknown>)[key];
    (target as Record<string, unknown>)[key] = methods[key];
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) {
      (target as Record<string, unknown>)[key] = value;
    }
  };
}

beforeEach(() => {
  // Default: healthy DB. Individual tests override with failures.
  stubJobListing({
    findMany: mock(async () => []),
    findUnique: mock(async () => ({ id: "j1" })),
    update: mock(async () => ({ id: "j1", status: "APPLIED" })),
  });
});

describe("Neon ErrorEvent shape (why the overlay is empty)", () => {
  test("documents that the driver's throw carries zero diagnostics", () => {
    const thrown = makeNeonWsErrorEvent();
    expect(thrown instanceof Error).toBe(false);
    expect((thrown as { message?: unknown }).message ?? "").toBe("");
    // All connection context is lost on the wire:
    expect(JSON.stringify(thrown)).toBe('{"isTrusted":false}');
  });

  test("documents that the throw cannot cross the Flight/RSC boundary", () => {
    const thrown = makeNeonWsErrorEvent();
    expect(() => structuredClone(thrown)).toThrow();
  });
});

describe("getJobListings under connection failure", () => {
  test("PINPOINT: does not let a raw ErrorEvent escape to the RSC stream", async () => {
    const restore = stubJobListing({
      findMany: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    try {
      let thrown: unknown = null;
      try {
        await getJobListings("maxum");
      } catch (e) {
        thrown = e;
      }
      // Desired: the action converts connection failures into a serializable
      // value instead of throwing. Today it has no try/catch, so `thrown` is
      // the raw ErrorEvent — this assertion fails until fixed.
      expect(thrown).toBeNull();
    } finally {
      restore();
    }
  });

  test("PINPOINT: a 500ms DB hang is not guarded by any timeout", async () => {
    // Mirrors the observed `GET /listings 500 in 4.8s (application-code:
    // 4.5s)`: nothing bounds the await, so a paused Neon compute holds the
    // Server Component (and its Flight stream) open until it times out.
    const restore = stubJobListing({
      findMany: mock(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 500)),
      ),
    });
    try {
      const start = performance.now();
      await getJobListings("maxum");
      const elapsed = performance.now() - start;
      // Desired: bounded by a query/statement timeout well under the observed
      // 4.5s hang. Fails until a timeout is added.
      expect(elapsed).toBeLessThan(500);
    } finally {
      restore();
    }
  });
});

describe("updateStatus (the `Applied?` click path) under connection failure", () => {
  test("converts a Neon ErrorEvent into a serializable failure (already ok)", async () => {
    const restore = stubJobListing({
      findUnique: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const result = await updateStatus("j1", "APPLIED");
      expect(result).toEqual({
        success: false,
        error: "Failed to update status",
      });
      // Round-trips through Flight fine:
      expect(() => structuredClone(result)).not.toThrow();
    } finally {
      console.error = origError;
      restore();
    }
  });

  test("PINPOINT: the swallowed ErrorEvent keeps no diagnostic cause", async () => {
    const restore = stubJobListing({
      findUnique: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    const origError = console.error;
    console.error = () => {};
    try {
      const result = await updateStatus("j1", "APPLIED");
      // Desired: caller can distinguish "db unreachable" from "validation"
      // without scraping server logs. Today the ErrorEvent is only
      // console.error'd server-side and the client gets a generic string.
      expect(result).toHaveProperty("cause");
    } finally {
      console.error = origError;
      restore();
    }
  });

  test("Prisma P1001 (can't reach DB) is also a generic failure", async () => {
    const p1001 = Object.assign(new Error("Can't reach database server"), {
      code: "P1001",
    });
    const restore = stubJobListing({
      findUnique: mock(async () => {
        throw p1001;
      }),
    });
    const origError = console.error;
    console.error = () => {};
    try {
      const result = await updateStatus("j1", "APPLIED");
      expect(result).toEqual({
        success: false,
        error: "Failed to update status",
      });
    } finally {
      console.error = origError;
      restore();
    }
  });
});
