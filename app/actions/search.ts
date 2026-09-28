"use server";

import { db } from "@/lib/db";
import { SearchSessionTitle } from "@/lib/types/search";
import { SearchSession } from "../generated/prisma";

export async function getSearchSessions(
  userId: string, mode: "job" | "dsa"
): Promise<SearchSessionTitle[]> {
  const sessions = await db.searchSession.findMany({
    select: {
      id: true,
      title: true,
    },
    where: {
      userId,
      mode,
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
