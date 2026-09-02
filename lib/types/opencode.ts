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

export const MUSE_SPARK_1_2_FREE_REF: ModelRef = {
  providerID: "opencode",
  id: "muse-spark-1.2-contributor-free",
} as const;

export const MUSE_SPARK_1_2_FREE_INFO: ModelV2Info = {
  id: "muse-spark-1.2-contributor-free",
  providerID: "opencode",
  name: "Muse Spark 1.2 Free",
  variants: [],
  status: "active",
  limit: { context: 1048576, output: 131072 },
};

export interface ResearchPreferences {
  jobTypes: string[]; // ["remote", "hybrid", "onsite"]
  countries: string[]; // ["USA", "UK", "Canada"]
  skills: string[]; // ["React", "Node.js", "Python"]
  notes?: string; // Additional notes
  resumeContent?: string; // Extracted resume text
}
