import { z } from "zod";
export const JobStatusEnum = z.enum([
  "OPEN",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "DECLINED",
]);

const addJobObjectSchema = z.object({
  title: z.string().min(1, "Title is required"),
  company: z.string().min(1, "Company is required"),
  location: z.string().min(1, "Location is required"),
  url: z.url({ error: "Invalid URL" }).optional().nullable(),
  description: z.string().min(1, "Description is required"),
  salary: z.string().optional().nullable(),
  experience: z.string().min(1, "Experience is required"),
  visa: z.string().optional().nullable(),
  type: z.string().default("remote"),
  country: z.string().optional().nullable(),
  status: JobStatusEnum.default("OPEN"),
  notes: z.string().optional().nullable(),
});

export const addJobSchema = addJobObjectSchema.transform((data) => ({
  ...data,
  location: data.location ?? null,
  url: data.url ?? null,
  description: data.description ?? null,
  salary: data.salary ?? null,
  experience: data.experience ?? null,
  country: data.country ?? null,
  notes: data.notes ?? null,
}));

export const updateJobSchema = addJobObjectSchema.partial();

export const deleteJobSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
});
