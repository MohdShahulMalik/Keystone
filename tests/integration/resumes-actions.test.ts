// Intent: exactly one resume per user (userId unique). upload rejects
// duplicates; update requires an existing row (and removes the old file);
// delete requires an existing row (and removes the file). Only PDFs <= 5MB;
// content is extracted text with parsedAt set. File writes happen BEFORE the
// DB row is created (crash between the two orphans a file — probed below).
import { beforeEach, describe, expect, mock, test } from "bun:test";

const writeFile = mock(async (_p: string, _b: Buffer) => {});
const rm = mock(async (_p: string, _o?: unknown) => {});
mock.module("node:fs/promises", () => ({ writeFile, rm }));

const getText = mock(async () => ({ text: "extracted resume text" }));
const destroy = mock(async () => {});
mock.module("pdf-parse", () => ({
  PDFParse: class {
    constructor(_opts: unknown) {
      void _opts;
    }
    getText = getText;
    destroy = destroy;
  },
}));

const { db } = await import("@/lib/db");
const resumes = await import("@/app/actions/resumes");

function pdfFile(size = 1024) {
  return new File([new Uint8Array(size)], "resume.pdf", {
    type: "application/pdf",
  });
}

function stubResume(methods: Record<string, unknown>) {
  const target = (db as unknown as Record<string, object>).resume;
  if (target) Object.assign(target, methods);
  else (db as unknown as Record<string, object>).resume = methods as object;
}

beforeEach(() => {
  writeFile.mockClear();
  rm.mockClear();
  getText.mockClear();
  stubResume({
    findUnique: mock(async () => null),
    create: mock(async (args: unknown) => ({
      id: "r1",
      ...(args as { data: object }).data,
    })),
    update: mock(async (args: unknown) => ({
      id: "r1",
      ...(args as { data: object }).data,
    })),
    delete: mock(async () => ({ id: "r1" })),
  });
});

describe("uploadResume", () => {
  test("creates a resume with extracted content and parsedAt", async () => {
    const result = await resumes.uploadResume("user-1", pdfFile());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.content).toBe("extracted resume text");
    expect(result.data.parsedAt).toBeInstanceOf(Date);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  test("rejects a second upload for the same user", async () => {
    stubResume({ findUnique: mock(async () => ({ id: "existing" })) });
    const result = await resumes.uploadResume("user-1", pdfFile());
    expect(result).toEqual({
      success: false,
      error: "Resume already exists. Use update instead.",
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  test("rejects non-PDF / oversized files without touching fs or db", async () => {
    const create = mock(async () => ({}));
    stubResume({ findUnique: mock(async () => null), create });
    const png = new File([new Uint8Array(10)], "r.png", { type: "image/png" });
    expect((await resumes.uploadResume("user-1", png)).success).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test("stored file stays inside the upload dir (no path traversal)", async () => {
    const { join, normalize, relative, sep } = await import("node:path");
    const evil = new File([new Uint8Array(10)], "../../evil.pdf", {
      type: "application/pdf",
    });
    const result = await resumes.uploadResume("user-1", evil);
    expect(result.success).toBe(true);
    const stored = writeFile.mock.calls[0][0] as string;
    const uploadDir =
      normalize(join(process.cwd(), "uploads", "resumes")) + sep;
    expect(normalize(stored).startsWith(uploadDir)).toBe(true);
    // relative path from the upload dir must not escape it
    expect(relative(uploadDir, stored).startsWith("..")).toBe(false);
    expect(stored).toContain("user-1_");
  });
});

describe("updateResume", () => {
  test("replaces content and removes the old file", async () => {
    stubResume({
      findUnique: mock(async () => ({ id: "r1", filePath: "/old/resume.pdf" })),
    });
    const result = await resumes.updateResume("user-1", pdfFile());
    expect(result.success).toBe(true);
    expect(rm).toHaveBeenCalledWith("/old/resume.pdf", { force: true });
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  test("refuses when no resume exists", async () => {
    stubResume({ findUnique: mock(async () => null) });
    expect(await resumes.updateResume("user-1", pdfFile())).toEqual({
      success: false,
      error: "No resume found. Use upload instead.",
    });
    expect(rm).not.toHaveBeenCalled();
  });
});

describe("deleteResume", () => {
  test("removes the file and the row", async () => {
    stubResume({
      findUnique: mock(async () => ({ id: "r1", filePath: "/old/r.pdf" })),
      delete: mock(async () => ({})),
    });
    const result = await resumes.deleteResume("user-1");
    expect(result.success).toBe(true);
    expect(rm).toHaveBeenCalledWith("/old/r.pdf", { force: true });
  });

  test("reports when there is nothing to delete", async () => {
    stubResume({ findUnique: mock(async () => null) });
    expect(await resumes.deleteResume("user-1")).toEqual({
      success: false,
      error: "No resume found",
    });
    expect(rm).not.toHaveBeenCalled();
  });

  test("INTENT PROBE: file is deleted BEFORE the DB row — a DB failure loses the file", async () => {
    // rm() runs first, then db.resume.delete. If delete throws, the file is
    // already gone while the row remains — resume content unrecoverable.
    // Robust order would be DB-first (or transactional outbox).
    stubResume({
      findUnique: mock(async () => ({ id: "r1", filePath: "/old/r.pdf" })),
      delete: mock(async () => {
        throw new Error("db down");
      }),
    });
    await expect(resumes.deleteResume("user-1")).rejects.toThrow("db down");
    expect(rm).toHaveBeenCalled(); // file gone despite overall failure
  });
});
