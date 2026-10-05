import { db } from "@/lib/db";
import { subscribeToEvents } from "@/lib/opencode/server";
import {
  createStreamCtx,
  flush,
  flushJobPersistQueue,
  flushPendingJobs,
  handleHubEvent,
  type StreamCtx,
  type StreamEvent,
} from "./stream";

type Listener = (text: string) => void;

interface HubEntry {
  ctx: StreamCtx;
  dbSessionId: string;
  openCodeSessionId: string;
  userId: string;
}

interface HubState {
  started: boolean;
  starting: Promise<void> | null;
  sessions: Map<string, HubEntry>; // dbSessionId -> entry
  byOpenCode: Map<string, HubEntry>; // openCodeSessionId -> entry
  listeners: Map<string, Set<Listener>>; // dbSessionId -> sends
  flushTimer: ReturnType<typeof setInterval> | null;
}

const globalForHub = globalThis as unknown as {
  __researchEventHub?: HubState;
};

function getState(): HubState {
  if (!globalForHub.__researchEventHub) {
    globalForHub.__researchEventHub = {
      started: false,
      starting: null,
      sessions: new Map(),
      byOpenCode: new Map(),
      listeners: new Map(),
      flushTimer: null,
    };
  }
  return globalForHub.__researchEventHub;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fanout(dbSessionId: string, text: string) {
  const state = getState();
  const set = state.listeners.get(dbSessionId);
  if (!set || set.size === 0) return;
  for (const send of [...set]) {
    try {
      send(text);
    } catch {
      // drop dead listener on send failure
      set.delete(send);
    }
  }
}

async function hydrateEntry(entry: HubEntry): Promise<void> {
  const { ctx, dbSessionId } = entry;
  try {
    const [maxParent, subagents, results] = await Promise.all([
      db.researchSegment
        .aggregate({
          where: { sessionId: dbSessionId },
          _max: { seq: true },
        })
        .catch(() => ({ _max: { seq: null } })),
      db.subagentSession
        .findMany({
          where: { parentId: dbSessionId },
          select: { sessionId: true, openCodeParentToolId: true },
        })
        .catch(() => []),
      db.searchResult
        .findMany({
          where: { sessionId: dbSessionId },
          select: { jobListingJson: true },
        })
        .catch(() => []),
    ]);

    // Parent seq resumes from MAX(seq) so reconnects never collide on
    // @@unique([sessionId, seq]).
    const parentMax = maxParent._max.seq ?? 0;
    ctx.seq.set(ctx.sessionId, parentMax);

    // Restore child routing + per-child seq so subagent events keep
    // persisting after a dev-server restart.
    for (const s of subagents) {
      if (s.openCodeParentToolId)
        ctx.childSessions.set(s.sessionId, s.openCodeParentToolId);
      else if (!ctx.childSessions.has(s.sessionId))
        ctx.childSessions.set(s.sessionId, "");
    }
    if (subagents.length > 0) {
      try {
        const childMax = await db.subagentSegment.groupBy({
          by: ["sessionId"],
          where: {
            sessionId: { in: subagents.map((s) => s.sessionId) },
          },
          _max: { seq: true },
        });
        for (const row of childMax) {
          ctx.seq.set(row.sessionId, row._max.seq ?? 0);
        }
      } catch {}
      // Seed emittedTools from persisted tool segments to avoid re-emit.
      try {
        const [parentTools, childTools] = await Promise.all([
          db.researchSegment
            .findMany({
              where: { sessionId: dbSessionId, toolId: { not: null } },
              select: { toolId: true },
            })
            .catch(() => []),
          db.subagentSegment
            .findMany({
              where: { sessionId: { in: subagents.map((s) => s.sessionId) } },
              select: { toolId: true },
            })
            .catch(() => []),
        ]);
        for (const r of [...parentTools, ...childTools]) {
          if (r.toolId) ctx.emittedTools.add(r.toolId);
        }
      } catch {}
    } else {
      try {
        const parentTools = await db.researchSegment
          .findMany({
            where: { sessionId: dbSessionId, toolId: { not: null } },
            select: { toolId: true },
          })
          .catch(() => []);
        for (const r of parentTools) {
          if (r.toolId) ctx.emittedTools.add(r.toolId);
        }
      } catch {}
    }

    // Seed job dedup from existing rows; jobSeq resumes from count so new
    // JOB_JSON lines keep a monotonic seq.
    let maxJobSeq = 0;
    for (const r of results) {
      const j = r.jobListingJson as unknown as Record<string, unknown> | null;
      if (!j || typeof j !== "object") continue;
      const title = typeof j.title === "string" ? j.title : "";
      const company = typeof j.company === "string" ? j.company : "";
      const url = typeof j.url === "string" ? j.url : "";
      if (title && company) {
        ctx.emittedJobKeys.add(
          `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${url.toLowerCase().trim()}`,
        );
      }
      if (typeof j.seq === "number" && j.seq > maxJobSeq) maxJobSeq = j.seq;
    }
    ctx.jobSeq.set(ctx.sessionId, Math.max(maxJobSeq, results.length));
  } catch (error) {
    console.error("[research-hub] hydrate failed", { dbSessionId, error });
  }
}

export async function register(
  dbSessionId: string,
  openCodeSessionId: string,
  userId: string,
): Promise<void> {
  const state = getState();
  const existing = state.sessions.get(dbSessionId);
  if (existing) return;
  const entry: HubEntry = {
    dbSessionId,
    openCodeSessionId,
    userId,
    ctx: createStreamCtx(openCodeSessionId, dbSessionId, userId, (text) =>
      fanout(dbSessionId, text),
    ),
  };
  state.sessions.set(dbSessionId, entry);
  state.byOpenCode.set(openCodeSessionId, entry);
  await hydrateEntry(entry);
}

async function resumeRunningSessions(): Promise<void> {
  try {
    const running = await db.searchSession.findMany({
      where: { status: "running" },
      select: { id: true, openCodeSessionId: true, userId: true },
    });
    for (const s of running) {
      if (!getState().sessions.has(s.id)) {
        await register(s.id, s.openCodeSessionId, s.userId);
      }
    }
  } catch (error) {
    console.error("[research-hub] resume running failed", error);
  }
}

async function runLoop(): Promise<void> {
  const backoffs = [1000, 2000, 5000];
  let attempt = 0;
  // Boot resume before first subscribe so early events route correctly.
  await resumeRunningSessions();
  while (true) {
    try {
      const eventsStream = await subscribeToEvents();
      attempt = 0;
      for await (const raw of eventsStream) {
        const event = raw as StreamEvent;
        const entries = [...getState().sessions.values()];
        for (const entry of entries) {
          try {
            await handleHubEvent(entry.ctx, event);
          } catch (error) {
            console.error("[research-hub] event failed", {
              dbSessionId: entry.dbSessionId,
              type: (event as { type?: unknown }).type,
              error,
            });
          }
        }
      }
    } catch (error) {
      console.error("[research-hub] stream error, resubscribing", error);
    }
    // Stream ended or errored (e.g. opencode restart): backoff resubscribe
    // and pick up any sessions that started while we were down.
    const delay = backoffs[Math.min(attempt, backoffs.length - 1)];
    attempt += 1;
    await sleep(delay);
    await resumeRunningSessions();
  }
}

export async function ensureStarted(): Promise<void> {
  const state = getState();
  if (state.started) return;
  if (state.starting) {
    await state.starting;
    return;
  }
  state.starting = (async () => {
    // Single 100ms flush for all sessions (replaces per-connection timer).
    if (!state.flushTimer) {
      state.flushTimer = setInterval(() => {
        for (const entry of state.sessions.values()) {
          void flush(entry.ctx).catch(() => {});
        }
      }, 100);
      const t = state.flushTimer as unknown as { unref?: () => void };
      if (typeof t.unref === "function") t.unref();
    }
    // Fire-and-forget the infinite loop; `started` flips once the first
    // subscription attempt begins so concurrent callers share it.
    void runLoop();
    state.started = true;
  })();
  try {
    await state.starting;
  } finally {
    state.starting = null;
  }
}

const MAX_LISTENERS_PER_SESSION = 10;

export function subscribe(dbSessionId: string, send: Listener): () => void {
  const state = getState();
  let set = state.listeners.get(dbSessionId);
  if (!set) {
    set = new Set();
    state.listeners.set(dbSessionId, set);
  }
  if (set.size >= MAX_LISTENERS_PER_SESSION) {
    // Drop the oldest to bound memory.
    const oldest = set.values().next().value as Listener | undefined;
    if (oldest) set.delete(oldest);
  }
  set.add(send);
  return () => unsubscribe(dbSessionId, send);
}

export function unsubscribe(dbSessionId: string, send: Listener): void {
  const state = getState();
  const set = state.listeners.get(dbSessionId);
  if (!set) return;
  set.delete(send);
  if (set.size === 0) state.listeners.delete(dbSessionId);
}

/** Test/shutdown helper: flush everything and drop timers. */
export async function flushAllSessions(): Promise<void> {
  for (const entry of getState().sessions.values()) {
    try {
      await flush(entry.ctx);
      flushPendingJobs(entry.ctx);
      await flushJobPersistQueue(entry.ctx);
    } catch {}
  }
}
