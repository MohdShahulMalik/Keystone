export interface Resume {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  content: string | null;
  parsedAt: Date | null;
  createdAt: Date;
}

export interface ResumeUploadSuccess {
  success: true;
  data: Resume;
}

export interface ResumeActionError {
  success: false;
  error: string;
}

export type ResumeActionResponse = ResumeUploadSuccess | ResumeActionError;
