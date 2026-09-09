import { z } from 'zod';

export const browserControlReviewSchema = z.object({
  url: z.string().max(2048).url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }),
  label: z.string().trim().min(1).max(240),
  control: z.string().min(1).max(80),
  fields: z.array(z.object({ label: z.string().min(1).max(200), value: z.string().max(2000) }).strict()).max(24),
  complete: z.literal(true),
}).strict();
export type BrowserControlReview = z.infer<typeof browserControlReviewSchema>;
export const browserControlApprovalSchema = z.object({
  selector: z.string().min(1).max(2000),
  value: z.string().max(10000).optional(),
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  targetReview: browserControlReviewSchema,
}).strict();
