import type { AIModel } from "../types/opencode";
import { getOpencodeClient } from "./client";

export async function createResearchSession() {
  const client = await getOpencodeClient();

  const session = await client.session.create({
    body: {
      title: "Research Session",
    },
  });

  return session.data;
}

export async function sendResearchPrompt(
  sessionId: string,
  prompt: string,
  model?: AIModel,
) {
  const client = await getOpencodeClient();

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      model: model,
      parts: [{ type: "text", text: prompt }],
    },
  });

  return result.data;
}

export async function getSessionMessages(sessionId: string) {
  const client = await getOpencodeClient();

  const messages = await client.session.messages({ path: { id: sessionId } });
  return messages.data;
}

export async function getSessionChildren(sessionId: string) {
  const client = await getOpencodeClient();

  const children = await client.session.children({ path: { id: sessionId } });
  return children.data;
}

export async function subscribeToEvents() {
  const client = await getOpencodeClient();

  const events = await client.event.subscribe();
  return events.stream;
}
