import { z } from "zod";

// Streamed job shape — matches RESEARCH_SYSTEM_PROMPT JOB_JSON contract
// Keep in sync with lib/schemas/jobs.ts addJobSchema (title, company, etc.)
export const StreamedJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  description: z.string().min(1),
  salary: z.string().nullable().optional(),
  experience: z.string().min(1).default("Mid"),
  visa: z.string().nullable().optional(),
  type: z.enum(["remote", "hybrid", "onsite"]).default("remote"),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type StreamedJob = z.infer<typeof StreamedJobSchema>;

// Payload sent over SSE `job` event
export interface JobPayload extends StreamedJob {
  id: string; // cuid-ish client id for React keys; server derives from hash
  sessionId: string; // opencode session that emitted it
  seq: number; // monotonic per session
}
