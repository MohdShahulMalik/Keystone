import { z } from "zod";

export const resumeFileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, "File is required")
    .refine((f) => f.type === "application/pdf", "Only PDF files are allowed")
    .refine((f) => f.size <= 5 * 1024 * 1024, "File size must be under 5MB"),
});
