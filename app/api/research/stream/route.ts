import type { NextRequest } from "next/server";
import { subscribeToEvents } from "@/lib/opencode/server";
import {
  flush,
  handlePartUpdated,
  sse,
  type StreamCtx,
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

      const ctx: StreamCtx = {
        sessionId,
        childSessions,
        buffers: { chunk: "", thinking: "" },
        send: sendText,
      };

      const intervalId = setInterval(() => flush(ctx), 100);

      try {
        for await (const event of eventsStream) {
          if (event.type === "message.part.updated") {
            handlePartUpdated(
              ctx,
              event.properties.part,
              event.properties.delta,
            );
            continue;
          }

          if (event.type === "message.updated") {
            const msg = event.properties.info;
            if (
              msg.sessionID === sessionId &&
              msg.role === "assistant" &&
              msg.time.completed
            ) {
              sendText(sse("message.completed", { messageId: msg.id }));
            }
            continue;
          }

          if (event.type === "session.status") {
            if (event.properties.sessionID === sessionId) {
              sendText(sse("status", { status: event.properties.status }));
            }
            continue;
          }

          if (event.type === "session.idle") {
            if (event.properties.sessionID === sessionId) {
              sendText(sse("status", { status: "idle" }));
            }
            continue;
          }

          if (event.type === "session.error") {
            if (event.properties.sessionID === sessionId) {
              sendText(sse("error", { message: event.properties.error }));
              clearInterval(intervalId);
              controller.close();
            }
            continue;
          }
        }

        flush(ctx);
        sendText(sse("done", {}));
        clearInterval(intervalId);
        controller.close();
      } catch (error) {
        sendText(
          sse("error", {
            message:
              error instanceof Error ? error.message : "Stream error",
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
