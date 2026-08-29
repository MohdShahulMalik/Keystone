import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { subscribeToEvents } from "@/lib/opencode/server";
import {
  flush,
  handlePartDelta,
  handlePartUpdated,
  type SegmentKind,
  type StreamCtx,
  type StreamEvent,
  sse,
} from "@/lib/research/stream";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return new Response("Missing sessionId parameter", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const eventsStream = await subscribeToEvents();
      const childSessions = new Map<string, string>();

      function sendText(text: string) {
        controller.enqueue(encoder.encode(text));
      }

      // resolve dbSessionId vs openCodeSessionId (supports ?sessionId=dbId or opencodeId)
      const searchSession = await db.searchSession.findFirst({
        where: { OR: [{ id: sessionId }, { openCodeSessionId: sessionId }] },
      });
      const dbSessionId = searchSession?.id ?? sessionId;
      const openCodeSessionId = searchSession?.openCodeSessionId ?? sessionId;

      const ctx: StreamCtx = {
        sessionId: openCodeSessionId,
        dbSessionId,
        childSessions,
        buffers: { chunk: "", thinking: "" },
        parts: new Map(),
        pendingDeltas: new Map(),
        emittedTools: new Set(),
        send: sendText,
        openSegments: new Map(),
        seq: new Map(),
        persist: async (sid: string, kind: SegmentKind, text: string, toolId?: string, timeTaken?: string) => {
          const seq = ctx.seq.get(sid) ?? 0;
          const isChild = ctx.childSessions.has(sid);
          try {
            if (isChild) {
              await db.subagentSegment.create({
                data: { sessionId: sid, seq, kind, text, toolId, timeTaken },
              });
            } else {
              await db.researchSegment.create({
                data: { sessionId: dbSessionId, seq, kind, text, toolId, timeTaken },
              });
            }
          } catch {
            // ignore duplicate seq races - will be retried on next commit
          }
        },
      };

      const intervalId = setInterval(() => {
        void flush(ctx);
      }, 100);

      try {
        for await (const raw of eventsStream) {
          const event = raw as StreamEvent;

          if (event.type === "message.part.delta") {
            handlePartDelta(ctx, event.properties);
            continue;
          }

          if (event.type === "message.part.updated") {
            await handlePartUpdated(
              ctx,
              event.properties.part,
              event.properties.delta,
            );
            continue;
          }

          if (event.type === "message.updated") {
            const msg = event.properties.info;
            if (
              msg.sessionID === openCodeSessionId &&
              msg.role === "assistant" &&
              msg.time.completed
            ) {
              await flush(ctx);
              sendText(sse("message.completed", { messageId: msg.id }));
            }
            continue;
          }

          if (event.type === "session.status") {
            if (event.properties.sessionID === openCodeSessionId) {
              sendText(sse("status", { status: event.properties.status }));
            }
            continue;
          }

          if (event.type === "session.idle") {
            if (event.properties.sessionID === openCodeSessionId) {
              await flush(ctx);
              sendText(sse("status", { status: "idle" }));
            }
            continue;
          }

          if (event.type === "session.error") {
            if (event.properties.sessionID === openCodeSessionId) {
              await flush(ctx);
              sendText(sse("error", { message: event.properties.error }));
              clearInterval(intervalId);
              controller.close();
            }
          }
        }

        await flush(ctx);
        sendText(sse("done", {}));
        clearInterval(intervalId);
        controller.close();
      } catch (error) {
        sendText(
          sse("error", {
            message: error instanceof Error ? error.message : "Stream error",
          }),
        );
        clearInterval(intervalId);
        controller.close();
      }
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
