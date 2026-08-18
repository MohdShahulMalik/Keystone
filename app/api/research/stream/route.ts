import type { NextRequest } from "next/server";
import { subscribeToEvents } from "@/lib/opencode/server";

export async function GET(req: NextRequest) {
  const searchParam = req.nextUrl.searchParams;
  const sessionId = searchParam.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId parameter", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const eventsStream = await subscribeToEvents();

        let chunkBuffer = "";
        const CHUNK_INTERVAL = 100;

        const intervalId = setInterval(() => {
          if (chunkBuffer.length > 0) {
            const event = `event: chunk\ndata: ${JSON.stringify({ text: chunkBuffer })}\n\n`;
            controller.enqueue(encoder.encode(event));
            chunkBuffer = "";
          }
        }, CHUNK_INTERVAL);

        for await (const event of eventsStream) {
          switch (event.type) {
            case "message.part.updated": {
              if (event.properties.part.sessionID !== sessionId) break;
              const delta = event.properties.delta;
              if (delta) {
                chunkBuffer += delta;
              }
              break;
            }
            case "message.updated": {
              if (event.properties.info.sessionID !== sessionId) break;
              const message = event.properties.info;
              if (message.role === "assistant" && message.time.completed) {
                const completionEvent = `event: message.completed\ndata: ${JSON.stringify({ messageId: message.id })}\n\n`;
                controller.enqueue(encoder.encode(completionEvent));
              }
              break;
            }
            case "session.status": {
              if (event.properties.sessionID !== sessionId) break;
              const statusEvent = `event: status\ndata: ${JSON.stringify({ status: event.properties.status })}\n\n`;
              controller.enqueue(encoder.encode(statusEvent));
              break;
            }
            case "session.error": {
              if (event.properties.sessionID !== sessionId) break;
              const errorEvent = `event: error\ndata: ${JSON.stringify({ message: event.properties.error })}\n\n`;
              controller.enqueue(encoder.encode(errorEvent));
              clearInterval(intervalId);
              controller.close();
              break;
            }
          }
        }

        if (chunkBuffer.length > 0) {
          const finalEvent = `event: chunk\ndata: ${JSON.stringify({ text: chunkBuffer })}\n\n`;
          controller.enqueue(encoder.encode(finalEvent));
        }

        const doneEvent = `event: done\ndata: {}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));
        clearInterval(intervalId);
        controller.close();
      } catch (error) {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Stream error" })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
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
