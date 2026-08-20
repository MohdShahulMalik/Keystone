import { db } from "@/lib/db";
import { buildResearchPrompt } from "@/lib/opencode/prompts";
import { createResearchSession, sendResearchPrompt } from "@/lib/opencode/server";
import { ResearchPreferences } from "@/lib/types/opencode";
import z from "zod";

const startResearchSchema = z.object({
  jobTypes: z.array(z.string()).min(1, "At least one job type is required"),
  countries: z.array(z.string()).min(1, "At least one country is required"),
  skills: z.array(z.string()).min(1, "At least one skill is required"),
  notes: z.string().optional(),
  resumeId: z.string().optional(),
});

type ResearchPromptInput = Omit<ResearchPreferences, 'resumeContent'> & { resumeId?: string };

export async function startResearch(preferences: ResearchPromptInput) {
  const parsedPreferences = startResearchSchema.parse(preferences);

  const user = "maxum"; // Replace with actual user identification logic

  const session = await db.searchSession.create({
    data: {
      userId: user,
      query: buildResearchPrompt(parsedPreferences),
      status: "running",
   } 
  });

  let resumeContent: string | undefined;
  if (parsedPreferences.resumeId) {
    const resume = await db.resume.findUnique({
      where: { id: parsedPreferences.resumeId },
    });
    resumeContent = resume?.content ?? undefined;
  }

  const openCodeSession = await createResearchSession();
  if (!openCodeSession) {
    throw new Error("Failed to create OpenCode session");
  }

  const prompt = buildResearchPrompt({...parsedPreferences, resumeContent});

  sendResearchPrompt(openCodeSession.id, prompt).catch(async (error) => {
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
    openCodeSessionId: openCodeSession.id
  };

}

export async function getResearchStatus(sessionId: string) {
  const session = await db.searchSession.findUnique({
    where: { id: sessionId },
    include: { results: true }
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
