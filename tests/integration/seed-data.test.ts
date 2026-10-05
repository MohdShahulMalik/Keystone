// Intent: scripts/generate-jobs.ts + import-tex.ts feed data/imported-jobs.json,
// which scripts/import-to-db.ts batch-inserts (BATCH_SIZE 50) as JobListings.
// Every entry must therefore satisfy addJobSchema (the DB write gate), and
// ideally the StreamedJob contract (lowercase remote|hybrid|onsite type,
// usable url). Failures here mean the seed/import pipeline ships rows the app
// would reject or render inconsistently.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addJobSchema } from "@/lib/schemas/jobs";

interface SeedJob {
  title: string;
  company: string;
  location: string;
  url: string | null;
  description: string;
  salary: string | null;
  experience: string;
  visa: string | null;
  type: string;
  country: string | null;
  notes: string | null;
}

const jobs: SeedJob[] = JSON.parse(
  readFileSync(join(import.meta.dir, "../../data/imported-jobs.json"), "utf-8"),
);

describe("seed data shape", () => {
  test("dataset is non-empty", () => {
    expect(jobs.length).toBeGreaterThan(0);
  });

  test("every entry passes addJobSchema (the import write gate)", () => {
    const failures = jobs
      .map((job, index) => ({
        job,
        index,
        parsed: addJobSchema.safeParse(job),
      }))
      .filter((r) => !r.parsed.success);
    expect(
      failures.map((f) => ({
        index: f.index,
        company: (f.job as SeedJob).company,
        title: (f.job as SeedJob).title,
        error: !f.parsed.success ? f.parsed.error.issues : null,
      })),
    ).toEqual([]);
  });

  test("INTENT: type should be lowercase remote|hybrid|onsite", () => {
    const bad = jobs.filter(
      (j) => !["remote", "hybrid", "onsite"].includes(j.type),
    );
    expect(bad.map((j) => ({ company: j.company, type: j.type }))).toEqual([]);
  });

  test("urls are either null or valid http(s) URLs", () => {
    const bad = jobs.filter((j) => {
      if (j.url === null) return false;
      try {
        const u = new URL(j.url);
        return u.protocol !== "http:" && u.protocol !== "https:";
      } catch {
        return true;
      }
    });
    expect(bad.map((j) => ({ company: j.company, url: j.url }))).toEqual([]);
  });

  test("required text fields are non-empty", () => {
    for (const [i, j] of jobs.entries()) {
      for (const field of [
        "title",
        "company",
        "location",
        "description",
        "experience",
      ] as const) {
        expect(
          typeof j[field] === "string" && (j[field] as string).length > 0,
          `row ${i} field ${field}`,
        ).toBe(true);
      }
    }
  });

  test("INTENT PROBE: experience labels are free-form (prompt wants Junior|Mid|Senior|Lead|Staff)", () => {
    // Documents how far seed data drifts from the prompt's level taxonomy.
    const canonical = new Set(["Junior", "Mid", "Senior", "Lead", "Staff"]);
    const nonCanonical = new Set(
      jobs.map((j) => j.experience).filter((e) => !canonical.has(e)),
    );
    // This assertion pins current reality: seed data does NOT use the taxonomy.
    // If the pipeline is ever normalized, flip this test to expect size 0.
    expect(nonCanonical.size).toBeGreaterThan(0);
  });
});
