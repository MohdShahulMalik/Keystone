// Intent:
// - status.ts: validate enum, 404 unknown jobs, persist + revalidate, never leak
//   DB errors (generic message).
// - research.ts startResearch: validate input (throw Invalid research input),
//   load resume text (throw Failed to load resume on DB error), create the
//   remote opencode session (throw Failed to create ... on error), persist the
//   DB row with title+preferences+mode (compensate by deleting the remote
//   session on DB failure), boot the hub fire-and-forget, send the prompt in
//   the background (marking the session failed if sending fails), and return
//   both ids. getResearchStatus throws for unknown sessions.
import { beforeEach, describe, expect, mock, test } from "bun:test";

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
const status = await import("@/app/actions/status");
const research = await import("@/app/actions/research");

function stub(models: Record<string, Record<string, unknown>>) {
  for (const [model, methods] of Object.entries(models)) {
    const target = (db as unknown as Record<string, object>)[model];
    if (target) Object.assign(target, methods);
    else (db as unknown as Record<string, object>)[model] = methods as object;
  }
}

// Dynamic import() inside the action resolves on the macrotask queue, so
// microtask-only ticks never flush it. Poll until the condition holds.
async function waitFor(fn: () => void, timeoutMs = 2000) {
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
  stub({
    jobListing: {
      findUnique: mock(async () => ({ id: "j1" })),
      update: mock(async () => ({})),
    },
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
});

describe("updateStatus", () => {
  test("persists valid transitions", async () => {
    const result = await status.updateStatus("j1", "INTERVIEW");
    expect(result).toEqual({ success: true });
    const update = (
      db as unknown as { jobListing: { update: ReturnType<typeof mock> } }
    ).jobListing.update;
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "j1" },
      data: { status: "INTERVIEW" },
    });
  });

  test("rejects invalid statuses without a DB write", async () => {
    const update = (
      db as unknown as { jobListing: { update: ReturnType<typeof mock> } }
    ).jobListing.update;
    expect(await status.updateStatus("j1", "SAVED" as never)).toEqual({
      success: false,
      error: "Invalid status",
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("returns Job not found for unknown ids", async () => {
    stub({ jobListing: { findUnique: mock(async () => null) } });
    expect(await status.updateStatus("missing", "APPLIED")).toEqual({
      success: false,
      error: "Job not found",
    });
  });

  test("hides DB failures behind a generic message", async () => {
    stub({
      jobListing: {
        findUnique: mock(async () => ({ id: "j1" })),
        update: mock(async () => {
          throw new Error("connection reset");
        }),
      },
    });
    expect(await status.updateStatus("j1", "APPLIED")).toEqual({
      success: false,
      error: "Failed to update status",
    });
  });

  test("INTENT PROBE: no ownership check — any caller with the id can change status", async () => {
    // Unlike updateJobListing (user-scoped findFirst), updateStatus looks up
    // by {id} alone. Documents the missing authorization boundary.
    const findUnique = (
      db as unknown as { jobListing: { findUnique: ReturnType<typeof mock> } }
    ).jobListing.findUnique;
    await status.updateStatus("someone-elses-job", "REJECTED");
    const arg = findUnique.mock.calls[0][0] as {
      where: Record<string, string>;
    };
    expect(arg.where).not.toHaveProperty("userId");
  });
});

describe("startResearch — validation", () => {
  test("throws Invalid research input when facets are empty", async () => {
    await expect(
      research.startResearch({
        jobTypes: [],
        countries: ["USA"],
        skills: ["R"],
      }),
    ).rejects.toThrow("Invalid research input");
    expect(createResearchSession).not.toHaveBeenCalled();
  });

  test("throws for missing skills", async () => {
    await expect(
      research.startResearch({
        jobTypes: ["remote"],
        countries: ["USA"],
        skills: [],
      }),
    ).rejects.toThrow("Invalid research input");
  });
});

describe("startResearch — happy path", () => {
  const prefs = {
    jobTypes: ["remote"],
    countries: ["USA"],
    skills: ["React"],
    notes: "senior only",
  };

  test("creates remote + DB sessions, boots hub, sends prompt, returns ids", async () => {
    const result = await research.startResearch(prefs);
    expect(result).toEqual({
      sessionId: "db-1",
      openCodeSessionId: "opencode-1",
    });
    expect(createResearchSession).toHaveBeenCalledTimes(1);
    expect(sendResearchPrompt).toHaveBeenCalled();
    const createArg = (
      db as unknown as { searchSession: { create: ReturnType<typeof mock> } }
    ).searchSession.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({
      userId: "maxum",
      status: "running",
      openCodeSessionId: "opencode-1",
      mode: "job",
    });
    expect(createArg.data).toHaveProperty("title");
    expect(createArg.data).toHaveProperty("preferences");
    await waitFor(() => expect(hubEnsureStarted).toHaveBeenCalled());
    await waitFor(() =>
      expect(hubRegister).toHaveBeenCalledWith("db-1", "opencode-1", "maxum"),
    );
  });

  test("forwards resume content into the prompt when resumeId resolves", async () => {
    stub({
      resume: {
        findUnique: mock(async () => ({ id: "res-1", content: "5y Rust" })),
      },
    });
    await research.startResearch({ ...prefs, resumeId: "res-1" });
    const prompt = sendResearchPrompt.mock.calls[0][1] as string;
    expect(prompt).toContain("5y Rust");
  });

  test("INTENT PROBE: unknown resumeId is silently ignored (no throw)", async () => {
    // findUnique returns null -> resumeContent stays undefined and research
    // proceeds without resume context. A typo'd id is indistinguishable from
    // "no resume" — arguably should throw like the DB-error path does.
    stub({ resume: { findUnique: mock(async () => null) } });
    const result = await research.startResearch({
      ...prefs,
      resumeId: "typo-id",
    });
    expect(result.sessionId).toBe("db-1");
  });

  test("wraps resume DB errors", async () => {
    stub({
      resume: {
        findUnique: mock(async () => {
          throw new Error("db down");
        }),
      },
    });
    await expect(
      research.startResearch({ ...prefs, resumeId: "res-1" }),
    ).rejects.toThrow("Failed to load resume");
  });

  test("compensates remote session when the DB insert fails", async () => {
    stub({
      searchSession: {
        create: mock(async () => {
          throw new Error("db down");
        }),
      },
    });
    await expect(research.startResearch(prefs)).rejects.toThrow(
      "Failed to save research session",
    );
    expect(deleteResearchSession).toHaveBeenCalledWith("opencode-1");
  });

  test("marks the session failed when background prompt send fails", async () => {
    sendResearchPrompt.mockImplementation(async () => {
      throw new Error("prompt exploded");
    });
    await research.startResearch(prefs);
    await waitFor(() => {
      const update = (
        db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
      ).searchSession.update;
      expect(update).toHaveBeenCalled();
    });
    const update = (
      db as unknown as { searchSession: { update: ReturnType<typeof mock> } }
    ).searchSession.update;
    const arg = update.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; error: string };
    };
    expect(arg.data.status).toBe("failed");
    expect(arg.data.error).toContain("prompt exploded");
  });

  test("wraps opencode create failures", async () => {
    createResearchSession.mockImplementation(async () => {
      throw new Error("refused");
    });
    await expect(research.startResearch(prefs)).rejects.toThrow(
      "Failed to create OpenCode session",
    );
  });
});

describe("getResearchStatus / getAvailableModelsAction", () => {
  test("throws for unknown sessions", async () => {
    await expect(research.getResearchStatus("missing")).rejects.toThrow(
      "Research session not found",
    );
  });

  test("returns status payload with results", async () => {
    stub({
      searchSession: {
        findUnique: mock(async () => ({
          id: "db-1",
          status: "completed",
          results: [{ id: "r1" }],
          error: null,
          createdAt: new Date(),
          completedAt: new Date(),
        })),
      },
    });
    const payload = await research.getResearchStatus("db-1");
    expect(payload.status).toBe("completed");
    expect(payload.results.length).toBe(1);
    expect(payload.error).toBeNull();
  });

  test("delegates model listing to the opencode layer", async () => {
    expect(await research.getAvailableModelsAction()).toEqual([{ id: "m" }]);
    expect(listAvailableModels).toHaveBeenCalledTimes(1);
  });
});
