import { z } from "zod";

const identifier = z.string().min(1).max(200);
const commit = z.string().regex(/^[a-f0-9]{40,64}$/);
const grant = z.object({ canRead: z.literal(true), canWrite: z.boolean(), canRun: z.boolean(), updatedAt: z.string().min(1).max(100) }).strict();

/** Host-created evidence, not model-supplied prose. Keep every executed target
 * and every published change in the review; reject rather than truncate it. */
export const codePublicationReviewSchema = z.object({
  version: z.literal(1),
  projectId: identifier,
  projectName: z.string().min(1).max(300),
  ownerId: identifier,
  botId: identifier,
  runId: identifier,
  projectRoot: z.string().min(1).max(4_096),
  workspaceRoot: z.string().min(1).max(4_096),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  remoteUrl: z.string().url().max(500),
  branch: z.string().min(1).max(200),
  base: z.string().min(1).max(200),
  headCommit: commit,
  baseCommit: commit,
  mergeBaseCommit: commit,
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(10_000),
  draft: z.boolean(),
  files: z.array(z.string().min(1).max(1_000)).min(1).max(120),
  commits: z.array(commit).min(1).max(32),
  diff: z.string().min(1).max(30_000),
  grant,
  reviewerGrant: grant,
  checks: z.array(z.object({
    id: identifier, command: z.string().min(1).max(4_000), headCommit: commit,
    exitCode: z.literal(0), finishedAt: z.string().min(1).max(100),
    detail: z.string().max(2_000),
  }).strict()).min(1).max(20),
  review: z.object({
    id: identifier, reviewerRunId: identifier, reviewerBotId: identifier,
    reviewerBotName: z.string().min(1).max(200), headCommit: commit,
    summary: z.string().min(1).max(8_000), findings: z.array(z.string().max(2_000)).max(12),
    createdAt: z.string().min(1).max(100),
  }).strict(),
}).strict();

export type CodePublicationReview = z.infer<typeof codePublicationReviewSchema>;
export type CodePublicationInput = { title: string; body: string; base?: string; draft?: boolean };
