import { z } from 'zod';

export const browserControlReviewSchema = z.object({
  url: z.string().max(2048).url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }),
  label: z.string().trim().min(1).max(240),
  control: z.string().min(1).max(80),
  fields: z.array(z.object({ label: z.string().min(1).max(200), value: z.string().max(2000) }).strict()).max(24),
  /** Bounds which visible fields the host included. Navigation intentionally
   * excludes unrelated page editors; the approval copy states that limit. */
  contextScope: z.enum(["form", "dialog", "navigation", "page"]).optional(),
  /** Page-authored presentation metadata only. It never makes a click safe or
   * bypasses the exact-control approval and fingerprint checks. */
  disclosure: z.object({
    expanded: z.literal(false),
    controls: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  }).strict().nullable().optional(),
  complete: z.literal(true),
}).strict();
export type BrowserControlReview = z.infer<typeof browserControlReviewSchema>;
export const browserNavigationAllowanceOfferSchema = z.object({
  version: z.literal(1),
  origin: z.string().max(2048).url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === value;
  }),
  maxClicks: z.literal(12),
  expiresInMinutes: z.literal(15),
}).strict();
export type BrowserNavigationAllowanceOffer = z.infer<typeof browserNavigationAllowanceOfferSchema>;
export const browserControlApprovalSchema = z.object({
  selector: z.string().min(1).max(2000),
  value: z.string().max(10000).optional(),
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  targetReview: browserControlReviewSchema,
  /** Host-authored offer shown beside an exact click approval. Its presence
   * never grants access; only the owner's separate decision flag can do so. */
  navigationAllowanceOffer: browserNavigationAllowanceOfferSchema.optional(),
}).strict();
