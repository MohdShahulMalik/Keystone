export type ModelRef = {
  id: string;
  providerID: string;
  variant?: string;
};

// keep AIModel alias for compat - use ModelRef going forward
export type AIModel = ModelRef & { modelID?: string };

export type ModelV2Info = {
  id: string;
  providerID: string;
  name: string;
  variants: Array<{ id: string; headers: Record<string, string>; body: Record<string, unknown> }>;
  status: "alpha" | "beta" | "deprecated" | "active";
  limit?: { context: number; output: number };
  cost?: unknown;
};

export interface ResearchPreferences {
  jobTypes: string[]; // ["remote", "hybrid", "onsite"]
  countries: string[]; // ["USA", "UK", "Canada"]
  skills: string[]; // ["React", "Node.js", "Python"]
  notes?: string; // Additional notes
  resumeContent?: string; // Extracted resume text
}
