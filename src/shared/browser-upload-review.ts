import { z } from "zod";
import { browserControlReviewSchema } from "./browser-control-review";

export const browserSavedFileUploadSchema = z.object({
  savedFileId: z.string().min(1).max(128), selector: z.string().min(1).max(500),
  name: z.string().min(1).max(120), size: z.number().int().positive(), mime: z.string().min(1).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), origin: z.string().url(),
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/), targetReview: browserControlReviewSchema,
  // These fields are issued by the host after resolving an opaque observed
  // target. They cannot be provided through the public semantic tool input.
  semanticBound: z.literal(true).optional(),
  semanticSessionId: z.string().min(1).max(160).optional(),
  semanticRole: z.string().min(1).max(80).optional(),
  semanticLabel: z.string().min(1).max(240).optional(),
  semanticReviewDigest: z.string().min(1).max(128).optional(),
}).strict().refine((value) => !value.semanticBound || Boolean(value.semanticSessionId && value.semanticRole && value.semanticLabel && value.semanticReviewDigest), "A semantic file review needs its complete host binding.");
