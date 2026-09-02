import type { ModelRef, ModelV2Info } from "../types/opencode";
import { MUSE_SPARK_1_2_FREE_INFO } from "../types/opencode";
import { getOpencodeClient, getOpencodeClientV2 } from "./client";
import { RESEARCH_SYSTEM_PROMPT } from "./prompts";

export async function listAvailableModels(): Promise<ModelV2Info[]> {
  // v2 model.list gives id/name/limit but on this server (1.18.x) its `variants` is always []
  // even though runtime `provider.list()` has them (e.g. opencode/muse-spark-1.2-contributor-free -> minimal/low/medium/high/xhigh).
  // We merge both so the variant picker works. Verified via bun -e provider.list() vs v2.model.list().
  try {
    const [v2client, v1client] = await Promise.all([getOpencodeClientV2(), getOpencodeClient()]);
    const [modelRes, providerRes] = await Promise.all([
      (v2client as unknown as { v2: { model: { list: () => Promise<{ data?: { data?: ModelV2Info[] } | ModelV2Info[]; error?: unknown }> } } }).v2.model.list(),
      (v1client as unknown as { provider: { list: () => Promise<{ data?: { all?: Array<{ id: string; models: Record<string, unknown> }> }; error?: unknown }> } }).provider.list().catch(() => ({ data: { all: [] } }) as never),
    ]);
    const unwrapped: ModelV2Info[] =
      (Array.isArray((modelRes as { data?: unknown }).data)
        ? ((modelRes as { data: ModelV2Info[] }).data as ModelV2Info[])
        : ((modelRes as { data?: { data?: ModelV2Info[] } }).data as { data?: ModelV2Info[] })?.data) ?? [];
    if (unwrapped.length > 0) {
      // Build provider -> model -> variants map from provider.list()
      const variantMap = new Map<string, Array<{ id: string; headers: Record<string, string>; body: Record<string, unknown> }>>();
      const all = ((providerRes as { data?: { all?: Array<{ id: string; models: Record<string, unknown> }> } }).data?.all ?? []) as Array<{ id: string; models: Record<string, { variants?: Record<string, unknown> }> }>;
      for (const prov of all) {
        for (const [modelId, model] of Object.entries(prov.models ?? {})) {
          const vars = (model as { variants?: Record<string, unknown> }).variants;
          if (vars && typeof vars === "object" && Object.keys(vars).length > 0) {
            const arr = Object.entries(vars).map(([vid, body]) => ({
              id: vid,
              headers: {} as Record<string, string>,
              body: (body ?? {}) as Record<string, unknown>,
            }));
            variantMap.set(`${prov.id}/${modelId}`, arr);
          }
        }
      }
      // Merge into v2 models, then drop every google provider model
      const merged = unwrapped
        .map((m) => {
          const key = `${m.providerID}/${m.id}`;
          const vars = variantMap.get(key);
          if (vars && vars.length > 0) return { ...m, variants: vars };
          return m;
        })
        .filter((m) => m.providerID.toLowerCase() !== "google");
      return merged;
    }
  } catch {}
  return [MUSE_SPARK_1_2_FREE_INFO];
}

export async function createResearchSession(model?: ModelRef): Promise<{ id: string } & Record<string, unknown> | undefined> {
  if (model) {
    try {
      const v2client = await getOpencodeClientV2();
      const res = await (v2client as unknown as { v2: { session: { create: (o: unknown) => Promise<{ data?: unknown }> } } }).v2.session.create({ model } as never);
      const data = (res as { data?: unknown }).data as { id?: string } | undefined;
      if (data?.id) return data as { id: string } & Record<string, unknown>;
    } catch {}
  }

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
  model?: ModelRef,
  systemPrompt: string = RESEARCH_SYSTEM_PROMPT,
) {
  // If variant is needed, switch model for v2 sessions first per docs
  if (model?.variant) {
    try {
      const v2client = await getOpencodeClientV2();
      await (v2client as unknown as { v2: { session: { switchModel: (o: unknown) => Promise<unknown> } } }).v2.session.switchModel({ sessionID: sessionId, model } as never);
    } catch {}
  }
  const client = await getOpencodeClient();

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
