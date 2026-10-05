// Intent: prompt/title helpers shape what the AI is asked and what the
// sidebar shows. buildSessionTitle -> "Skills · jobTypes · Countries" (<=80
// chars, max 3 items per facet). deriveSessionTitle repairs legacy rows by
// parsing the stored query text. buildResearchPrompt embeds criteria + optional
// notes/resume and always ends with the JOB_JSON streaming instruction.
import { describe, expect, test } from "bun:test";
import {
  buildResearchPrompt,
  buildSessionTitle,
  deriveSessionTitle,
} from "@/lib/opencode/prompts";

describe("buildSessionTitle", () => {
  test("joins skills · jobTypes · countries", () => {
    expect(
      buildSessionTitle({
        skills: ["React", "TypeScript"],
        jobTypes: ["remote"],
        countries: ["USA", "UK"],
      }),
    ).toBe("React, TypeScript · remote · USA, UK");
  });

  test("omits empty facets without stray separators", () => {
    expect(buildSessionTitle({ skills: ["Rust"] })).toBe("Rust");
    expect(buildSessionTitle({ jobTypes: ["remote"] })).toBe("remote");
    expect(buildSessionTitle({ countries: ["USA"] })).toBe("USA");
  });

  test("falls back when everything is empty", () => {
    expect(buildSessionTitle({})).toBe("Research session");
    expect(buildSessionTitle({ skills: [], jobTypes: [], countries: [] })).toBe(
      "Research session",
    );
  });

  test("trims, drops blanks/non-strings, caps at 3 per facet", () => {
    expect(
      buildSessionTitle({
        skills: [
          "  React  ",
          "",
          "Node.js",
          "Python",
          "Go",
          42 as unknown as string,
        ],
        jobTypes: ["remote"],
        countries: ["USA"],
      }),
    ).toBe("React, Node.js, Python · remote · USA");
  });

  test("caps total length at 80 chars", () => {
    const title = buildSessionTitle({
      skills: ["A".repeat(50), "B".repeat(50)],
      jobTypes: ["remote"],
      countries: ["USA"],
    });
    expect(title.length).toBeLessThanOrEqual(80);
  });
});

describe("deriveSessionTitle — legacy row repair", () => {
  test("prefers structured preferences when present", () => {
    expect(
      deriveSessionTitle(
        { skills: ["Rust"], jobTypes: ["remote"], countries: ["USA"] },
        "ignored query",
      ),
    ).toBe("Rust · remote · USA");
  });

  test("parses Skills/Countries/Job Types lines out of the stored query", () => {
    const query = [
      "Research and find relevant job listings based on these criteria:",
      "",
      "Job Types: remote, hybrid",
      "Countries: USA, UK",
      "Skills: React, Node.js",
    ].join("\n");
    expect(deriveSessionTitle(null, query)).toBe(
      "React, Node.js · remote/hybrid · USA, UK",
    );
  });

  test("falls back to generic title when nothing is parseable", () => {
    expect(deriveSessionTitle(null, null)).toBe("Research session");
    expect(deriveSessionTitle(null, "unrelated text")).toBe("Research session");
    expect(deriveSessionTitle(undefined, undefined)).toBe("Research session");
  });

  test("ignores non-object preferences", () => {
    expect(deriveSessionTitle("nonsense", null)).toBe("Research session");
  });
});

describe("buildResearchPrompt", () => {
  const base = {
    jobTypes: ["remote"],
    countries: ["USA"],
    skills: ["React"],
  };

  test("embeds the three criteria facets", () => {
    const prompt = buildResearchPrompt(base);
    expect(prompt).toContain("Job Types: remote");
    expect(prompt).toContain("Countries: USA");
    expect(prompt).toContain("Skills: React");
  });

  test("appends notes only when provided", () => {
    expect(buildResearchPrompt(base)).not.toContain("Additional Notes");
    expect(
      buildResearchPrompt({ ...base, notes: "senior roles only" }),
    ).toContain("Additional Notes: senior roles only");
  });

  test("appends resume content only when provided", () => {
    expect(buildResearchPrompt(base)).not.toContain("Resume Content");
    expect(
      buildResearchPrompt({ ...base, resumeContent: "5y Rust" }),
    ).toContain("Resume Content: 5y Rust");
  });

  test("always ends with the JOB_JSON streaming instruction", () => {
    expect(buildResearchPrompt(base)).toContain("JOB_JSON");
  });

  test("joins multi-value facets with commas", () => {
    const prompt = buildResearchPrompt({
      jobTypes: ["remote", "hybrid"],
      countries: ["USA", "UK"],
      skills: ["React", "Node.js"],
    });
    expect(prompt).toContain("Job Types: remote, hybrid");
    expect(prompt).toContain("Countries: USA, UK");
    expect(prompt).toContain("Skills: React, Node.js");
  });
});
