import type {
  ResponseAction,
  ResponseActionError,
  ResponseActionSuccess,
} from "./response";

export interface Resume {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  content: string | null;
  parsedAt: Date | null;
  createdAt: Date;
}

export interface ResumeUploadSuccess extends ResponseActionSuccess<Resume> {}

export interface ResumeActionError extends ResponseActionError {}

export type ResumeActionResponse = ResponseAction<Resume>;
