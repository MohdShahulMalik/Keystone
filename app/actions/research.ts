"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { buildResearchPrompt, buildSessionTitle } from "@/lib/opencode/prompts";
import {
  createResearchSession,
  deleteResearchSession,
  listAvailableModels,
  sendResearchPrompt,
} from "@/lib/opencode/server";
import type { ModelRef, ResearchPreferences } from "@/lib/types/opencode";

const startResearchSchema = z.object({
  jobTypes: z.array(z.string()).min(1, "At least one job type is required"),
  countries: z.array(z.string()).min(1, "At least one country is required"),
  skills: z.array(z.string()).min(1, "At least one skill is required"),
  notes: z.string().optional(),
  resumeId: z.string().optional(),
  resumeName: z.string().optional(),
  modelLabel: z.string().optional(),
  mode: z.enum(["job", "dsa"]).optional(),
  model: z
    .object({
      providerID: z.string(),
      id: z.string(),
      variant: z.string().optional(),
    })
    .optional(),
});

type ResearchPromptInput = Omit<ResearchPreferences, "resumeContent"> & {
  resumeId?: string;
  resumeName?: string;
  model?: ModelRef;
  modelLabel?: string;
  mode?: "job" | "dsa";
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Preserve the undici cause (HeadersTimeoutError / ECONNREFUSED…) that `error.message` alone strips. */
function describePromptError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: unknown }).code;
    const bits = [msg, `${cause.name}: ${cause.message}`];
    if (typeof code === "string" && !bits.join(" ").includes(code))
      bits.push(code);
    return bits.join(" | caused by ");
  }
  if (cause != null && cause !== undefined) return `${msg} | caused by ${String(cause)}`;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return `${msg} | ${code}`;
  return msg;
}

function isTransientPromptError(error: unknown): boolean {
  const cause =
    error instanceof Error
      ? (error as Error & { cause?: { code?: unknown; name?: unknown } }).cause
      : undefined;
  const code =
    (cause as { code?: unknown } | undefined)?.code ??
    (error as { code?: unknown } | null)?.code;
  const name =
    (cause as { name?: unknown } | undefined)?.name ??
    (error as { name?: unknown } | null)?.name;
  if (code === "UND_ERR_HEADERS_TIMEOUT" || name === "HeadersTimeoutError")
    return true;
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET"
  )
    return true;
  const msg = error instanceof Error ? error.message : String(error);
  if (/fetch failed|headers timeout|timeout|temporarily|econnreset/i.test(msg))
    return true;
  return false;
}

const PROMPT_SEND_MAX_ATTEMPTS = 3;

async function sendResearchPromptWithRetry(
  sessionId: string,
  prompt: string,
  model: ModelRef | undefined,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PROMPT_SEND_MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    try {
      const res = await sendResearchPrompt(sessionId, prompt, model);
      return res;
    } catch (error) {
      lastError = error;
      const transient = isTransientPromptError(error);
      console.error("[research] stage=prompt-send", {
        sessionId,
        attempt,
        transient,
        latencyMs: Date.now() - t0,
        error: describePromptError(error),
      });
      if (!transient || attempt === PROMPT_SEND_MAX_ATTEMPTS) throw error;
      await sleep(150 * attempt);
    }
  }
  throw lastError;
}

export async function startResearch(preferences: ResearchPromptInput) {
  const parsed = startResearchSchema.safeParse(preferences);
  if (!parsed.success) {
    console.error(
      "[research] stage=validate error=",
      z.flattenError(parsed.error),
    );
    throw new Error(
      `Invalid research input: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    );
  }
  const parsedPreferences = parsed.data;

  const user = "maxum"; // Replace with actual user identification logic

  let resumeContent: string | undefined;
  if (parsedPreferences.resumeId) {
    try {
      const resume = await db.resume.findUnique({
        where: { id: parsedPreferences.resumeId },
      });
      resumeContent = resume?.content ?? undefined;
    } catch (error) {
      console.error("[research] stage=resume-lookup error=", error);
      throw new Error("Failed to load resume");
    }
  }

  // createResearchSession already retries internally (cold-boot) and throws
  // with cause instead of returning undefined.
  let openCodeSession: { id: string } & Record<string, unknown>;
  try {
    const created = await createResearchSession(parsedPreferences.model);
    if (!created) throw new Error("Empty session response");
    openCodeSession = created;
  } catch (error) {
    console.error("[research] stage=opencode-create error=", error);
    throw new Error(
      `Failed to create OpenCode session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const prompt = buildResearchPrompt({ ...parsedPreferences, resumeContent });

  let session: { id: string };
  try {
    session = await db.searchSession.create({
      data: {
        userId: user,
        query: prompt,
        status: "running",
        openCodeSessionId: openCodeSession.id,
        mode: parsedPreferences.mode ?? "job",
        title: buildSessionTitle(parsedPreferences),
        preferences: {
          jobTypes: parsedPreferences.jobTypes,
          countries: parsedPreferences.countries,
          skills: parsedPreferences.skills,
          ...(parsedPreferences.notes
            ? { notes: parsedPreferences.notes }
            : {}),
          ...(parsedPreferences.model
            ? { model: parsedPreferences.model }
            : {}),
          ...(parsedPreferences.modelLabel
            ? { modelLabel: parsedPreferences.modelLabel }
            : {}),
          ...(parsedPreferences.resumeId
            ? { resumeId: parsedPreferences.resumeId }
            : {}),
          ...(parsedPreferences.resumeName
            ? { resumeName: parsedPreferences.resumeName }
            : {}),
        },
      },
    });
  } catch (error) {
    console.error("[research] stage=db-create error=", error);
    // Avoid orphaned remote session costing money/time.
    await deleteResearchSession(openCodeSession.id);
    throw new Error("Failed to save research session");
  }

  // Boot the always-on hub so persisting continues with no tab open.
  // Fire-and-forget: never fail the action if the hub is busy.
  void (async () => {
    try {
      const hub = await import("@/lib/research/event-hub");
      await hub.ensureStarted();
      await hub.register(session.id, openCodeSession.id, user);
    } catch (error) {
      console.error("[research] hub register failed", error);
    }
  })();

  sendResearchPromptWithRetry(
    openCodeSession.id,
    prompt,
    parsedPreferences.model,
  ).catch(async (error) => {
    console.error("Error sending research prompt:", error);
    await db.searchSession.update({
      where: { id: session.id },
      data: {
        status: "failed",
        error: describePromptError(error),
      },
    });
  });

  return {
    sessionId: session.id,
    openCodeSessionId: openCodeSession.id,
  };
}

export async function getAvailableModelsAction() {
  return listAvailableModels();
}

export async function getResearchStatus(sessionId: string) {
  const session = await db.searchSession.findUnique({
    where: { id: sessionId },
    include: { results: true },
  });

  if (!session) {
    throw new Error("Research session not found");
  }

  return {
    id: session.id,
    status: session.status,
    results: session.results,
    error: session.error || null,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
  };
}
