import type { OpenBotDatabase } from "./database";
import { browserWebsiteBlock } from "./browser-access";
import { signInOrigin } from "../shared/browser-sign-in";

/** A durable owner handoff, not permission to submit a form or proof of login. */
export class BrowserSignIns {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private db: OpenBotDatabase) {}

  async withProfile<T>(botId: string, operation: () => Promise<T>): Promise<T> {
    const before = this.locks.get(botId) ?? Promise.resolve();
    const next = before.catch(() => {}).then(operation);
    this.locks.set(botId, next);
    try { return await next; }
    finally { if (this.locks.get(botId) === next) this.locks.delete(botId); }
  }

  pending(botId: string) {
    return this.db.listApprovals().find((entry) => entry.botId === botId &&
      (this.db.getApprovalAction(entry.id) as { type?: string } | null)?.type === "browser_sign_in");
  }

  assertAgentAccess(botId: string) {
    if (this.pending(botId)) throw new Error("This browser is waiting for your owner to sign in. Do not inspect it, enter credentials, or work around the pause. Other teammates have separate browsers.");
  }

  details(approvalId: string) {
    const approval = this.db.getApproval(approvalId);
    const action = this.db.getApprovalAction(approvalId) as { type?: string; botId?: string; args?: { siteOrigin?: string } } | null;
    const run = approval && this.db.getRun(approval.runId);
    if (!approval || approval.status !== "pending" || action?.type !== "browser_sign_in" || action.botId !== approval.botId ||
      !run || run.status !== "awaiting_approval" || run.approvalId !== approvalId || !this.db.getBot(approval.botId)?.browserEnabled) {
      throw new Error("This sign-in is no longer waiting, or browser access was turned off. Refresh the task.");
    }
    const siteOrigin = signInOrigin(action.args?.siteOrigin || "");
    const block = browserWebsiteBlock(this.db, approval.botId, siteOrigin);
    if (block) throw new Error(block);
    return { approval, run, botId: approval.botId, siteOrigin };
  }

  request(botId: string, runId: string, currentUrl: string) {
    const existing = this.pending(botId);
    if (existing) {
      if (existing.runId === runId) return existing;
      throw new Error("This teammate is already waiting for you to sign in on another task.");
    }
    const bot = this.db.getBot(botId), run = this.db.getRun(runId);
    if (!bot?.browserEnabled || !run || run.botId !== botId || run.status !== "running") throw new Error("This browser task is no longer active.");
    const siteOrigin = signInOrigin(currentUrl);
    const block = browserWebsiteBlock(this.db, botId, siteOrigin);
    if (block) throw new Error(block);
    const site = new URL(siteOrigin).hostname;
    const approval = this.db.createApproval({ botId, runId, kind: "browser",
      reason: `${bot.name} needs you to sign in at ${site}. Your task is saved and will wait. A visible Chrome window opens for this sign-in on the Mac running OpenBot — finish it there or on the private screen below; both drive the same browser.`,
      actionLabel: `Sign in to ${site}`,
      action: { type: "browser_sign_in", botId, args: { siteOrigin } },
    });
    this.db.addActivity({ runId, botId, kind: "status", label: "Waiting on you to sign in", detail: `${site} · a visible Chrome window opens for the private handoff` });
    this.db.addMessage({ threadId: run.threadId, senderType: "system", senderId: "openbot", runId,
      body: `${bot.name} needs your sign-in at ${site}. A visible Chrome window opens on your Mac — finish it there or on the private screen below. Don’t send your password or verification code in chat.` });
    this.db.enqueueNotification({ dedupeKey: `browser-sign-in:${approval.id}`, kind: "approval",
      title: `${bot.name} needs your sign-in`, body: `Sign in at ${site}, then continue your saved task.`, url: `/studio.html?thread=${encodeURIComponent(run.threadId)}` });
    return approval;
  }

  continue(approvalId: string) {
    const { run, siteOrigin } = this.details(approvalId);
    // Save before enqueueing: recovery must never resume with the old refusal alone.
    this.db.setRunPrompt(run.id, `${run.prompt}\n\n[Owner sign-in handoff completed for ${siteOrigin}. This is NOT proof of authentication. Inspect your current browser page, verify the intended account and relevant service, then continue the original request. If still gated, call browser_request_sign_in again. Never request passwords in chat. Do not repeat completed actions or bypass separate approvals for sending, publishing, deleting or purchasing.]`);
    return this.db.decideApproval(approvalId, "approved");
  }
}
