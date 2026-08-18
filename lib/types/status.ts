export type JobStatus =
  | "OPEN"
  | "APPLIED"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "DECLINED";

export interface Status {
  status: JobStatus;
}
