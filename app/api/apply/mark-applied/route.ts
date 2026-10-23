import { z } from "zod";
import { resolveApplyTargetUserId } from "@/lib/apply-auth";
import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";

const bodySchema = z.object({
  id: z.string().min(1),
  // Required for agent callers (Bearer token); ignored for session callers.
  userId: z.string().min(1).optional(),
});

// Agent calls this ONLY after the human has reviewed the filled form
// (screenshot in fixes/apply/<jobId>/) and the application was submitted.
// POST /api/apply/mark-applied { "id": "<jobId>", "userId": "<ownerId>" }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // Caller identity (see lib/apply-auth.ts): an agent with the Bearer
  // APPLY_AGENT_TOKEN must pass userId in the body; a browser request uses
  // its session user. No default user is assumed.
  const userId = await resolveApplyTargetUserId(
    req,
    parsed.data.userId ?? null,
  );
  if (!userId) {
    return Response.json(
      {
        error:
          "Unauthorized — sign in (browser) or send Authorization: Bearer <APPLY_AGENT_TOKEN> with userId in the body (agent)",
      },
      { status: 401 },
    );
  }

  try {
    const job = await withResilientDb(
      () =>
        db.jobListing.findFirst({
          where: { id: parsed.data.id, userId },
        }),
      getDbReadTimeoutMs(),
    );
    if (!job) {
      return Response.json({ error: "job not found" }, { status: 404 });
    }
    await withResilientDb(
      () =>
        db.jobListing.update({
          where: { id: job.id },
          data: { status: "APPLIED", appliedAt: new Date() },
        }),
      getDbReadTimeoutMs(),
    );
    return Response.json({ success: true, id: job.id });
  } catch (error) {
    console.error("[mark-applied] failed:", error);
    const failure = classifyDbError(error);
    return Response.json(
      { error: "update failed", ...(failure ?? {}) },
      { status: 503 },
    );
  }
}
