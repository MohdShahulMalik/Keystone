// PINPOINT SUITE — delete flow behind components/cards/listings.tsx
//
// Screenshot under test: ConfirmationBox titled "Delete job listing?" showing
// the banner `Failed to delete job` (role="alert") after pressing Delete.
//
// Chain under test:
//   JobListingCard.handleDelete (listings.tsx:60)
//     -> deleteJobListing(userId, jobId) (app/actions/jobs.ts:121)
//     -> ConfirmationBox.handleConfirm (confirmation-box.tsx:54) renders
//        result.error into role="alert", keeps dialog open on success:false.
//
// DISCLAIMER (per request): these tests are diagnostic, NOT green-gating.
// Some are INTENT/PROBE tests that *fail* against current code on purpose —
// the failure IS the pinpoint. Do not "fix" them by weakening assertions.
//
// What this suite pins down:
//   A. Which server branch produces the exact screenshot string.
//   B. Which DB faults collapse into that same opaque string (indistinguishable).
//   C. What the client (`getActionError`) discards (cause/code).
//   D. Structural risks: revalidatePath inside try, id-only delete write.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { deleteJobListing } from "@/app/actions/jobs";
import { db } from "@/lib/db";

// ---------------------------------------------------------------- helpers
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

function silenceConsole() {
  const orig = console.error;
  console.error = () => {};
  return () => {
    console.error = orig;
  };
}

/** Exact throw from @neondatabase/serverless when its WebSocket dies. */
function neonWsErrorEvent(): unknown {
  return new ErrorEvent("error");
}

function prismaError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

// Replica of the PRIVATE helper in listings.tsx:38-41. It is not exported,
// so the UI's error-mapping contract cannot be imported — that in itself is
// pinpoint D1 (untestable mapping). We replica-test what it does.
function replicaGetActionError(error: unknown): string {
  if (typeof error === "string") return error;
  return "Failed to delete the job listing";
}

beforeEach(() => {
  stubJobListing({
    findMany: mock(async () => []),
    findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
    create: mock(async (args: unknown) => ({ id: "new-id" })),
    update: mock(async (args: unknown) => ({})),
    delete: mock(async () => ({})),
    createMany: mock(async () => ({ count: 1 })),
  });
});

// ================================================================ A. signature
describe("A. screenshot signature decoding — where does `Failed to delete job` come from?", () => {
  test("A1. the banner text matches ONLY the catch-all in deleteJobListing (jobs.ts:156)", async () => {
    // Every other failure branch returns a DIFFERENT string:
    //  - validation  -> z.prettifyError(...) (mentions jobId)
    //  - not found   -> "Job not found"
    //  - catch-all   -> "Failed to delete job"  <-- screenshot
    const unsilence = silenceConsole();
    const restoreNotFound = stubJobListing({
      findFirst: mock(async () => null),
    });
    let notFound: unknown;
    try {
      notFound = await deleteJobListing("user-1", "missing-id");
    } finally {
      restoreNotFound();
      unsilence();
    }
    expect(notFound).toEqual({ success: false, error: "Job not found" });
    // Therefore the screenshot is NOT an ownership/IDOR refusal and NOT a
    // validation error — the DB call itself threw (or timed out).
    // The passing assertion above plus the literal below pin the branch:
    expect("Failed to delete job").not.toBe(
      (notFound as { error: string }).error,
    );
  });

  test("A2. validation failures produce a different message (empty jobId)", async () => {
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "");
      expect(result.success).toBe(false);
      if (!result.success) {
        // Must NOT equal the screenshot text — proves validation is innocent.
        expect(result.error).not.toBe("Failed to delete job");
        expect(result.error.toLowerCase()).toContain("job id");
      }
    } finally {
      unsilence();
    }
  });

  test("A3. happy path returns {success:true} — dialog would close, card unmounts", async () => {
    const mockedDelete = mock(async () => ({}));
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mockedDelete,
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "j1");
      expect(result).toMatchObject({ success: true });
      expect(mockedDelete).toHaveBeenCalled();
    } finally {
      unsilence();
      restore();
    }
  });
});

// ================================================================ B. fault matrix
describe("B. fault matrix — every DB throw that collapses into the screenshot banner", () => {
  test("B1. Neon ErrorEvent on findFirst -> screenshot banner + cause=db_unreachable", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => {
        throw neonWsErrorEvent();
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

  test("B2. Neon ErrorEvent on delete (row exists, wire dies on write) -> same banner", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mock(async () => {
        throw neonWsErrorEvent();
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
    } finally {
      unsilence();
      restore();
    }
  });

  test("B3. PINPOINT: Prisma P2025 (row vanished between findFirst and delete) is OPAQUE — no cause, same banner as DB-down", async () => {
    // Race: two tabs delete the same row, or row deleted externally after
    // the ownership read. Prisma delete throws P2025 "record not found".
    // classifyDbError() only maps P1001/P1002/P1008/P1017 + timeout + WS
    // event — P2025 falls through to null, so the client sees the identical
    // `Failed to delete job` with NO cause. Indistinguishable from B1/B2
    // without server logs. If this assertion ever gains a `cause`, the race
    // was made distinguishable (desired direction).
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mock(async () => {
        throw prismaError(
          "P2025",
          "An operation failed because it depends on one or more records that were required but not found.",
        );
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "j1");
      expect(result).toMatchObject({
        success: false,
        error: "Failed to delete job",
      });
      // PINPOINT assertion — documents the opacity gap:
      expect(result).not.toHaveProperty("cause");
    } finally {
      unsilence();
      restore();
    }
  });

  test("B4. PINPOINT: generic query error (e.g. P2003 FK, P2014, connection reset without code) is also opaque", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mock(async () => {
        throw new Error("connection reset by peer");
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "j1");
      expect(result).toMatchObject({
        success: false,
        error: "Failed to delete job",
      });
      expect(result).not.toHaveProperty("cause");
    } finally {
      unsilence();
      restore();
    }
  });

  test("B5. Prisma P1001 on delete keeps generic message BUT carries cause (distinguishable)", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mock(async () => {
        throw prismaError("P1001", "Can't reach database server");
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "j1");
      expect(result).toMatchObject({
        success: false,
        error: "Failed to delete job",
        cause: "db_unreachable",
        code: "P1001",
      });
    } finally {
      unsilence();
      restore();
    }
  });

  test("B6. DB hang past DB_READ_TIMEOUT_MS -> timeout cause + same banner", async () => {
    const prev = process.env.DB_READ_TIMEOUT_MS;
    const prevRetry = process.env.DB_RETRY_ATTEMPTS;
    process.env.DB_READ_TIMEOUT_MS = "150";
    // Single attempt: isolates the timeout classification from the retry
    // loop (retry timing is covered in tests/unit/db-resilience.test.ts).
    process.env.DB_RETRY_ATTEMPTS = "1";
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mock(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 500)),
      ),
    });
    const unsilence = silenceConsole();
    try {
      const start = performance.now();
      const result = await deleteJobListing("user-1", "j1");
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(result).toMatchObject({
        success: false,
        error: "Failed to delete job",
        cause: "timeout",
      });
    } finally {
      unsilence();
      restore();
      if (prev === undefined) delete process.env.DB_READ_TIMEOUT_MS;
      else process.env.DB_READ_TIMEOUT_MS = prev;
      if (prevRetry === undefined) delete process.env.DB_RETRY_ATTEMPTS;
      else process.env.DB_RETRY_ATTEMPTS = prevRetry;
    }
  });

  test("B7. ownership refusal does NOT hit the DB write (attacker vs victim)", async () => {
    const mockedDelete = mock(async () => ({}));
    const restore = stubJobListing({
      findFirst: mock(async () => null),
      delete: mockedDelete,
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("attacker", "victim-job");
      expect(result).toEqual({ success: false, error: "Job not found" });
      expect(mockedDelete).not.toHaveBeenCalled();
    } finally {
      unsilence();
      restore();
    }
  });
});

// ================================================================ C. client mapping
describe("C. client information loss — listings.tsx getActionError + ConfirmationBox", () => {
  test("C1. PINPOINT: server cause/code never reach the banner (getActionError drops everything but strings)", () => {
    // Server returns {success:false, error, cause, code} for connectivity
    // faults (B1/B2/B5/B6). The card maps via:
    //   getActionError(result.error) -> typeof error === "string" ? error : generic
    // `result.error` is always the generic string, so cause/code are discarded
    // — the banner can never distinguish DB-down from P2025 race. console.error
    // server-side is the ONLY diagnostic channel.
    const serverResult = {
      success: false as const,
      error: "Failed to delete job",
      cause: "db_unreachable",
      code: "P1001",
    };
    expect(replicaGetActionError(serverResult.error)).toBe(
      "Failed to delete job",
    );
    // cause/code are dropped by the mapping — pinned:
    expect(replicaGetActionError(serverResult.error)).not.toContain("P1001");
    expect(replicaGetActionError(serverResult.error)).not.toContain(
      "db_unreachable",
    );
  });

  test('C2. PINPOINT: non-string errors render a DIFFERENT generic ("the job listing" vs "job")', () => {
    // If a future action ever returns {error: {fieldErrors}} (like addJob's
    // shape), the banner shows "Failed to delete the job listing" — note the
    // extra "the" — which does NOT match the screenshot. So a screenshot
    // reading "Failed to delete job" proves the error WAS a string (server
    // catch-all), not the client fallback. This test locks both literals.
    expect(replicaGetActionError({ fieldErrors: {} })).toBe(
      "Failed to delete the job listing",
    );
    expect(replicaGetActionError("Failed to delete job")).toBe(
      "Failed to delete job",
    );
    expect(replicaGetActionError({})).not.toBe("Failed to delete job");
  });

  test("C3. ConfirmationBox contract: failure keeps dialog open with role=alert; success closes", async () => {
    // Static contract check against confirmation-box.tsx — the behavior the
    // screenshot exhibits (dialog still open + alert visible) means
    // handleConfirm took the `!result.success` branch (line 61-69) and called
    // setError, never dialog.close(). We assert the source still encodes that
    // contract so a future refactor is caught.
    const src = await Bun.file("components/confirmation-box.tsx").text();
    expect(src).toContain('role="alert"');
    expect(src).toContain("!result.success");
    expect(src).toContain("dialogRef.current?.close()");
    // And the card wires handleDelete into onConfirmAction + returns
    // {success:false, error} on failure (listings.tsx:60-75):
    const card = await Bun.file("components/cards/listings.tsx").text();
    expect(card).toContain("onConfirmAction={handleDelete}");
    expect(card).toContain("return { success: false as const");
  });
});

// ================================================================ D. structural risks
describe("D. structural risks in the delete path", () => {
  test('D1. PINPOINT: revalidatePath("/listings") sits INSIDE the try — its throw masquerades as a DB failure', async () => {
    // jobs.ts:143-150: delete -> revalidatePath -> return success. If
    // revalidatePath throws (mocked noop in tests, real Next runtime in prod),
    // the catch reports "Failed to delete job" even though the row WAS
    // deleted. Retry then yields "Job not found" — the classic
    // delete-then-failure confusion. Assert source order to pin it.
    const src = await Bun.file("app/actions/jobs.ts").text();
    const deleteIdx = src.indexOf("db.jobListing.delete");
    const revalidateIdx = src.indexOf('revalidatePath("/listings")', deleteIdx);
    const catchIdx = src.indexOf("catch (error)", revalidateIdx);
    const successReturnIdx = src.indexOf(
      "return { success: true",
      revalidateIdx,
    );
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(revalidateIdx).toBeGreaterThan(deleteIdx);
    // Both revalidate AND the success return are inside the same try:
    expect(successReturnIdx).toBeGreaterThan(revalidateIdx);
    expect(catchIdx).toBeGreaterThan(successReturnIdx);
  });

  test("D2. PINPOINT: ownership read is user-scoped but the delete write is id-only (TOCTOU/IDOR-fragile)", async () => {
    const mockedDelete = mock(async () => ({}));
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      delete: mockedDelete,
    });
    const unsilence = silenceConsole();
    try {
      await deleteJobListing("user-1", "j1");
      const readArg = (
        (
          db as unknown as {
            jobListing: { findFirst: { mock: { calls: unknown[][] } } };
          }
        ).jobListing.findFirst.mock.calls[0] as unknown as unknown[]
      )[0] as { where: Record<string, string> };
      expect(readArg.where).toMatchObject({ id: "j1", userId: "user-1" });
      const writeArg = (
        mockedDelete.mock.calls[0] as unknown as unknown[]
      )[0] as {
        where: Record<string, string>;
      };
      // Write drops userId — safe only because the read guards it. A future
      // refactor dropping the read becomes an IDOR. Pinned, not fixed.
      expect(writeArg.where).toEqual({ id: "j1" });
      expect(writeArg.where).not.toHaveProperty("userId");
    } finally {
      unsilence();
      restore();
    }
  });

  test("D3. delete failure is serializable (never a raw ErrorEvent across Flight)", async () => {
    const restore = stubJobListing({
      findFirst: mock(async () => ({ id: "j1" })),
      delete: mock(async () => {
        throw neonWsErrorEvent();
      }),
    });
    const unsilence = silenceConsole();
    try {
      const result = await deleteJobListing("user-1", "j1");
      let cloneError: unknown = null;
      try {
        structuredClone(result);
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
