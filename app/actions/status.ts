"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";
import { ChangeStatusSchema } from "@/lib/schemas/status";
import type { JobStatus } from "@/lib/types/status";

export async function updateStatus(id: string, status: JobStatus) {
  const parsed = ChangeStatusSchema.safeParse({ status });

  if (!parsed.success) {
    return { success: false, error: "Invalid status" };
  }

  try {
    const job = await withResilientDb(
      () =>
        db.jobListing.findUnique({
          where: { id },
        }),
      getDbReadTimeoutMs(),
    );

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    await withResilientDb(
      () =>
        db.jobListing.update({
          where: { id },
          data: { status },
        }),
      getDbReadTimeoutMs(),
    );

    revalidatePath("/listings");
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
