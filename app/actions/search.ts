"use server";

import { db } from "@/lib/db";
import { SearchSessionTitle } from "@/lib/types/search";

export async function getSearchSessions(
  userId: string,
): Promise<SearchSessionTitle[]> {
  const sessions = await db.searchSession.findMany({
    select: {
      id: true,
      title: true,
    },
    where: {
      userId: userId,
    },
  });

  return sessions;
}
