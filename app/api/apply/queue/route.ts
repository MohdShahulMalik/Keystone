import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getDbReadTimeoutMs, withResilientDb } from "@/lib/db-errors";

// Agent-facing read queue. Keystone is the bulk source; the agent polls this
// on localhost instead of scraping the UI.
// GET /api/apply/queue?status=OPEN&limit=50 -> [{id,title,company,url,...}]
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "OPEN";
  const limitRaw = req.nextUrl.searchParams.get("limit") ?? "50";
  const limit = Math.min(Math.max(Number.parseInt(limitRaw, 10) || 50, 1), 200);

  if (!["OPEN", "APPLIED"].includes(status)) {
    return Response.json(
      { error: "status must be OPEN or APPLIED" },
      { status: 400 },
    );
  }

  try {
    const jobs = await withResilientDb(
      () =>
        db.jobListing.findMany({
          // Single-user local-first (see app/listings/page.tsx:5 userId "maxum").
          where: { userId: "maxum", status: status as "OPEN" | "APPLIED" },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            url: true,
            type: true,
            country: true,
            status: true,
          },
        }),
      getDbReadTimeoutMs(),
    );
    return Response.json({ jobs, count: jobs.length });
  } catch (error) {
    console.error("[apply-queue] failed:", error);
    return Response.json({ error: "queue unavailable" }, { status: 503 });
  }
}
