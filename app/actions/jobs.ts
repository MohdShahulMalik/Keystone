"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import {
  addJobSchema,
  deleteJobSchema,
  updateJobSchema,
} from "@/lib/schemas/jobs";
import type { StreamedJob } from "@/lib/research/job-schema";
import type {
  JobActionResponse,
  JobImportResponse,
  JobImportResult,
  JobListing,
} from "@/lib/types/jobs";
import { revalidatePath } from "next/cache";

export async function getJobListings(userId: string): Promise<JobListing[]> {
  return db.jobListing.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addJobListing(userId: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = addJobSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors };
  }

  revalidatePath("/listings");
  return db.jobListing.create({
    data: {
      userId,
      ...parsed.data,
    },
  });
}

export async function updateJobListing(
  userId: string,
  jobId: string,
  formData: FormData,
): Promise<JobActionResponse> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateJobSchema.safeParse(raw);

  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  const job = await db.jobListing.findFirst({
    where: { id: jobId, userId },
  });

  if (!job) {
    return { success: false, error: "Job not found" };
  }

  const updated = await db.jobListing.update({
    where: { id: jobId },
    data: parsed.data,
  });

  revalidatePath("/listings");
  return { success: true, data: updated };
}

export async function deleteJobListing(
  userId: string,
  jobId: string,
): Promise<JobActionResponse> {
  const parsed = deleteJobSchema.safeParse({ jobId });

  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  const job = await db.jobListing.findFirst({
    where: { id: parsed.data.jobId, userId },
  });

  if (!job) {
    return { success: false, error: "Job not found" };
  }

  await db.jobListing.delete({
    where: { id: parsed.data.jobId },
  });

  revalidatePath("/listings");
  return { success: true, data: job };
}

export async function importJobs(
  userId: string,
  jobs: JobListing[],
): Promise<JobImportResponse> {
  const results: JobImportResult[] = jobs.map((job, index) => {
    const parsed = addJobSchema.safeParse(job);
    if (parsed.success) {
      return { index, success: true, data: parsed.data };
    }
    return { index, success: false, error: parsed.error };
  });

  const valid = results
    .filter((r): r is Extract<JobImportResult, { success: true }> => r.success)
    .map((r) => ({ userId, ...r.data }));

  const errors = results.filter(
    (r): r is Extract<JobImportResult, { success: false }> => !r.success,
  );

  if (valid.length > 0) {
    await db.jobListing.createMany({ data: valid });
  }

  return { imported: valid.length, errors };
}

/**
 * Queued incremental persist for streamed research jobs.
 * Called from the SSE pipeline (`lib/research/stream.ts`) as jobs are parsed.
 * Batches are validated via `addJobSchema`, deduped against existing rows
 * (title+company+url per user) and inserted via `createMany`.
 * This is the single write path for research -> JobListing.
 */
export async function bulkCreateJobsFromResearch(
  userId: string,
  jobs: StreamedJob[],
): Promise<{ created: number; skipped: number }> {
  if (jobs.length === 0) return { created: 0, skipped: 0 };

  // ensure user exists — research was hardcoded to "maxum" without prior upsert
  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  });

  const parsed = jobs
    .map((j) => addJobSchema.safeParse({ ...j, status: "OPEN" as const }))
    .filter((r): r is Extract<typeof r, { success: true }> => r.success)
    .map((r) => r.data);

  if (parsed.length === 0) return { created: 0, skipped: jobs.length };

  // dedupe within batch (title+company+url)
  const seen = new Set<string>();
  const deduped = parsed.filter((j) => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}|${(j.url ?? "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // dedupe against DB — fetch existing candidates for this user.
  // Chunk the OR clause so large streamed batches don't build a huge
  // single query that fails exactly when output volume is highest.
  const DEDUPE_LOOKUP_CHUNK = 50;
  const existing: { title: string; company: string; url: string | null }[] = [];
  for (let i = 0; i < deduped.length; i += DEDUPE_LOOKUP_CHUNK) {
    const chunk = deduped.slice(i, i + DEDUPE_LOOKUP_CHUNK);
    const rows = await db.jobListing.findMany({
      where: {
        userId,
        OR: chunk.map((j) => ({
          title: j.title,
          company: j.company,
        })),
      },
      select: { title: true, company: true, url: true },
    });
    existing.push(...rows);
  }
  const existingKeys = new Set(
    existing.map(
      (e) =>
        `${e.title.toLowerCase()}|${e.company.toLowerCase()}|${(e.url ?? "").toLowerCase()}`,
    ),
  );

  const toCreate = deduped.filter((j) => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}|${(j.url ?? "").toLowerCase()}`;
    return !existingKeys.has(key);
  });

  if (toCreate.length > 0) {
    const CREATE_CHUNK = 50;
    for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
      const chunk = toCreate.slice(i, i + CREATE_CHUNK);
      await db.jobListing.createMany({
        data: chunk.map((j) => ({ userId, ...j })),
      });
    }
  }

  return { created: toCreate.length, skipped: jobs.length - toCreate.length };
}
