"use server";

import { db } from "@/lib/db";
import type { SearchSessionTitle } from "@/lib/types/search";
import type { SearchSession } from "../generated/prisma";

export async function getSearchSessions(
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

export async function getSearchSessionById(
  sessionId: string,
): Promise<SearchSession | null> {
  const session = await db.searchSession.findUnique({
    where: {
      id: sessionId,
    },
  });

  return session;
}
