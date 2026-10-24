import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureStarted, register, subscribe } from "@/lib/research/event-hub";
import { sse } from "@/lib/research/stream";
import { getSessionUserId } from "@/lib/session-guard";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return new Response("Missing sessionId parameter", { status: 400 });
  }
  const sinceSeqRaw = req.nextUrl.searchParams.get("sinceSeq");
  const sinceSeq = sinceSeqRaw ? Number.parseInt(sinceSeqRaw, 10) : 0;
  const since = Number.isFinite(sinceSeq) && sinceSeq > 0 ? sinceSeq : 0;

  // Resolve dbSessionId vs openCodeSessionId (supports ?sessionId=dbId or opencodeId),
  // then verify the requester owns the session — id enumeration must not surface
  // another user's research stream.
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const searchSession = await db.searchSession.findFirst({
    where: {
      OR: [{ id: sessionId }, { openCodeSessionId: sessionId }],
      userId: sessionUserId,
    },
  });
  if (!searchSession) {
    return new Response("Research session not found", { status: 404 });
  }
  const dbSessionId = searchSession.id;
  const openCodeSessionId = searchSession.openCodeSessionId;
  const userId = searchSession.userId;

  // Lazy-boot the singleton hub (covers dev + HMR with no extra config)
  // and make sure this session is registered even if the action predates
  // the hub or the dev server restarted.
  try {
    await ensureStarted();
    await register(dbSessionId, openCodeSessionId, userId);
  } catch (error) {
    console.error("[research-stream] hub boot failed", error);
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let replaying = true;
      const liveBuffer: string[] = [];
      function sendText(text: string) {
        if (closed) return;
        if (replaying) {
          liveBuffer.push(text);
          return;
        }
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      }
      const unsubscribe = subscribe(dbSessionId, sendText);

      function push(text: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      }

      try {
        // Replay missed rows first (server is the seq authority).
        const [missed, children, results, current] = await Promise.all([
          db.researchSegment
            .findMany({
              where: { sessionId: dbSessionId, seq: { gt: since } },
              orderBy: { seq: "asc" },
            })
            .catch(() => []),
          db.subagentSession
            .findMany({
              where: { parentId: dbSessionId },
              select: { sessionId: true },
            })
            .catch(() => []),
          db.searchResult
            .findMany({ where: { sessionId: dbSessionId } })
            .catch(() => []),
          db.searchSession
            .findUnique({
              where: { id: dbSessionId },
              select: { status: true },
            })
            .catch(() => null),
        ]);

        for (const seg of missed) {
          if (seg.kind === "thinking") {
            push(sse("thinking", { text: seg.text, done: true, seq: seg.seq }));
          } else if (seg.kind === "tool") {
            push(
              sse("chunk", {
                text: seg.text,
                seq: seg.seq,
                id: openCodeSessionId,
                kind: "tool",
                toolId: seg.toolId,
              }),
            );
          } else {
            push(
              sse("chunk", {
                text: seg.text,
                seq: seg.seq,
                id: openCodeSessionId,
              }),
            );
          }
        }

        // Child transcripts are only replayed on a fresh connection
        // (?sinceSeq missing/0). On reconnects they would collide with
        // segments the client already holds (replay rows carry the
        // committed seq, live deltas the pre-increment one) and duplicate
        // text. A reconnect that missed child rows is covered by the
        // subagent view, which always reads history from the DB.
        if (children.length > 0 && since === 0) {
          try {
            const childSegs = await db.subagentSegment.findMany({
              where: { sessionId: { in: children.map((c) => c.sessionId) } },
              orderBy: { seq: "asc" },
            });
            for (const seg of childSegs) {
              if (seg.kind === "thinking") {
                push(
                  sse("subagent.thinking", {
                    id: seg.sessionId,
                    childSessionId: seg.sessionId,
                    text: seg.text,
                    done: true,
                    seq: seg.seq,
                  }),
                );
              } else {
                push(
                  sse("subagent.chunk", {
                    id: seg.sessionId,
                    childSessionId: seg.sessionId,
                    text: seg.text,
                    seq: seg.seq,
                  }),
                );
              }
            }
          } catch {}
        }

        for (const r of results) {
          push(sse("job", r.jobListingJson));
        }

        if (current && current.status !== "running") {
          push(sse("status", { status: current.status }));
          push(sse("done", {}));
        }
      } catch (error) {
        console.error("[research-stream] replay failed", {
          dbSessionId,
          error,
        });
      } finally {
        // Order guarantee: replay rows first, then anything the hub
        // fanned out while we were querying.
        replaying = false;
        for (const text of liveBuffer) push(text);
        liveBuffer.length = 0;
      }

      // Keep the connection open for live fan-out only. Client closes on
      // done/error; server cleans up the listener on cancel.
      const keepAlive = setInterval(() => {
        push(": ping\n\n");
      }, 25000);
      const t = keepAlive as unknown as { unref?: () => void };
      if (typeof t.unref === "function") t.unref();

      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
        closed = true;
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
