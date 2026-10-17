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
  variants: Array<{
    id: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }>;
  status: "alpha" | "beta" | "deprecated" | "active";
  limit?: { context: number; output: number };
  cost?: unknown;
};

// The OpenCode SDK models endpoint lists variant names but not per-variant
// headers/body records; switching uses the variant id string only
// (v2.session.switchModel), so empty records are safe. Verified: these are the
// GLM-5.3-Flash variants live in provider.list() / the SDK models() call.
const GLM_5_3_FLASH_FREE_VARIANT_IDS = ["low", "high", "max"] as const;

export const GLM_5_3_FLASH_FREE_VARIANTS: Array<{
  id: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}> = GLM_5_3_FLASH_FREE_VARIANT_IDS.map((id) => ({
  id,
  headers: {},
  body: {},
}));

export const GLM_5_3_FLASH_FREE_REF: ModelRef = {
  providerID: "opencode",
  id: "glm-5.3-flash-free",
  // Default reasoning-effort tier exposed in the variant dropdown.
  variant: "high",
} as const;

export const GLM_5_3_FLASH_FREE_INFO: ModelV2Info = {
  id: "glm-5.3-flash-free",
  providerID: "opencode",
  name: "GLM-5.3-Flash Free",
  variants: GLM_5_3_FLASH_FREE_VARIANTS,
  status: "active",
};

export interface ResearchPreferences {
  jobTypes: string[]; // ["remote", "hybrid", "onsite"]
  countries: string[]; // ["USA", "UK", "Canada"]
  skills: string[]; // ["React", "Node.js", "Python"]
  notes?: string; // Additional notes
  resumeContent?: string; // Extracted resume text
}
