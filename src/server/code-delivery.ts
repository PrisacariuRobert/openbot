import { z } from "zod";
import { codePublicationReviewSchema } from "../shared/code-publication.js";
import type { OpenBotDatabase } from "./database.js";
import type { CodeProjectManager } from "./code-projects.js";
import { GitHubWriteUncertainError } from "./github-write-identity.js";
import { AttachmentService } from "./attachments.js";

const identitySchema = z.object({ host: z.string().min(1).max(253), accountLogin: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/) }).strict();
export const codeDeliveryInputSchema = z.object({
  projectId: z.string().min(1), workspaceRunId: z.string().min(1),
  expectedHeadCommit: z.string().regex(/^[a-f0-9]{40,64}$/),
  title: z.string().min(1).max(160), body: z.string().min(1).max(10_000),
  base: z.string().min(1), draft: z.boolean(),
  publicationReview: codePublicationReviewSchema,
  publicationIdentity: identitySchema,
}).strict();

export interface CodeDeliveryReceipt {
  version: 1; runId: string; botId: string; projectId: string; projectName: string;
  verifiedAt: string; repository: string; host: string; accountLogin: string;
  url: string; title: string; branch: string; base: string; headCommit: string;
  draft: boolean; changedFiles: string[];
  checks: Array<{ id: string; command: string; finishedAt: string; headCommit: string }>;
  review: { id: string; reviewerName: string; headCommit: string };
}

/** A host receipt is only written after the publisher has checked the remote
 * result. Model messages and task_verify claims cannot create this record. */
export async function deliverCodeChange(db: OpenBotDatabase, manager: Pick<CodeProjectManager, "publishPullRequest">, botId: string, raw: unknown): Promise<CodeDeliveryReceipt> {
  const input = codeDeliveryInputSchema.parse(raw), snapshot = input.publicationReview;
  if (snapshot.botId !== botId || snapshot.projectId !== input.projectId || snapshot.runId !== input.workspaceRunId || snapshot.headCommit !== input.expectedHeadCommit || snapshot.title !== input.title || snapshot.body !== input.body || snapshot.base !== input.base || snapshot.draft !== input.draft) throw new Error("The delivery no longer matches the reviewed proposal.");
  const run = db.getRun(input.workspaceRunId);
  if (!run || run.botId !== botId) throw new Error("The delivery does not belong to this teammate's task.");
  const previous = db.extensionRecord<CodeDeliveryReceipt>("code-delivery", run.id);
  if (previous) throw new Error("This task already has a recorded delivery. Check that result instead of publishing again.");
  const result = await manager.publishPullRequest(botId, input.projectId, input, run.id);
  // Publication has already been attempted. Even a malformed adapter response
  // must stop recovery from replaying this external write.
  let url: URL;
  try {
    if (!result.verified || result.projectId !== input.projectId || result.headCommit !== snapshot.headCommit || result.repository !== snapshot.repository || result.branch !== snapshot.branch || result.base !== snapshot.base || result.draft !== snapshot.draft || result.host !== input.publicationIdentity.host || result.accountLogin.toLowerCase() !== input.publicationIdentity.accountLogin.toLowerCase()) throw new Error("Mismatched publication");
    url = new URL(result.url);
    const expectedPath = `/${snapshot.repository}/pull/`;
    if (url.protocol !== "https:" || url.host !== result.host || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(expectedPath) || !/^\d+$/.test(url.pathname.slice(expectedPath.length))) throw new Error("Unexpected destination");
  } catch {
    throw new GitHubWriteUncertainError("The remote delivery could not be matched to the approved change. Check GitHub before trying again.");
  }
  const receipt: CodeDeliveryReceipt = {
    version: 1, runId: run.id, botId, projectId: input.projectId, projectName: snapshot.projectName,
    verifiedAt: new Date().toISOString(), repository: snapshot.repository, host: result.host, accountLogin: result.accountLogin,
    url: url.href, title: snapshot.title, branch: snapshot.branch, base: snapshot.base, headCommit: snapshot.headCommit,
    draft: snapshot.draft, changedFiles: snapshot.files,
    checks: snapshot.checks.map(({ id, command, finishedAt, headCommit }) => ({ id, command, finishedAt, headCommit })),
    review: { id: snapshot.review.id, reviewerName: snapshot.review.reviewerBotName, headCommit: snapshot.review.headCommit },
  };
  try { db.recordCodeDeliveryResult(receipt); }
  catch { throw new GitHubWriteUncertainError("GitHub confirmed the change but OpenBot could not save its local receipt. Check the repository before trying again."); }
  // The visible result and its link are already durable. An attachment failure
  // cannot turn a confirmed publication into a retryable external action.
  try { await new AttachmentService(db).captureCodeDelivery(receipt); }
  catch { /* The saved owner-visible message still contains the verified link. */ }
  return receipt;
}
