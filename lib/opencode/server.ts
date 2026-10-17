import type { ModelRef, ModelV2Info } from "../types/opencode";
import { GLM_5_3_FLASH_FREE_INFO } from "../types/opencode";
import { getOpencodeClient, getOpencodeClientV2 } from "./client";
import { RESEARCH_SYSTEM_PROMPT } from "./prompts";

export async function listAvailableModels(): Promise<ModelV2Info[]> {
  // v2 model.list (/api/model, HTTP Basic auth on server 2.x) carries the full
  // catalog with variants (71 models on 2.0.32). Legacy provider.list (/provider)
  // only exists on pre-2.x servers — on 2.x it returns the web app HTML, which
  // this merge swallows. We still merge both so a 1.18.x server keeps working.
  try {
    const [v2client, v1client] = await Promise.all([
      getOpencodeClientV2(),
      getOpencodeClient(),
    ]);
    const [modelRes, providerRes] = await Promise.all([
      (
        v2client as unknown as {
          v2: {
            model: {
              list: () => Promise<{
                data?: { data?: ModelV2Info[] } | ModelV2Info[];
                error?: unknown;
              }>;
            };
          };
        }
      ).v2.model.list(),
      (
        v1client as unknown as {
          provider: {
            list: () => Promise<{
              data?: {
                all?: Array<{ id: string; models: Record<string, unknown> }>;
              };
              error?: unknown;
            }>;
          };
        }
      ).provider
        .list()
        .catch(() => ({ data: { all: [] } }) as never),
    ]);
    const unwrapped: ModelV2Info[] =
      (Array.isArray((modelRes as { data?: unknown }).data)
        ? ((modelRes as { data: ModelV2Info[] }).data as ModelV2Info[])
        : (
            (modelRes as { data?: { data?: ModelV2Info[] } }).data as {
              data?: ModelV2Info[];
            }
          )?.data) ?? [];
    if (unwrapped.length > 0) {
      // Build provider -> model -> variants map from provider.list()
      const variantMap = new Map<
        string,
        Array<{
          id: string;
          headers: Record<string, string>;
          body: Record<string, unknown>;
        }>
      >();
      const all = ((
        providerRes as {
          data?: {
            all?: Array<{ id: string; models: Record<string, unknown> }>;
          };
        }
      ).data?.all ?? []) as Array<{
        id: string;
        models: Record<string, { variants?: Record<string, unknown> }>;
      }>;
      for (const prov of all) {
        for (const [modelId, model] of Object.entries(prov.models ?? {})) {
          const vars = (model as { variants?: Record<string, unknown> })
            .variants;
          if (
            vars &&
            typeof vars === "object" &&
            Object.keys(vars).length > 0
          ) {
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
  } catch (error) {
    console.warn("[opencode] model.list failed, using fallback", error);
  }
  // Only reached when discovery produced nothing (auth 401, server 2.x route
  // mismatch, hang). Surface it loudly — a silent fallback hides e.g. an
  // OPENCODE_SERVER_PASSWORD mismatch as a one-model dropdown.
  console.warn(
    "[opencode] model discovery returned no models — serving hardcoded fallback (glm-5.3-flash-free). Check server auth/version.",
  );
  return [GLM_5_3_FLASH_FREE_INFO];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createResearchSession(
  model?: ModelRef,
): Promise<({ id: string } & Record<string, unknown>) | undefined> {
  // v2 create carries the model; retry once since the local server may still be cold-booting.
  if (model) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const v2client = await getOpencodeClientV2();
        const res = await (
          v2client as unknown as {
            v2: {
              session: { create: (o: unknown) => Promise<{ data?: unknown }> };
            };
          }
        ).v2.session.create({ model } as never);
        // RequestResult .data is the response body; server 2.x wraps the
        // session in {data:{id,...}} while some SDK versions return it flat.
        const body = (res as { data?: unknown }).data as
          | { id?: string; data?: { id?: string } }
          | undefined;
        const created =
          typeof body?.id === "string"
            ? body
            : body?.data && typeof body.data === "object"
              ? (body.data as { id?: string })
              : undefined;
        if (created?.id) {
          return { id: created.id } as { id: string } & Record<string, unknown>;
        }
        break;
      } catch (error) {
        console.warn(
          `[opencode] v2 session.create failed (attempt ${attempt}/2)`,
          error,
        );
        if (attempt === 2) break;
        await sleep(500 * attempt);
      }
    }
  }

  // Fallback: plain v1 session. Retry — first call after idle spins up the server.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = await getOpencodeClient();
      const session = await client.session.create({
        body: {
          title: "Research Session",
        },
      });
      if (session.data) return session.data;
      lastError = new Error("Empty session response");
    } catch (error) {
      lastError = error;
      console.warn(
        `[opencode] v1 session.create failed (attempt ${attempt}/3)`,
        error,
      );
    }
    if (attempt < 3) await sleep(500 * attempt);
  }
  throw new Error(
    `Failed to create OpenCode session: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function deleteResearchSession(sessionId: string): Promise<void> {
  try {
    const client = await getOpencodeClient();
    await (
      client.session as unknown as { delete: (o: unknown) => Promise<unknown> }
    ).delete({
      path: { id: sessionId },
    });
  } catch (error) {
    // Best-effort orphan cleanup — never throw.
    console.warn(`[opencode] session.delete failed for ${sessionId}`, error);
  }
}

export async function sendResearchPrompt(
  sessionId: string,
  prompt: string,
  model?: ModelRef,
  systemPrompt: string = RESEARCH_SYSTEM_PROMPT,
  timeoutMs = 60_000,
) {
  // If variant is needed, switch model for v2 sessions first per docs
  if (model?.variant) {
    try {
      const v2client = await getOpencodeClientV2();
      await (
        v2client as unknown as {
          v2: { session: { switchModel: (o: unknown) => Promise<unknown> } };
        }
      ).v2.session.switchModel({ sessionID: sessionId, model } as never);
    } catch (error) {
      console.warn(
        `[opencode] session.switchModel failed for ${sessionId}`,
        error,
      );
    }
  }
  const client = await getOpencodeClient();

  const t0 = Date.now();
  try {
    const result = await Promise.race([
      client.session.prompt({
        path: { id: sessionId },
        body: {
          model: model
            ? { providerID: model.providerID, modelID: model.id }
            : undefined,
          // system prompt: SDK field `body.system` (see gen/types.gen.d.ts:2253 and v2/gen/types.gen.d.ts:8371)
          system: systemPrompt,
          parts: [{ type: "text", text: prompt }],
        },
      } as never),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `prompt send timed out after ${timeoutMs}ms (session ${sessionId})`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);
    return result.data;
  } catch (error) {
    console.error("[opencode] session.prompt failed", {
      sessionId,
      latencyMs: Date.now() - t0,
      error,
    });
    throw error;
  }
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
