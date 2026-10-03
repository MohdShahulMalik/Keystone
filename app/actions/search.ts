"use server";

import { db } from "@/lib/db";
import type { SearchSessionTitle } from "@/lib/types/search";
import type {
  SearchMode,
  SearchSession,
  SearchSessionStatus,
  SegmentKind,
  SubagentSession,
  SubagentStatus,
} from "../generated/prisma";

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

export async function getSearchSessionHistory(dbSessionId: string) {
  const [segments, results] = await Promise.all([
    db.researchSegment.findMany({
      select: {
        seq: true,
        kind: true,
        text: true,
        toolId: true,
        timeTaken: true,
      },
      where: { sessionId: dbSessionId },
      orderBy: { seq: "asc" },
    }),
    db.searchResult.findMany({
      select: { id: true, jobListingJson: true },
      where: { sessionId: dbSessionId },
    }),
  ]);

  return { segments, results };
}

export interface SubagentHistory {
  subagent: SubagentSession;
  parent: {
    id: string;
    title: string | null;
    mode: SearchMode;
    status: SearchSessionStatus;
  } | null;
  segments: {
    seq: number;
    kind: SegmentKind;
    text: string;
    toolId: string | null;
    timeTaken: string | null;
  }[];
  siblings: {
    id: string;
    sessionId: string;
    title: string;
    subagentType: string | null;
    status: SubagentStatus;
    timeTaken: string | null;
  }[];
}

// Child (subagent) sessions live in SubagentSession keyed by the opencode
// child session id — NOT in SearchSession — so parent reloads never resolve
// them. Accepts either the opencode child session id or the SubagentSession.id.
export async function getSubagentHistory(
  childSessionId: string,
): Promise<SubagentHistory | null> {
  const subagent = await db.subagentSession.findFirst({
    where: { OR: [{ sessionId: childSessionId }, { id: childSessionId }] },
  });
  if (!subagent) return null;

  const [segments, parent, siblings] = await Promise.all([
    db.subagentSegment.findMany({
      select: {
        seq: true,
        kind: true,
        text: true,
        toolId: true,
        timeTaken: true,
      },
      where: { sessionId: subagent.sessionId },
      orderBy: { seq: "asc" },
    }),
    db.searchSession.findUnique({
      select: { id: true, title: true, mode: true, status: true },
      where: { id: subagent.parentId },
    }),
    db.subagentSession.findMany({
      select: {
        id: true,
        sessionId: true,
        title: true,
        subagentType: true,
        status: true,
        timeTaken: true,
      },
      where: { parentId: subagent.parentId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return { subagent, parent, segments, siblings };
}
