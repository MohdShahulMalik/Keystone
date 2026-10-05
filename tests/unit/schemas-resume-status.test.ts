// Intent: resume uploads accept exactly one PDF <= 5MB per user;
// status changes accept exactly the six JobListingStatus values.
import { describe, expect, test } from "bun:test";
import { resumeFileSchema } from "@/lib/schemas/resumes";
import { ChangeStatusSchema } from "@/lib/schemas/status";

function pdfFile(name = "resume.pdf", size = 1024, type = "application/pdf") {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

describe("resumeFileSchema", () => {
  test("accepts a small PDF", () => {
    expect(resumeFileSchema.safeParse({ file: pdfFile() }).success).toBe(true);
  });

  test("rejects empty file", () => {
    expect(
      resumeFileSchema.safeParse({ file: pdfFile("r.pdf", 0) }).success,
    ).toBe(false);
  });

  test("rejects non-PDF mime types", () => {
    const png = new File([new Uint8Array(100)], "r.png", {
      type: "image/png",
    });
    expect(resumeFileSchema.safeParse({ file: png }).success).toBe(false);
    const txt = new File([new Uint8Array(100)], "r.txt", {
      type: "text/plain",
    });
    expect(resumeFileSchema.safeParse({ file: txt }).success).toBe(false);
  });

  test("rejects files over 5MB", () => {
    expect(
      resumeFileSchema.safeParse({
        file: pdfFile("big.pdf", 5 * 1024 * 1024 + 1),
      }).success,
    ).toBe(false);
  });

  test("accepts exactly 5MB (boundary is inclusive)", () => {
    expect(
      resumeFileSchema.safeParse({
        file: pdfFile("edge.pdf", 5 * 1024 * 1024),
      }).success,
    ).toBe(true);
  });

  test("rejects missing file", () => {
    expect(resumeFileSchema.safeParse({}).success).toBe(false);
  });
});

describe("ChangeStatusSchema", () => {
  test.each([
    "OPEN",
    "APPLIED",
    "INTERVIEW",
    "OFFER",
    "REJECTED",
    "DECLINED",
  ] as const)("accepts %s", (status) => {
    expect(ChangeStatusSchema.safeParse({ status }).success).toBe(true);
  });

  test("rejects legacy PLAN.md statuses (DISCOVERED/SAVED are not in the prisma enum)", () => {
    expect(ChangeStatusSchema.safeParse({ status: "SAVED" }).success).toBe(
      false,
    );
    expect(ChangeStatusSchema.safeParse({ status: "DISCOVERED" }).success).toBe(
      false,
    );
  });

  test("rejects lowercase and unknown values", () => {
    expect(ChangeStatusSchema.safeParse({ status: "open" }).success).toBe(
      false,
    );
    expect(ChangeStatusSchema.safeParse({ status: "HIRED" }).success).toBe(
      false,
    );
    expect(ChangeStatusSchema.safeParse({}).success).toBe(false);
  });
});
