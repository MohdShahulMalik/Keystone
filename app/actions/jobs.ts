"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import {
  addJobSchema,
  updateJobSchema,
  deleteJobSchema,
} from "@/lib/schemas/jobs";
import type {
  JobActionResponse,
  JobImportResponse,
  JobImportResult,
  JobListing,
} from "@/lib/types/jobs";

export async function addJobListing(userId: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = addJobSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors };
  }

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
