// Intent: StreamedJobSchema validates each JOB_JSON line the AI streams.
// Contract from RESEARCH_SYSTEM_PROMPT: required title/company/location/
// description/experience/type; nullable url/salary/visa/country/notes;
// experience in Junior|Mid|Senior|Lead|Staff (prompt) — but the schema only
// defaults it; type is a strict remote|hybrid|onsite enum.
import { describe, expect, test } from "bun:test";
import { StreamedJobSchema } from "@/lib/research/job-schema";

const validStreamed = {
  title: "Senior Rust Engineer",
  company: "Acme",
  location: "Remote - USA",
  url: "https://example.com/jobs/123",
  description: "Build distributed systems.",
  salary: "$140k-$180k",
  experience: "Senior",
  visa: "Visa available",
  type: "remote",
  country: "USA",
};

describe("StreamedJobSchema — happy path", () => {
  test("accepts a fully-populated JOB_JSON object", () => {
    expect(StreamedJobSchema.safeParse(validStreamed).success).toBe(true);
  });

  test("applies defaults for missing experience/type", () => {
    const { experience: _e, type: _t, ...rest } = validStreamed;
    const parsed = StreamedJobSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.experience).toBe("Mid");
    expect(parsed.data.type).toBe("remote");
  });

  test("accepts null/undefined optionals", () => {
    const parsed = StreamedJobSchema.safeParse({
      title: "T",
      company: "C",
      location: "L",
      description: "D",
      url: null,
      salary: null,
      visa: undefined,
      country: null,
      notes: null,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("StreamedJobSchema — url coercion", () => {
  test('coerces empty-string url to null (AI often emits "")', () => {
    const parsed = StreamedJobSchema.safeParse({
      ...validStreamed,
      url: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.url).toBeNull();
  });

  test("rejects non-URL strings", () => {
    expect(
      StreamedJobSchema.safeParse({ ...validStreamed, url: "notaurl" }).success,
    ).toBe(false);
  });
});

describe("StreamedJobSchema — strictness gaps (intent probes)", () => {
  test("rejects unknown type values", () => {
    expect(
      StreamedJobSchema.safeParse({ ...validStreamed, type: "contract" })
        .success,
    ).toBe(false);
  });

  test("INTENT: experience should be a level label, but schema accepts anything", () => {
    // Prompt says experience is one of Junior|Mid|Senior|Lead|Staff, yet the
    // schema is z.string().min(1). "1+ year" / "Entry Level / New Grad" (as in
    // scripts/generate-jobs.ts seed data) all pass validation and flow into
    // the DB un-normalized. Documents the gap between prompt and schema.
    expect(
      StreamedJobSchema.safeParse({ ...validStreamed, experience: "1+ year" })
        .success,
    ).toBe(true);
    expect(
      StreamedJobSchema.safeParse({
        ...validStreamed,
        experience: "Entry Level / New Grad",
      }).success,
    ).toBe(true);
  });

  test("rejects empty required fields", () => {
    for (const field of [
      "title",
      "company",
      "location",
      "description",
    ] as const) {
      expect(
        StreamedJobSchema.safeParse({ ...validStreamed, [field]: "" }).success,
      ).toBe(false);
    }
  });

  test("INTENT: StreamedJob type is loose while addJobSchema defaults differ", () => {
    // StreamedJob allows type: undefined -> "remote"; addJobSchema requires an
    // explicit string (defaults only when key missing). A streamed job with
    // type: null would pass StreamedJob? No — enum has no null. Probe:
    expect(
      StreamedJobSchema.safeParse({ ...validStreamed, type: null }).success,
    ).toBe(false);
  });
});
