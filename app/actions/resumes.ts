"use server";

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";
import { resumeFileSchema } from "@/lib/schemas/resumes";
import { requireUserId } from "@/lib/session-guard";
import type { ResumeActionResponse } from "@/lib/types/resumes";

const UPLOAD_DIR = join(process.cwd(), "uploads", "resumes");

async function ensureUploadDir(): Promise<void> {
  // `uploads/` is gitignored and may not exist on a fresh checkout or a
  // fresh container volume — writeFile alone would throw ENOENT.
  await mkdir(UPLOAD_DIR, { recursive: true });
}

async function extractTextFromPDF(file: File): Promise<[string, Buffer]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return [result.text, buffer];
  } finally {
    await parser.destroy();
  }
}

function getFilePath(userId: string, fileName: string): string {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return join(UPLOAD_DIR, `${userId}_${timestamp}_${safeName}`);
}

/** Map a generic create/update failure to a client-friendly message. */
function dbSaveError(error: unknown): {
  success: false;
  error: string;
  cause?: string;
  code?: string;
} {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  ) {
    return {
      success: false,
      error: "Resume already exists. Use update instead.",
    };
  }
  const failure = classifyDbError(error);
  console.error("[resumes] db save failed:", failure ?? error);
  return {
    success: false,
    error: "Failed to save resume",
    ...(failure ? { cause: failure.cause, code: failure.code } : {}),
  };
}

export async function uploadResume(file: File): Promise<ResumeActionResponse> {
  const userId = await requireUserId();
  const parsed = resumeFileSchema.safeParse({ file });
  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  const existing = await withResilientDb(
    () => db.resume.findUnique({ where: { userId } }),
    getDbReadTimeoutMs(),
  );
  if (existing) {
    return {
      success: false,
      error: "Resume already exists. Use update instead.",
    };
  }

  // Parse and write the new file BEFORE touching the DB. If the DB write
  // fails the file is orphaned on disk, but the user keeps their resume and
  // can retry; no DB row ever points at a missing file.
  const [content, buffer] = await extractTextFromPDF(file);
  const filePath = getFilePath(userId, file.name);
  await ensureUploadDir();
  await writeFile(filePath, buffer);

  try {
    const resume = await withResilientDb(
      () =>
        db.resume.create({
          data: {
            userId,
            fileName: file.name,
            filePath,
            content,
            parsedAt: new Date(),
          },
        }),
      getDbReadTimeoutMs(),
    );

    return { success: true, data: resume };
  } catch (error) {
    // The file is orphaned on disk but the user can simply retry; no DB row
    // points at a missing file.
    return dbSaveError(error);
  }
}

export async function updateResume(file: File): Promise<ResumeActionResponse> {
  const userId = await requireUserId();
  const parsed = resumeFileSchema.safeParse({ file });
  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  const existing = await withResilientDb(
    () => db.resume.findUnique({ where: { userId } }),
    getDbReadTimeoutMs(),
  );
  if (!existing) {
    return { success: false, error: "No resume found. Use upload instead." };
  }

  // Parse and write the NEW file, update the DB row, and only then remove
  // the OLD file. Deleting the old file first would leave the user's resume
  // gone from disk if PDF extraction or the write failed, plus the DB row
  // pointing at it.
  const [content, buffer] = await extractTextFromPDF(file);
  const filePath = getFilePath(userId, file.name);
  await ensureUploadDir();
  await writeFile(filePath, buffer);

  const resume = await withResilientDb(
    () =>
      db.resume.update({
        where: { userId },
        data: {
          fileName: file.name,
          filePath,
          content,
          parsedAt: new Date(),
        },
      }),
    getDbReadTimeoutMs(),
  );

  await rm(existing.filePath, { force: true });

  return { success: true, data: resume };
}

export async function deleteResume(): Promise<ResumeActionResponse> {
  const userId = await requireUserId();
  const existing = await withResilientDb(
    () => db.resume.findUnique({ where: { userId } }),
    getDbReadTimeoutMs(),
  );
  if (!existing) {
    return { success: false, error: "No resume found" };
  }

  // Delete the DB row FIRST. The extracted text is stored in the row's
  // `content` column, so removing the row is the destructive step; the file
  // cleanup that follows is best-effort — a failed rm only leaves an orphan
  // file, while the reverse order could lose the file of an existing row.
  try {
    await withResilientDb(
      () => db.resume.delete({ where: { userId } }),
      getDbReadTimeoutMs(),
    );
  } catch (error) {
    return dbSaveError(error);
  }

  await rm(existing.filePath, { force: true });

  return { success: true, data: existing };
}
