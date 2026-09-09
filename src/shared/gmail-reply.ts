import { z } from "zod";

export const gmailMessageIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,200}$/);
export const emailMessageIdSchema = z.string().max(240).regex(/^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$/);
const line = (maximum: number) => z.string().min(1).max(maximum).refine(value => !/[\x00-\x1f\x7f]/.test(value));
export const gmailReplyInputSchema = z.object({ messageId: gmailMessageIdSchema, body: z.string().trim().min(1).max(20_000) }).strict();
/** Only the host authors the recipient/thread fields; the model supplies ID and body. */
export const gmailReplyReviewSchema = gmailReplyInputSchema.extend({
  threadId: gmailMessageIdSchema,
  account: z.string().email().max(320),
  from: line(500),
  to: z.string().email().max(320),
  subject: line(200),
  inReplyTo: emailMessageIdSchema,
  references: z.array(emailMessageIdSchema).min(1).max(20),
  threadRevision: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePreview: z.string().max(800),
}).strict();
export type GmailReplyReview = z.infer<typeof gmailReplyReviewSchema>;
