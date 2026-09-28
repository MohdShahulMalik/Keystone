export interface SearchSessionTitle {
  id: string;
  title: string | null;
  resultCount: number;
  updatedAt: Date;
}

export type SearchMode = "job" | "dsa";

export type SearchSessionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type SubagentStatus = "running" | "completed" | "failed";

export type SegmentKind = "text" | "thinking" | "tool";

export interface SearchSession {
  id: string;
  userId: string;
  query: string;
  preferences: Record<string, unknown> | null;
  title: string | null;
  mode: SearchMode;
  resultCount: number;
  status: SearchSessionStatus;
  error: string | null;
  openCodeSessionId: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface SubagentSession {
  id: string;
  sessionId: string;
  status: SubagentStatus;
  error: string | null;
  parentId: string;
  title: string;
  description: string | null;
  subagentType: string | null;
  toolCount: number | null;
  openCodeParentToolId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  timeTaken: string | null;
}

export interface ResearchSegment {
  id: string;
  sessionId: string;
  seq: number;
  kind: SegmentKind;
  text: string;
  toolId: string | null;
  timeTaken: string | null;
  createdAt: Date;
}

export interface SubagentSegment {
  id: string;
  sessionId: string;
  seq: number;
  kind: SegmentKind;
  text: string;
  toolId: string | null;
  timeTaken: string | null;
  createdAt: Date;
}

export interface SearchResult {
  id: string;
  sessionId: string;
  jobListingJson: Record<string, unknown>;
  matched: boolean;
  jobId: string | null;
}
