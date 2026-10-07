"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";
import type { StreamedJob } from "@/lib/research/job-schema";
import {
  addJobSchema,
  deleteJobSchema,
  updateJobSchema,
} from "@/lib/schemas/jobs";
import type {
  JobActionResponse,
  JobImportResponse,
  JobImportResult,
  JobListing,
} from "@/lib/types/jobs";

export async function getJobListings(userId: string): Promise<JobListing[]> {
  // Never let a driver throw (notably the Neon's bare `ErrorEvent`, which
  // cannot cross the Flight/RSC boundary) escape raw into the listings
  // Server Component — that produced the empty overlay + `GET /listings 500`.
  // Bound the wait (paused Neon computes wake in ~3-5s) and degrade to an
  // empty list; the failure is logged server-side with its serializable
  // cause. `[]` round-trips through Flight safely.
  try {
    return await withResilientDb(
      () =>
        db.jobListing.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
      getDbReadTimeoutMs(),
    );
  } catch (error) {
    console.error("[listings] getJobListings failed:", error);
    return [];
  }
}

export async function addJobListing(userId: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = addJobSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors };
  }

  // Never let a driver throw (notably the Neon's bare `ErrorEvent`, which
  // cannot cross the Flight/RSC boundary) escape raw — return a
  // serializable failure instead. Success shape stays the raw row.
  try {
    const created = await withResilientDb(
      () =>
        db.jobListing.create({
          data: {
            userId,
            ...parsed.data,
          },
        }),
      getDbReadTimeoutMs(),
    );
    revalidatePath("/listings");
    return created;
  } catch (error) {
    console.error("[listings] addJobListing failed:", error);
    return {
      error: "Failed to create job",
      ...(classifyDbError(error) ?? {}),
    };
  }
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

  try {
    const job = await withResilientDb(
      () =>
        db.jobListing.findFirst({
          where: { id: jobId, userId },
        }),
      getDbReadTimeoutMs(),
    );

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const updated = await withResilientDb(
      () =>
        db.jobListing.update({
          where: { id: jobId },
          data: parsed.data,
        }),
      getDbReadTimeoutMs(),
    );

    revalidatePath("/listings");
    return { success: true, data: updated };
  } catch (error) {
    console.error("[listings] updateJobListing failed:", error);
    return {
      success: false,
      error: "Failed to update job",
      ...(classifyDbError(error) ?? {}),
    };
  }
}

export async function deleteJobListing(
  userId: string,
  jobId: string,
): Promise<JobActionResponse> {
  const parsed = deleteJobSchema.safeParse({ jobId });

  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }

  try {
    const job = await withResilientDb(
      () =>
        db.jobListing.findFirst({
          where: { id: parsed.data.jobId, userId },
        }),
      getDbReadTimeoutMs(),
    );

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    await withResilientDb(
      () =>
        db.jobListing.delete({
          where: { id: parsed.data.jobId },
        }),
      getDbReadTimeoutMs(),
    );

    revalidatePath("/listings");
    return { success: true, data: job };
  } catch (error) {
    console.error("[listings] deleteJobListing failed:", error);
    return {
      success: false,
      error: "Failed to delete job",
      ...(classifyDbError(error) ?? {}),
    };
  }
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
    try {
      await withResilientDb(
        () => db.jobListing.createMany({ data: valid }),
        getDbReadTimeoutMs(),
      );
    } catch (error) {
      // The batch failed as a whole — per-row `errors` only cover validation,
      // so report the write failure top-level with a serializable cause.
      console.error("[listings] importJobs failed:", error);
      return {
        imported: 0,
        errors,
        error: "Failed to save imported jobs",
        ...(classifyDbError(error) ?? {}),
      };
    }
    revalidatePath("/listings");
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

  // Throws (never the raw driver value) on DB failure so the SSE pipeline's
  // retry/dead-letter logic in `lib/research/stream.ts` still engages — but
  // the throw is always a real `Error` with a serializable `cause`, never a
  // bare `ErrorEvent` that cannot be logged or cloned.
  try {
    // ensure user exists — research was hardcoded to "maxum" without prior upsert
    await withResilientDb(
      () =>
        db.user.upsert({
          where: { id: userId },
          update: {},
          create: { id: userId },
        }),
      getDbReadTimeoutMs(),
    );

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
    const existing: { title: string; company: string; url: string | null }[] =
      [];
    for (let i = 0; i < deduped.length; i += DEDUPE_LOOKUP_CHUNK) {
      const chunk = deduped.slice(i, i + DEDUPE_LOOKUP_CHUNK);
      const rows = await withResilientDb(
        () =>
          db.jobListing.findMany({
            where: {
              userId,
              OR: chunk.map((j) => ({
                title: j.title,
                company: j.company,
              })),
            },
            select: { title: true, company: true, url: true },
          }),
        getDbReadTimeoutMs(),
      );
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
        await withResilientDb(
          () =>
            db.jobListing.createMany({
              data: chunk.map((j) => ({ userId, ...j })),
            }),
          getDbReadTimeoutMs(),
        );
      }
    }

    return { created: toCreate.length, skipped: jobs.length - toCreate.length };
  } catch (error) {
    const failure = classifyDbError(error);
    console.error(
      "[research] bulkCreateJobsFromResearch failed:",
      failure ?? error,
    );
    throw Object.assign(new Error("Failed to persist researched jobs"), {
      code: failure?.code ?? "DB_PERSIST_FAILED",
      cause: failure?.cause ?? "unknown",
    });
  }
}
