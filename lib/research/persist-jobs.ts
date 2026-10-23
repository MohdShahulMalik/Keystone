import { db } from "@/lib/db";
import {
  classifyDbError,
  getDbReadTimeoutMs,
  withResilientDb,
} from "@/lib/db-errors";
import type { StreamedJob } from "@/lib/research/job-schema";
import { addJobSchema } from "@/lib/schemas/jobs";

/**
 * Queued incremental persist for streamed research jobs.
 * Called from the SSE pipeline (`lib/research/stream.ts`) as jobs are parsed.
 * Batches are validated via `addJobSchema`, deduped against existing rows
 * (title+company+url per user) and inserted via `createMany`.
 * This is the single write path for research -> JobListing.
 *
 * Kept OUT of `app/actions/jobs.ts` ("use server") — it takes a server-resolved
 * userId, and every export of a "use server" module is callable over HTTP.
 */
export async function bulkCreateJobsFromResearch(
  userId: string,
  jobs: StreamedJob[],
): Promise<{ created: number; skipped: number }> {
  if (jobs.length === 0) return { created: 0, skipped: 0 };

  // The userId comes from an authenticated Better Auth session
  // (`startResearch` -> stream ctx), so the User row already exists.
  // Throws (never the raw driver value) on DB failure so the SSE pipeline's
  // retry/dead-letter logic in `lib/research/stream.ts` still engages — but
  // the throw is always a real `Error` with a serializable `cause`, never a
  // bare `ErrorEvent` that cannot be logged or cloned.
  try {
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
