import type { ResearchPreferences } from "../types/opencode";

export function buildResearchPrompt(preferences: ResearchPreferences): string {
  const { jobTypes, countries, skills, notes, resumeContent } = preferences;

  let prompt = `Research and find relevant job listings based on these criteria:

  Job Types: ${jobTypes.join(", ")}
  Countries: ${countries.join(", ")}
  Skills: ${skills.join(", ")}`;

  if (notes) {
    prompt += `\nAdditional Notes: ${notes}`;
  }

  if (resumeContent) {
    prompt += `\nResume Content: ${resumeContent}`;
  }

  return prompt;
}
