import type { z } from "zod";
import type { addJobSchema, updateJobSchema } from "@/lib/schemas/jobs";
import type {
  ResponseAction,
  ResponseActionError,
  ResponseActionSuccess,
} from "./response";
import type { JobStatus } from "./status";

type AddJobInput = z.infer<typeof addJobSchema>;
type UpdateJobInput = z.infer<typeof updateJobSchema>;

export interface JobListing {
  id: string;
  userId: string;
  title: string;
  company: string;
  location: string;
  url: string | null;
  description: string;
  salary: string | null;
  experience: string;
  visa: string | null;
  type: string;
  country: string | null;
  status: JobStatus;
  notes: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface JobImportSuccess {
  index: number;
  success: true;
  data: AddJobInput;
}

interface JobImportError {
  index: number;
  success: false;
  error: z.ZodError;
}

export type JobImportResult = JobImportSuccess | JobImportError;

export interface JobImportResponse {
  imported: number;
  errors: JobImportError[];
}

export interface JobActionSuccess
  extends ResponseActionSuccess<JobListing> {}

export interface JobActionError extends ResponseActionError {}

export type JobActionResponse = ResponseAction<JobListing>;

export interface Tab {
  location: string;
  type: string;
}
