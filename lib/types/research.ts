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
}

export interface Subagent {
  id: string;
  childSessionId: string;
  description: string;
  agent?: string;
  text: string;
}

export interface ResearchSession {
  status: ResearchStatus;
  segments: TextSegment[];
  error?: string;
  messageId?: string;
}

export interface ChunkPayload {
  text: string;
}

export interface ThinkingPayload {
  text: string;
  done: boolean;
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
  description: string;
  agent?: string;
}

export interface SubagentChunkPayload {
  id: string;
  childSessionId: string;
  text: string;
}

export interface TextSegment {
  id: string;
  text: string;
  kind?: "text" | "thinking" | "tool";
}
