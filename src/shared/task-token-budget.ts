import { z } from "zod";

export const TASK_TOKEN_TOP_UP = 50_000;
export const TASK_TOKEN_OPTIONS = [50_000, 100_000, 250_000] as const;
export const taskTokenAmountSchema = z.union([z.literal(50_000), z.literal(100_000), z.literal(250_000)]);
export const taskTokenRequestSchema = z.object({
  type: z.literal("task_tokens"), botId: z.string().min(1),
  args: z.object({ rootRunId: z.string().min(1), additionalTokens: taskTokenAmountSchema, revision: z.number().int().nonnegative() }).strict(),
}).strict();

export interface TaskTokenReview {
  usedTokens: number;
  currentJobLimit: number;
  newJobLimit: number;
  additionalTokens: number;
  extraTokens: number;
  models: string[];
  limitation: string | null;
}

export interface TaskTokenPolicy {
  extraTokens: number;
  revision: number;
  pendingApprovalId: string | null;
  paused: Array<{ id: string; status: "queued" | "running" | "awaiting_approval" | "waiting_for_teammate" }>;
}
