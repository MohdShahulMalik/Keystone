"use server";

import { db } from "@/lib/db";
import type { SearchSessionTitle } from "@/lib/types/search";
import type { SearchSession } from "../generated/prisma";

export async function getSearchSessionsWithMetaData(
  userId: string,
  mode: "job" | "dsa",
): Promise<SearchSessionTitle[]> {
  const sessions = await db.searchSession.findMany({
    select: {
      id: true,
      title: true,
      resultCount: true,
      updatedAt: true,
    },
    where: {
      userId,
      mode,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return sessions;
}

export async function getSearchSessionByAnyId(
  sessionId: string,
): Promise<SearchSession | null> {
  const session = await db.searchSession.findFirst({
    where: {
      OR: [{ id: sessionId }, { openCodeSessionId: sessionId }],
    },
  });

  return session;
}

export async function getSearchSessionHistory(
  dbSessionId: string
) {
  const [segments, results] = await Promise.all([
    db.researchSegment.findMany({
      select: {seq: true, kind: true, text: true, toolId: true, timeTaken: true },
      where: {sessionId: dbSessionId},
      orderBy: {seq: "asc"},
    }),
    db.searchResult.findMany({
      select: { id: true, jobListingJson: true },
      where: { sessionId: dbSessionId }
    })
  ]);

  return { segments, results }
}
