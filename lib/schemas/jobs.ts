import { z } from "zod";
export const JobStatusEnum = z.enum([
  "OPEN",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "DECLINED",
]);

/**
 * Persisted listings render inside `<a href>` controls and come from an
 * LLM agent scraping job boards, so the URL must be a web scheme.
 * `z.url()` follows the URL constructor, which happily accepts
 * `javascript:` / `data:` URIs — explicitly reject anything else.
 */
const httpsUrl = z
  .url({ error: "Invalid URL" })
  .refine(
    (value) => /^https?:\/\//i.test(value.trim()),
    "URL must start with http:// or https://",
  )
  .transform((value) => value.trim() || null);

const addJobObjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title is too long (max 200 characters)"),
  company: z
    .string()
    .trim()
    .min(1, "Company is required")
    .max(150, "Company is too long (max 150 characters)"),
  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .max(150, "Location is too long (max 150 characters)"),
  url: httpsUrl.optional().nullable(),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(4000, "Description is too long (max 4000 characters)"),
  salary: z
    .string()
    .trim()
    .max(100, "Salary is too long (max 100 characters)")
    .optional()
    .nullable(),
  experience: z
    .string()
    .trim()
    .min(1, "Experience is required")
    .max(100, "Experience is too long (max 100 characters)"),
  visa: z
    .string()
    .trim()
    .max(150, "Visa is too long (max 150 characters)")
    .optional()
    .nullable(),
  type: z
    .enum(["remote", "hybrid", "onsite"], {
      error: "Type must be one of remote, hybrid or onsite",
    })
    .default("remote"),
  country: z
    .string()
    .trim()
    .max(100, "Country is too long (max 100 characters)")
    .optional()
    .nullable(),
  status: JobStatusEnum.default("OPEN"),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes are too long (max 2000 characters)")
    .optional()
    .nullable(),
});

export const addJobSchema = addJobObjectSchema.transform((data) => ({
  ...data,
  location: data.location ?? null,
  url: data.url ?? null,
  description: data.description ?? null,
  salary: data.salary ?? null,
  experience: data.experience ?? null,
  visa: data.visa ?? null,
  type: data.type ?? null,
  country: data.country ?? null,
  notes: data.notes ?? null,
}));

export const updateJobSchema = addJobObjectSchema.partial();

export const deleteJobSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
});
