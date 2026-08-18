"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ChangeStatusSchema } from "@/lib/schemas/status";
import type { JobStatus } from "@/lib/types/status";

export async function updateStatus(id: string, status: JobStatus) {
  const parsed = ChangeStatusSchema.safeParse({ status });

  if (!parsed.success) {
    return { success: false, error: "Invalid status" };
  }

  try {
    const job = await db.jobListing.findUnique({
      where: { id },
    });

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    await db.jobListing.update({
      where: { id },
      data: { status },
    });

    revalidatePath("/listings");
    return { success: true };
  } catch (error) {
    console.error("Failed to update status:", error);
    return { success: false, error: "Failed to update status" };
  }
}
