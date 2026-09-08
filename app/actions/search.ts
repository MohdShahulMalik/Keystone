"use server";

import { db } from "@/lib/db";

type SearchSessionIds = string[];

export async function getSearchSessions(): Promise<SearchSessionIds> {
  const sessions = await db.searchSession.findMany({
    select: {
      id: true,
      title: true,
    },
  });

  return sessions.map((session) => session.id);
}
