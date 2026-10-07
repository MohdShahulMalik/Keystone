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
import {
  addJobListing,
  bulkCreateJobsFromResearch,
  deleteJobListing,
  getJobListings,
  importJobs,
  updateJobListing,
} from "@/app/actions/jobs";
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

  test("a DB hang beyond the configured timeout degrades to [] (never hangs the stream)", async () => {
    // Mirrors the observed `GET /listings 500 in 4.8s (application-code:
    // 4.5s)`: the await must stay bounded so a paused Neon compute can't hold
    // the Server Component (and its Flight stream) open indefinitely.
    // Production default is 8000ms (warm ~600ms, cold wake ~3-5s); the test
    // overrides via env to keep it fast — the mechanism, not the value, is
    // what's pinned here.
    const prev = process.env.DB_READ_TIMEOUT_MS;
    const prevRetry = process.env.DB_RETRY_ATTEMPTS;
    process.env.DB_READ_TIMEOUT_MS = "400";
    // Isolate the per-attempt timeout bound from the retry loop (covered
    // separately in db-resilience.test.ts) — one attempt only here.
    process.env.DB_RETRY_ATTEMPTS = "1";
    const restore = stubJobListing({
      findMany: mock(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 500)),
      ),
    });
    const origError = console.error;
    console.error = () => {};
    try {
      const start = performance.now();
      const result = await getJobListings("maxum");
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(result).toEqual([]);
    } finally {
      console.error = origError;
      restore();
      if (prev === undefined) delete process.env.DB_READ_TIMEOUT_MS;
      else process.env.DB_READ_TIMEOUT_MS = prev;
      if (prevRetry === undefined) delete process.env.DB_RETRY_ATTEMPTS;
      else process.env.DB_RETRY_ATTEMPTS = prevRetry;
    }
  });

  test("default timeout tolerates warm queries and cold wakes", async () => {
    // Guards the production default: it must clear a ~4.5s cold wake with
    // margin (and warm ~600ms queries trivially). If someone lowers the
    // default, this fails and the override test above must be rescaled too.
    const prev = process.env.DB_READ_TIMEOUT_MS;
    delete process.env.DB_READ_TIMEOUT_MS;
    try {
      const { getDbReadTimeoutMs } = await import("@/lib/db-errors");
      expect(getDbReadTimeoutMs()).toBeGreaterThan(4500);
    } finally {
      if (prev !== undefined) process.env.DB_READ_TIMEOUT_MS = prev;
    }
  });
});

describe("updateStatus (the `Applied?` click path) under connection failure", () => {
  test("converts a Neon ErrorEvent into a serializable failure with cause", async () => {
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
      // Connectivity failures keep the generic message (never leak internals)
      // but now also carry a serializable `cause`/`code` so the client can
      // distinguish "db unreachable" from validation errors.
      expect(result).toMatchObject({
        success: false,
        error: "Failed to update status",
      });
      expect(result).toHaveProperty("cause");
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

  test("Prisma P1001 (can't reach DB) keeps the generic message with a cause", async () => {
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
      expect(result).toMatchObject({
        success: false,
        error: "Failed to update status",
        cause: "db_unreachable",
        code: "P1001",
      });
      expect(() => structuredClone(result)).not.toThrow();
    } finally {
      console.error = origError;
      restore();
    }
  });
});

describe("write actions under connection failure", () => {
  function silenceConsole() {
    const origError = console.error;
    console.error = () => {};
    return () => {
      console.error = origError;
    };
  }

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  }

  const validFields = {
    title: "Rust Engineer",
    company: "Acme",
    location: "Remote - USA",
    description: "Build things.",
    experience: "Junior",
  };

  test("addJobListing returns a serializable failure (never throws raw)", async () => {
    const restore = stubJobListing({
      create: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await addJobListing("user-1", formData(validFields));
      expect(result).toMatchObject({
        error: "Failed to create job",
        cause: "db_unreachable",
      });
      expect(() => structuredClone(result)).not.toThrow();
    } finally {
      unsilence();
      restore();
    }
  });

  test("updateJobListing returns a serializable failure (never throws raw)", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      update: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await updateJobListing(
        "user-1",
        "j1",
        formData({ status: "APPLIED" }),
      );
      expect(result).toMatchObject({
        success: false,
        error: "Failed to update job",
        cause: "db_unreachable",
      });
      expect(() => structuredClone(result)).not.toThrow();
    } finally {
      unsilence();
      restore();
    }
  });

  test("deleteJobListing returns a serializable failure (never throws raw)", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1" })),
      delete: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "j1");
      expect(result).toMatchObject({
        success: false,
        error: "Failed to delete job",
        cause: "db_unreachable",
      });
      expect(() => structuredClone(result)).not.toThrow();
    } finally {
      unsilence();
      restore();
    }
  });

  test("importJobs reports the batch write failure top-level (never throws raw)", async () => {
    const good = {
      title: "T",
      company: "C",
      location: "L",
      description: "D",
      experience: "Junior",
    } as never;
    const restore = stubJobListing({
      createMany: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await importJobs("user-1", [good]);
      expect(result).toMatchObject({
        imported: 0,
        error: "Failed to save imported jobs",
        cause: "db_unreachable",
      });
      expect(() => structuredClone(result)).not.toThrow();
    } finally {
      unsilence();
      restore();
    }
  });

  test("bulkCreateJobsFromResearch throws a real Error with serializable cause (never the raw ErrorEvent)", async () => {
    const restore = stubJobListing({
      findMany: mock(async () => {
        throw makeNeonWsErrorEvent();
      }),
    });
    (db as unknown as Record<string, object>).user = {
      upsert: mock(async () => ({})),
    };
    const unsilence = silenceConsole();
    try {
      const err = await bulkCreateJobsFromResearch("user-1", [
        {
          title: "Rust Engineer",
          company: "Acme",
          location: "Remote",
          url: "https://a.example/j/1",
          description: "Build.",
          salary: null,
          experience: "Junior",
          visa: null,
          type: "remote",
          country: "USA",
          notes: null,
        } as never,
      ]).then(
        () => null,
        (e: unknown) => e as Error & { cause?: unknown; code?: unknown },
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(ErrorEvent);
      expect((err as Error).message).toBe("Failed to persist researched jobs");
      expect((err as { cause?: unknown }).cause).toBe("db_unreachable");
      // The diagnostic record the pipeline logs (cf. describePersistError in
      // lib/research/stream.ts) must cross serialization boundaries.
      // NOTE: asserted via explicit try/catch because bun's
      // expect(fn).not.toThrow() misfires on fns returning Error clones.
      const record = {
        name: (err as Error).name,
        message: (err as Error).message,
        cause: (err as { cause?: unknown }).cause,
        code: (err as { code?: unknown }).code,
      };
      let cloneError: unknown = null;
      try {
        structuredClone(record);
      } catch (e) {
        cloneError = e;
      }
      expect(cloneError).toBeNull();
    } finally {
      unsilence();
      restore();
    }
  });
});
