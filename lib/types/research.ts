export type ResearchStatus =
  | "idle"
  | "connecting"
  | "running"
  | "completed"
  | "error";

export type ToolEventInput = Record<string, unknown> | undefined;

export interface ToolEvent {
  id: string;
  tool: string;
  title?: string;
  input?: ToolEventInput;
  status?: "running" | "completed" | "error";
  durationMs?: number;
  outputPreview?: string;
  error?: string;
  sessionId?: string;
  seq?: number;
}

export interface Subagent {
  id: string;
  childSessionId: string;
  title: string;
  description?: string;
  subagentType?: string;
  text: string;
}

export interface SequencedSegment extends TextSegment {
  seq: number;
}

// Live state for one child (subagent) session, harvested from the parent
// stream's subagent.* / child tool.* events. Used by the subagent view to
// extend the persisted SubagentSegment history without a second SSE connection.
export interface SubagentLive {
  id: string;
  childSessionId: string;
  title: string;
  description?: string;
  subagentType?: string;
  status: "running" | "completed";
  segments: SequencedSegment[];
}

import type { JobPayload } from "@/lib/research/job-schema";

export interface ResearchSession {
  status: ResearchStatus;
  segments: TextSegment[];
  jobs: JobPayload[];
  error?: string;
  messageId?: string;
}

export interface JobPayloadForStream extends JobPayload {}

export interface ChunkPayload {
  text: string;
  seq?: number;
  kind?: "text" | "thinking" | "tool";
  id?: string;
}

export interface ThinkingPayload {
  text: string;
  done: boolean;
  seq?: number;
}

export interface StatusPayload {
  status: unknown;
}

export interface MessageCompletedPayload {
  messageId: string;
}

export interface ErrorPayload {
  message: string;
}

export interface SubagentStartedPayload {
  id: string;
  childSessionId: string;
  title: string;
  description?: string;
  subagentType?: string;
}

export interface SubagentChunkPayload {
  id: string;
  childSessionId: string;
  text: string;
  seq?: number;
}

export interface SubagentThinkingPayload {
  id: string;
  childSessionId: string;
  text: string;
  done: boolean;
  seq?: number;
}

export interface SubagentCompletedPayload {
  id: string;
  childSessionId: string;
  title: string;
  description?: string;
  subagentType?: string;
  durationMs?: number;
  timeTaken?: string;
}

export interface TextSegment {
  id: string;
  text: string;
  kind?: "text" | "thinking" | "tool";
}
