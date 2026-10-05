// Intent: app/actions/jobs.ts is the write path for job listings.
// get/add/update/delete are user-scoped (ownership checks prevent IDOR);
// importJobs validates per row and bulk-inserts the valid subset;
// bulkCreateJobsFromResearch (the single research->DB path) upserts the user,
// validates, dedupes within the batch AND against the DB (case-insensitive
// title|company|url), and reports {created, skipped}.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  addJobListing,
  bulkCreateJobsFromResearch,
  deleteJobListing,
  getJobListings,
  importJobs,
  updateJobListing,
} from "@/app/actions/jobs";
import { db } from "@/lib/db";

function stubDb(overrides: Record<string, Record<string, unknown>> = {}) {
  const base = {
    jobListing: {
      findMany: mock(async () => []),
      findFirst: mock(async () => null),
      create: mock(async (args: unknown) => ({
        id: "new-id",
        ...(args as { data: object }).data,
      })),
      update: mock(async (args: unknown) => ({
        ...(args as { data: object }).data,
      })),
      delete: mock(async () => ({})),
      createMany: mock(async () => ({ count: 1 })),
    },
    user: { upsert: mock(async () => ({})) },
  };
  for (const [model, methods] of Object.entries(base)) {
    const target = (db as unknown as Record<string, object>)[model];
    if (target) Object.assign(target, methods as object);
    else (db as unknown as Record<string, object>)[model] = methods as object;
  }
  for (const [model, methods] of Object.entries(overrides)) {
    Object.assign(
      (db as unknown as Record<string, object>)[model] ?? {},
      methods,
    );
  }
  return db as unknown as {
    jobListing: Record<string, ReturnType<typeof mock>>;
    user: Record<string, ReturnType<typeof mock>>;
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

beforeEach(() => {
  stubDb();
});

describe("getJobListings", () => {
  test("scopes to the user and orders newest first", async () => {
    const mocked = stubDb();
    await getJobListings("user-1");
    const arg = mocked.jobListing.findMany.mock.calls[0][0] as {
      where: { userId: string };
      orderBy: { createdAt: string };
    };
    expect(arg.where.userId).toBe("user-1");
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
  });
});

describe("addJobListing", () => {
  test("creates a job for valid input", async () => {
    const mocked = stubDb();
    const result = await addJobListing("user-1", formData(validFields));
    expect(mocked.jobListing.create).toHaveBeenCalled();
    expect(result).toMatchObject({ title: "Rust Engineer", userId: "user-1" });
  });

  test("returns field errors without touching the DB for invalid input", async () => {
    const mocked = stubDb();
    const result = await addJobListing("user-1", formData({ title: "" }));
    expect(mocked.jobListing.create).not.toHaveBeenCalled();
    expect(result).toHaveProperty("error");
  });

  test("INTENT PROBE: success shape differs from update/delete ({raw} vs {success,data})", async () => {
    // update/delete return {success: true, data}; add returns the raw row.
    // Callers must handle two shapes — documented here as a consistency gap.
    const result = (await addJobListing(
      "user-1",
      formData(validFields),
    )) as Record<string, unknown>;
    expect(result).not.toHaveProperty("success");
  });
});

describe("updateJobListing", () => {
  test("updates owned jobs", async () => {
    const mocked = stubDb({
      jobListing: {
        findFirst: mock(async () => ({ id: "j1", userId: "user-1" })),
      },
    });
    const result = await updateJobListing(
      "user-1",
      "j1",
      formData({ status: "APPLIED" }),
    );
    expect(result).toMatchObject({ success: true });
    const updateArg = mocked.jobListing.update.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string };
    };
    expect(updateArg.where.id).toBe("j1");
    expect(updateArg.data.status).toBe("APPLIED");
  });

  test("refuses to touch another user's job (ownership check)", async () => {
    const mocked = stubDb({
      jobListing: { findFirst: mock(async () => null) },
    });
    const result = await updateJobListing(
      "attacker",
      "victim-job",
      formData({ status: "APPLIED" }),
    );
    expect(result).toEqual({ success: false, error: "Job not found" });
    expect(mocked.jobListing.update).not.toHaveBeenCalled();
  });

  test("rejects invalid status values", async () => {
    const mocked = stubDb();
    const result = await updateJobListing(
      "user-1",
      "j1",
      formData({ status: "SAVED" }),
    );
    expect(result.success).toBe(false);
    expect(mocked.jobListing.update).not.toHaveBeenCalled();
  });

  test("INTENT: update is user-scoped on read but the write is id-only", async () => {
    // findFirst filters {id, userId} but update uses where: {id} alone.
    // Safe today (guarded by the read), but a TOCTOU/race or future refactor
    // dropping the read would become an IDOR. Documents the fragile pattern.
    const mocked = stubDb({
      jobListing: { findFirst: mock(async () => ({ id: "j1" })) },
    });
    await updateJobListing("user-1", "j1", formData({ status: "APPLIED" }));
    const updateArg = mocked.jobListing.update.mock.calls[0][0] as {
      where: Record<string, string>;
    };
    expect(updateArg.where).not.toHaveProperty("userId");
  });
});

describe("deleteJobListing", () => {
  test("deletes owned jobs and returns the deleted row", async () => {
    const mocked = stubDb({
      jobListing: { findFirst: mock(async () => ({ id: "j1" })) },
    });
    const result = await deleteJobListing("user-1", "j1");
    expect(result.success).toBe(true);
    expect(mocked.jobListing.delete).toHaveBeenCalled();
  });

  test("refuses another user's job", async () => {
    const mocked = stubDb({
      jobListing: { findFirst: mock(async () => null) },
    });
    const result = await deleteJobListing("attacker", "victim-job");
    expect(result).toEqual({ success: false, error: "Job not found" });
    expect(mocked.jobListing.delete).not.toHaveBeenCalled();
  });
});

describe("importJobs", () => {
  const good = {
    id: "x",
    userId: "u",
    title: "T",
    company: "C",
    location: "L",
    url: null,
    description: "D",
    salary: null,
    experience: "Junior",
    visa: null,
    type: "remote",
    country: null,
    status: "OPEN",
    notes: null,
    appliedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;

  test("imports valid rows and reports per-row errors", async () => {
    const mocked = stubDb();
    const result = await importJobs("user-1", [
      good,
      { ...good, title: "" } as never,
    ]);
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].index).toBe(1);
    expect(mocked.jobListing.createMany).toHaveBeenCalled();
  });

  test("skips createMany when nothing is valid", async () => {
    const mocked = stubDb();
    const result = await importJobs("user-1", [
      { ...good, title: "" } as never,
    ]);
    expect(result.imported).toBe(0);
    expect(mocked.jobListing.createMany).not.toHaveBeenCalled();
  });

  test("handles an empty batch", async () => {
    const mocked = stubDb();
    expect(await importJobs("user-1", [])).toEqual({ imported: 0, errors: [] });
    expect(mocked.jobListing.createMany).not.toHaveBeenCalled();
  });
});

describe("bulkCreateJobsFromResearch", () => {
  const streamed = {
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
  } as never;

  test("returns zeros for an empty batch without touching the DB", async () => {
    const mocked = stubDb();
    expect(await bulkCreateJobsFromResearch("user-1", [])).toEqual({
      created: 0,
      skipped: 0,
    });
    expect(mocked.user.upsert).not.toHaveBeenCalled();
  });

  test("creates new jobs and ensures the user exists", async () => {
    const mocked = stubDb();
    const result = await bulkCreateJobsFromResearch("user-1", [streamed]);
    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(mocked.user.upsert).toHaveBeenCalled();
    expect(mocked.jobListing.createMany).toHaveBeenCalled();
  });

  test("dedupes within the batch (case-insensitive)", async () => {
    const mocked = stubDb();
    const dup = {
      ...streamed,
      title: "RUST ENGINEER",
      company: "acme",
    } as never;
    const result = await bulkCreateJobsFromResearch("user-1", [streamed, dup]);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    const arg = mocked.jobListing.createMany.mock.calls[0][0] as {
      data: unknown[];
    };
    expect(arg.data.length).toBe(1);
  });

  test("skips rows already in the DB", async () => {
    const mocked = stubDb({
      jobListing: {
        findMany: mock(async () => [
          {
            title: "Rust Engineer",
            company: "Acme",
            url: "https://a.example/j/1",
          },
        ]),
      },
    });
    const result = await bulkCreateJobsFromResearch("user-1", [streamed]);
    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(mocked.jobListing.createMany).not.toHaveBeenCalled();
  });

  test("counts invalid streamed jobs as skipped", async () => {
    const mocked = stubDb();
    const result = await bulkCreateJobsFromResearch("user-1", [
      { ...streamed, title: "" } as never,
    ]);
    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(mocked.jobListing.createMany).not.toHaveBeenCalled();
  });
});
