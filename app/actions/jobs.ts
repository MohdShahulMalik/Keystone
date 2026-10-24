"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";
import {
  addJobSchema,
  deleteJobSchema,
  updateJobSchema,
} from "@/lib/schemas/jobs";
import { requireUserId } from "@/lib/session-guard";
import type {
  JobActionResponse,
  JobImportResponse,
  JobImportResult,
  JobListing,
} from "@/lib/types/jobs";

/**
 * revalidatePath failing must never roll a successful DB write back into a
 * client-visible "Failed to …" error, so it is called outside any try that
 * covers the write, and its own failure is log-only.
 */
function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch (error) {
    console.error(`[revalidate ${path}] failed:`, error);
  }
}

export async function getJobListings(): Promise<JobListing[]> {
  const userId = await requireUserId();
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

export async function addJobListing(formData: FormData) {
  const userId = await requireUserId();
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
    safeRevalidate("/listings");
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
  jobId: string,
  formData: FormData,
): Promise<JobActionResponse> {
  const userId = await requireUserId();
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

    safeRevalidate("/listings");
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
  jobId: string,
): Promise<JobActionResponse> {
  const userId = await requireUserId();
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

    safeRevalidate("/listings");
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
  jobs: JobListing[],
): Promise<JobImportResponse> {
  const userId = await requireUserId();
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
    safeRevalidate("/listings");
  }

  return { imported: valid.length, errors };
}
