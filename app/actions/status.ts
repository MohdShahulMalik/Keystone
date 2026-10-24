"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";
import { ChangeStatusSchema } from "@/lib/schemas/status";
import { requireUserId } from "@/lib/session-guard";
import type { JobStatus } from "@/lib/types/status";

/**
 * Log-only revalidation: a cache-refresh failure must never turn a
 * successful status update into a client-visible failure.
 */
function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch (error) {
    console.error(`[revalidate ${path}] failed:`, error);
  }
}

export async function updateStatus(id: string, status: JobStatus) {
  const userId = await requireUserId();
  const parsed = ChangeStatusSchema.safeParse({ status });

  if (!parsed.success) {
    return { success: false, error: "Invalid status" };
  }

  try {
    const job = await withResilientDb(
      () =>
        db.jobListing.findFirst({
          where: { id, userId },
        }),
      getDbReadTimeoutMs(),
    );

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    if (job.status === status) {
      return { success: true };
    }

    // "Open"/"Saved" is the default resting state — only transitions into
    // meaningful statuses count as activity (heatmap, dashboards).
    const data =
      status === "OPEN"
        ? { status }
        : { status, statusChanges: { create: { toStatus: status } } };

    await withResilientDb(
      () => db.jobListing.update({ where: { id }, data }),
      getDbReadTimeoutMs(),
    );

    safeRevalidate("/listings");
    safeRevalidate("/dashboard");
    return { success: true };
  } catch (error) {
    // Keep the full throw server-side, but return a serializable shape the
    // client can distinguish: connectivity failures (`ErrorEvent`, P1001…,
    // timeout) carry a `cause`/`code`, generic query errors stay opaque.
    // Never embed the raw error — an `ErrorEvent` cannot cross Flight.
    console.error("Failed to update status:", error);
    const failure = classifyDbError(error);
    if (failure) {
      return {
        success: false,
        error: "Failed to update status",
        cause: failure.cause,
        code: failure.code,
      };
    }
    return { success: false, error: "Failed to update status" };
  }
}
