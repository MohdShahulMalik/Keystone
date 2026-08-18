import { z } from "zod";
import { JobStatusEnum } from "./jobs";

export const ChangeStatusSchema = z.object({
  status: JobStatusEnum,
});
