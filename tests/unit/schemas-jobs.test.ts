// Intent: `addJobSchema` is the single validation gate for every job write
// (manual add, bulk import, streamed research jobs). Required: title, company,
// location, description, experience. Optional/nullable: url, salary, visa,
// country, notes. status defaults OPEN, type defaults remote.
import { describe, expect, test } from "bun:test";
import {
  addJobSchema,
  deleteJobSchema,
  updateJobSchema,
} from "@/lib/schemas/jobs";

const validJob = {
  title: "Junior Rust Engineer",
  company: "Acme",
  location: "Remote - USA",
  description: "Build things with Rust.",
  experience: "Junior",
};

describe("addJobSchema — required fields", () => {
  test("accepts a minimal valid job and applies defaults", () => {
    const parsed = addJobSchema.safeParse(validJob);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.status).toBe("OPEN");
    expect(parsed.data.type).toBe("remote");
    // nullable optionals normalize to null (downstream expects null, not undefined)
    expect(parsed.data.url).toBeNull();
    expect(parsed.data.salary).toBeNull();
    expect(parsed.data.country).toBeNull();
    expect(parsed.data.notes).toBeNull();
  });

  test.each([
    "title",
    "company",
    "location",
    "description",
    "experience",
  ] as const)("rejects empty %s", (field) => {
    const parsed = addJobSchema.safeParse({ ...validJob, [field]: "" });
    expect(parsed.success).toBe(false);
  });

  test.each([
    "title",
    "company",
    "location",
    "description",
    "experience",
  ] as const)("rejects missing %s", (field) => {
    const { [field]: _omitted, ...rest } = validJob;
    expect(addJobSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects null location (schema requires non-empty string)", () => {
    // NOTE: the .transform() below the schema contains `location: data.location ?? null`,
    // which suggests null was once intended — but the input schema rejects it.
    expect(
      addJobSchema.safeParse({ ...validJob, location: null }).success,
    ).toBe(false);
  });
});

describe("addJobSchema — url", () => {
  test("accepts a valid https URL", () => {
    const parsed = addJobSchema.safeParse({
      ...validJob,
      url: "https://example.com/jobs/123",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects a non-URL string", () => {
    expect(
      addJobSchema.safeParse({ ...validJob, url: "not-a-url" }).success,
    ).toBe(false);
  });

  test("accepts null and undefined url", () => {
    expect(addJobSchema.safeParse({ ...validJob, url: null }).success).toBe(
      true,
    );
    expect(addJobSchema.safeParse(validJob).success).toBe(true);
  });

  test("rejects empty-string url (unlike StreamedJobSchema which coerces it to null)", () => {
    // Intent mismatch probe: StreamedJobSchema maps "" -> null, addJobSchema does not.
    expect(addJobSchema.safeParse({ ...validJob, url: "" }).success).toBe(
      false,
    );
  });
});

describe("addJobSchema — type/status intent", () => {
  test("accepts the three documented job types", () => {
    for (const type of ["remote", "hybrid", "onsite"]) {
      expect(addJobSchema.safeParse({ ...validJob, type }).success).toBe(true);
    }
  });

  test("INTENT: type should be one of remote|hybrid|onsite (PLAN + StreamedJobSchema agree)", () => {
    // The schema declares `type: z.string().default("remote")` — any string passes.
    // Intended behaviour per PLAN.md / StreamedJobSchema is a 3-value enum.
    // This test documents intent and FAILS against the current loose schema.
    expect(
      addJobSchema.safeParse({ ...validJob, type: "contract" }).success,
    ).toBe(false);
    expect(
      addJobSchema.safeParse({ ...validJob, type: "FULL-TIME" }).success,
    ).toBe(false);
  });

  test("accepts all six documented statuses", () => {
    for (const status of [
      "OPEN",
      "APPLIED",
      "INTERVIEW",
      "OFFER",
      "REJECTED",
      "DECLINED",
    ]) {
      expect(addJobSchema.safeParse({ ...validJob, status }).success).toBe(
        true,
      );
    }
  });

  test("rejects unknown status", () => {
    expect(
      addJobSchema.safeParse({ ...validJob, status: "SAVED" }).success,
    ).toBe(false);
  });
});

describe("updateJobSchema — partial updates", () => {
  test("accepts a single-field patch", () => {
    const parsed = updateJobSchema.safeParse({ status: "APPLIED" });
    expect(parsed.success).toBe(true);
  });

  test("accepts an empty patch object (all fields optional)", () => {
    expect(updateJobSchema.safeParse({}).success).toBe(true);
  });

  test("still validates provided fields", () => {
    expect(updateJobSchema.safeParse({ title: "" }).success).toBe(false);
    expect(updateJobSchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(updateJobSchema.safeParse({ url: "garbage" }).success).toBe(false);
  });
});

describe("deleteJobSchema", () => {
  test("accepts a non-empty jobId", () => {
    expect(deleteJobSchema.safeParse({ jobId: "abc123" }).success).toBe(true);
  });

  test("rejects empty/missing jobId", () => {
    expect(deleteJobSchema.safeParse({ jobId: "" }).success).toBe(false);
    expect(deleteJobSchema.safeParse({}).success).toBe(false);
  });
});
