"use server";

import { db } from "@/lib/db";
import { buildResearchPrompt } from "@/lib/opencode/prompts";
import {
  createResearchSession,
  deleteResearchSession,
  listAvailableModels,
  sendResearchPrompt,
} from "@/lib/opencode/server";
import type { ResearchPreferences } from "@/lib/types/opencode";
import type { ModelRef } from "@/lib/types/opencode";
import { z } from "zod";

const startResearchSchema = z.object({
  jobTypes: z.array(z.string()).min(1, "At least one job type is required"),
  countries: z.array(z.string()).min(1, "At least one country is required"),
  skills: z.array(z.string()).min(1, "At least one skill is required"),
  notes: z.string().optional(),
  resumeId: z.string().optional(),
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
  model?: ModelRef;
};

export async function startResearch(preferences: ResearchPromptInput) {
  const parsed = startResearchSchema.safeParse(preferences);
  if (!parsed.success) {
    console.error("[research] stage=validate error=", z.flattenError(parsed.error));
    throw new Error(`Invalid research input: ${parsed.error.issues[0]?.message ?? "validation failed"}`);
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
    throw new Error(`Failed to create OpenCode session: ${error instanceof Error ? error.message : String(error)}`);
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
      },
    });
  } catch (error) {
    console.error("[research] stage=db-create error=", error);
    // Avoid orphaned remote session costing money/time.
    await deleteResearchSession(openCodeSession.id);
    throw new Error("Failed to save research session");
  }

  sendResearchPrompt(openCodeSession.id, prompt, parsedPreferences.model).catch(async (error) => {
    console.error("Error sending research prompt:", error);
    await db.searchSession.update({
      where: { id: session.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
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
