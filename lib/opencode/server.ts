import type { ModelRef, ModelV2Info } from "../types/opencode";
import { getOpencodeClient } from "./client";
import { RESEARCH_SYSTEM_PROMPT } from "./prompts";

export async function listAvailableModels(): Promise<ModelV2Info[]> {
  const client = await getOpencodeClient();
  // v2 is source of truth for variants per docs/opencode-model-variants.md
  const result = await (client as unknown as { v2: { model: { list: () => Promise<{ data?: ModelV2Info[]; error?: unknown }> } } }).v2.model.list();
  if ((result as { error?: unknown }).error) throw (result as { error: unknown }).error;
  return (result as { data?: ModelV2Info[] }).data ?? [];
}

export async function createResearchSession(model?: ModelRef): Promise<{ id: string } & Record<string, unknown> | undefined> {
  const client = await getOpencodeClient();

  // Prefer v2 for variant support - docs/opencode-model-variants.md
  if (model) {
    const v2 = (client as unknown as { v2: { session: { create: (o: unknown) => Promise<{ data?: unknown }> } } }).v2;
    if (v2?.session?.create) {
      const res = await v2.session.create({ model } as never);
      return (res as { data: unknown }).data as Awaited<ReturnType<typeof createResearchSession>>;
    }
  }

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
  model?: ModelRef,
  systemPrompt: string = RESEARCH_SYSTEM_PROMPT,
) {
  const client = await getOpencodeClient();

  // If variant is needed, switch model for v2 sessions first per docs
  if (model?.variant) {
    try {
      const v2 = (client as unknown as { v2: { session: { switchModel: (o: unknown) => Promise<unknown> } } }).v2;
      await v2.session.switchModel({ sessionID: sessionId, model } as never);
    } catch {}
  }

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      model: model ? { providerID: model.providerID, modelID: model.id } : undefined,
      // system prompt: SDK field `body.system` (see gen/types.gen.d.ts:2253 and v2/gen/types.gen.d.ts:8371)
      system: systemPrompt,
      parts: [{ type: "text", text: prompt }],
    },
  } as never);

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
