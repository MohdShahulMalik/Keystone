"use server";

import { db } from "@/lib/db";
import { getDbReadTimeoutMs, withResilientDb } from "@/lib/db-errors";
import { deriveSessionTitle } from "@/lib/opencode/prompts";
import { requireUserId } from "@/lib/session-guard";
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
  mode: "job" | "dsa",
): Promise<SearchSessionTitle[]> {
  const userId = await requireUserId();
  const sessions = await withResilientDb(
    () =>
      db.searchSession.findMany({
        select: {
          id: true,
          title: true,
          query: true,
          preferences: true,
          resultCount: true,
          updatedAt: true,
          _count: { select: { results: true } },
        },
        where: {
          userId,
          mode,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
    getDbReadTimeoutMs(),
  );

  const backfills: Promise<unknown>[] = [];
  const mapped: SearchSessionTitle[] = sessions.map((s) => {
    const title = s.title ?? deriveSessionTitle(s.preferences, s.query);
    const resultCount = Math.max(s.resultCount, s._count.results);
    // Lazily repair rows created before title/preferences/resultCount were
    // persisted so the sidebar stops showing "Untitled session" / "No results".
    if (s.title === null || s.resultCount !== resultCount) {
      backfills.push(
        db.searchSession
          .update({
            where: { id: s.id },
            data: {
              ...(s.title === null ? { title } : {}),
              ...(s.resultCount !== resultCount ? { resultCount } : {}),
            },
          })
          .catch(() => null),
      );
    }
    return { id: s.id, title, resultCount, updatedAt: s.updatedAt };
  });

  if (backfills.length > 0) await Promise.allSettled(backfills);

  return mapped;
}

export async function getSearchSessionByAnyId(
  sessionId: string,
): Promise<SearchSession | null> {
  // Scoped to the authenticated user — a session id from another user
  // resolves the same as an unknown id.
  const userId = await requireUserId();
  const session = await withResilientDb(
    () =>
      db.searchSession.findFirst({
        where: {
          OR: [{ id: sessionId }, { openCodeSessionId: sessionId }],
          userId,
        },
      }),
    getDbReadTimeoutMs(),
  );

  return session;
}

export async function getSearchSessionHistory(dbSessionId: string): Promise<{
  segments: {
    seq: number;
    kind: SegmentKind;
    text: string;
    toolId: string | null;
    timeTaken: string | null;
  }[];
  results: { id: string; jobListingJson: unknown }[];
} | null> {
  // Ownership gate: only the session owner may read its history. Returns
  // null (not empty data) so callers can distinguish "not yours" from "empty".
  const userId = await requireUserId();
  const owned = await withResilientDb(
    () =>
      db.searchSession.findFirst({
        where: { id: dbSessionId, userId },
        select: { id: true },
      }),
    getDbReadTimeoutMs(),
  );
  if (!owned) return null;

  const [segments, results] = await Promise.all([
    withResilientDb(
      () =>
        db.researchSegment.findMany({
          select: {
            seq: true,
            kind: true,
            text: true,
            toolId: true,
            timeTaken: true,
          },
          where: { sessionId: owned.id },
          orderBy: { seq: "asc" },
          take: 2000,
        }),
      getDbReadTimeoutMs(),
    ),
    withResilientDb(
      () =>
        db.searchResult.findMany({
          select: { id: true, jobListingJson: true },
          where: { sessionId: owned.id },
          take: 2000,
        }),
      getDbReadTimeoutMs(),
    ),
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
// Returns null unless the owning user is authenticated.
export async function getSubagentHistory(
  childSessionId: string,
): Promise<SubagentHistory | null> {
  const userId = await requireUserId();
  const subagent = await withResilientDb(
    () =>
      db.subagentSession.findFirst({
        where: { OR: [{ sessionId: childSessionId }, { id: childSessionId }] },
      }),
    getDbReadTimeoutMs(),
  );
  if (!subagent) return null;

  // Ownership gate via the parent session — protects the subagent history
  // the same way getSearchSessionByAnyId protects parent sessions.
  const parentOwned = await withResilientDb(
    () =>
      db.searchSession.findFirst({
        where: { id: subagent.parentId, userId },
        select: { id: true },
      }),
    getDbReadTimeoutMs(),
  );
  if (!parentOwned) return null;

  const [segments, parent, siblings] = await Promise.all([
    withResilientDb(
      () =>
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
      getDbReadTimeoutMs(),
    ),
    withResilientDb(
      () =>
        db.searchSession.findUnique({
          select: { id: true, title: true, mode: true, status: true },
          where: { id: subagent.parentId },
        }),
      getDbReadTimeoutMs(),
    ),
    withResilientDb(
      () =>
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
      getDbReadTimeoutMs(),
    ),
  ]);

  return { subagent, parent, segments, siblings };
}
