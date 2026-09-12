import { z } from "zod";
import { browserControlReviewSchema } from "./browser-control-review";

export const browserSavedFileUploadSchema = z.object({
  savedFileId: z.string().min(1).max(128), selector: z.string().min(1).max(500),
  name: z.string().min(1).max(120), size: z.number().int().positive(), mime: z.string().min(1).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), origin: z.string().url(),
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/), targetReview: browserControlReviewSchema,
}).strict();
