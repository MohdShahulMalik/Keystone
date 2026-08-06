"use server";

import { z } from "zod";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { PDFParse } from "pdf-parse";
import { db } from "@/lib/db";
import { resumeFileSchema } from "@/lib/schemas/resumes";
import type { ResumeActionResponse } from "@/lib/types/resumes";

const UPLOAD_DIR = join(process.cwd(), "uploads", "resumes");

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

export async function uploadResume(
  userId: string,
  file: File,
): Promise<ResumeActionResponse> {
  const parsed = resumeFileSchema.safeParse({ file });
  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  const existing = await db.resume.findUnique({ where: { userId } });
  if (existing) {
    return {
      success: false,
      error: "Resume already exists. Use update instead.",
    };
  }

  const [content, buffer] = await extractTextFromPDF(file);
  const filePath = getFilePath(userId, file.name);

  await writeFile(filePath, buffer);

  const resume = await db.resume.create({
    data: {
      userId,
      fileName: file.name,
      filePath,
      content,
      parsedAt: new Date(),
    },
  });

  return { success: true, data: resume };
}

export async function updateResume(
  userId: string,
  file: File,
): Promise<ResumeActionResponse> {
  const parsed = resumeFileSchema.safeParse({ file });
  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  const existing = await db.resume.findUnique({ where: { userId } });
  if (!existing) {
    return { success: false, error: "No resume found. Use upload instead." };
  }

  await rm(existing.filePath, { force: true });

  const [content, buffer] = await extractTextFromPDF(file);
  const filePath = getFilePath(userId, file.name);

  await writeFile(filePath, buffer);

  const resume = await db.resume.update({
    where: { userId },
    data: {
      fileName: file.name,
      filePath,
      content,
      parsedAt: new Date(),
    },
  });

  return { success: true, data: resume };
}

export async function deleteResume(
  userId: string,
): Promise<ResumeActionResponse> {
  const existing = await db.resume.findUnique({ where: { userId } });
  if (!existing) {
    return { success: false, error: "No resume found" };
  }

  await rm(existing.filePath, { force: true });
  await db.resume.delete({ where: { userId } });

  return { success: true, data: existing };
}
