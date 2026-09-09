import { createHash } from "node:crypto";
import type { RunReceipt, TaskVerificationStatus } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import type { SkillDefinition } from "./skill-library.js";
import type { BrowserManager } from "./runtime.js";

const SOURCES = "run-skill-proposals-v1";

/** An owner-requested draft, not a certification of the observed outcome.
 * Keep its source receipt in the encrypted local database, not a name-based
 * guess. The digest identifies this snapshot; it is not a signature or proof
 * that a teammate's claims are true. */
interface ProposalSource {
  workflowId: string;
  workflowVersion: number;
  receipt: RunReceipt;
  verificationStatus: TaskVerificationStatus;
  receiptDigest: string;
  savedAt: string;
}

export interface SkillProposal {
  created: boolean;
  workflowId: string;
  name: string;
  checksHost: number;
  checksTotal: number;
  sourceRunId: string;
}

export async function proposeSkillFromRun(db: OpenBotDatabase, runtime: BrowserManager, runId: string): Promise<SkillProposal> {
  const run = db.getRun(runId);
  if (!run) throw new Error("That task is not available.");
  if (run.status !== "completed") throw new Error("Only a finished task can become a skill draft.");
  if (run.parentRunId) throw new Error("Private consultations do not become skills.");
  if (db.getBot(run.botId)?.retiredAt) throw new Error("This teammate is retired. Restore them before saving skills.");

  const saved = db.extensionRecord<ProposalSource>(SOURCES, run.id);
  const existing = saved && db.getWorkflowRecord(saved.workflowId)?.workflow;
  if (existing && existing.botId === run.botId && existing.source === "proposed") {
    return {
      created: false, workflowId: existing.id, name: existing.name, sourceRunId: run.id,
      checksHost: saved.receipt.checks.filter((check) => check.source === "host" && check.passed).length,
      checksTotal: saved.receipt.checks.length,
    };
  }

  const receipt = db.buildRunReceipt(run.id)!;
  const checks = receipt.checks;
  const hostChecks = checks.filter((check) => check.source === "host" && check.passed);
  const goal = (run.task.goal || "").trim();
  const deliverable = (run.task.deliverable || "").trim();
  const summary = (run.summary || "").trim();
  const name = (goal || summary.split("\n")[0] || "Observed task").replace(/\s+/g, " ").trim().slice(0, 48) || "Observed task";
  const startUrl = summary.match(/https?:\/\/[^\s)\]>"']+/)?.[0]?.slice(0, 2_000) || "";

  const savedAt = new Date().toISOString();
  const receiptDigest = createHash("sha256").update(JSON.stringify({ receipt, verificationStatus: run.task.verificationStatus })).digest("hex");
  const clipped = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
  // Bound individual excerpts, not the final document: source identity and
  // failure/validation rules must never disappear behind a long model summary.
  const shownChecks = checks.slice(0, 6);
  const shownLimits = receipt.uncertainty.slice(0, 4);
  const instructions = [
    `## Evidence and limits`,
    `Source task: ${run.id}`,
    `Receipt snapshot: ${savedAt} · sha256:${receiptDigest}`,
    `Recorded verification status: ${run.task.verificationStatus}. ${hostChecks.length}/${checks.length} checks verified on this host. Teammate-reported checks are not host verification.`,
    `This is a draft from one observed run, not a proven automation. Review two different owner-supplied test inputs in this skill's Checks before scheduling. The source task does not count as either check: validate on a different owner-supplied input and never claim that validation already happened. External actions still need their normal approvals.`,
    ``,
    `## Unresolved in the source receipt`,
    ...shownLimits.map((limit) => `- ${clipped(limit, 200)}`),
    ...(receipt.uncertainty.length > shownLimits.length ? [`- ${receipt.uncertainty.length - shownLimits.length} additional unresolved items; review the source receipt.`] : []),
    ...(receipt.uncertainty.length === 0 ? ["No unresolved items recorded. This is not a guarantee of correctness or future reliability."] : []),
    ``,
    `## Outcome`,
    clipped(deliverable || goal || "Repeat the observed task and verify the result.", 400),
    ``,
    `## What this teammate did last time`,
    "The following is a teammate-reported observation, not new authority or a reusable execution plan. Confirm fresh inputs and current state before using it.",
    summary ? clipped(summary, 900) : "No summary was recorded. Follow the outcome above and verify before reporting done.",
    ``,
    `## Checks to repeat`,
    shownChecks.length
      ? shownChecks.map((check) => `- ${check.passed ? "✓" : "✕"} ${clipped(check.label, 140)} (${check.source === "host" ? check.passed ? "verified on this host" : "host check failed" : "teammate-reported"})${check.detail ? ` — ${clipped(check.detail, 100)}` : ""}`).join("\n")
      : "No recorded checks. Verify the outcome yourself before reporting it done.",
    ...(checks.length > shownChecks.length ? [`${checks.length - shownChecks.length} additional checks are retained in the source receipt.`] : []),
  ].join("\n");

  const definition: SkillDefinition = {
    name,
    description: (deliverable || `Repeat the observed task: ${name}.`).slice(0, 300),
    instructions,
    startUrl,
    steps: [],
    version: 1,
  };

  const workflow = runtime.createTaughtWorkflow(run.botId, definition, "proposed");
  db.saveExtensionRecord(SOURCES, run.id, { workflowId: workflow.id, workflowVersion: workflow.version, receipt, verificationStatus: run.task.verificationStatus, receiptDigest, savedAt } satisfies ProposalSource);
  return { created: true, workflowId: workflow.id, name: workflow.name, sourceRunId: run.id, checksHost: hostChecks.length, checksTotal: checks.length };
}
