import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { OpenBotDatabase } from "./database.js";
import { approvalReason } from "./safety.js";

const CHECKS = "workflow-checks-v1", BINDING = "routine-workflows-v1", RUN = "workflow-run-v1";
export class WorkflowCheckError extends Error {}
const MAX_AGE = 30 * 86400_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identity = (value: string) => hash(value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim());
const text = z.string().trim().min(3).max(2000).refine((v) => !/[\u0000\u202a-\u202e\u2066-\u2069]/u.test(v) && !/-----BEGIN .*PRIVATE KEY-----|\b(?:sk-[\w-]{20,}|gh[pousr]_\w{20,}|xox[baprs]-[\w-]{10,})/.test(v), "Keep credentials out of test inputs; use browser takeover to sign in.");
export const workflowCheckInput = z.object({ input: text, expected: text, confirmed: z.literal(true) }).strict();
export const workflowCheckReview = z.object({ verdict: z.enum(["passed", "failed"]), reviewedResult: z.literal(true) }).strict();

interface Stamp { workflowId: string; revision: string }
interface Check extends Stamp { runId: string; inputIdentity: string; input: string; expected: string; createdAt: string; verdict: "passed" | "failed" | null; reviewedAt: string | null }
interface Binding { botId: string; promptIdentity: string; ids: string[] }

// Owner review is deliberately separate from model completion. These receipts
// certify two supervised examples, not universal reliability or write consent.
export class WorkflowValidation {
  constructor(private db: OpenBotDatabase) {}

  stamp(id: string): Stamp {
    const record = this.db.getWorkflowRecord(id);
    if (!record) throw new Error("This saved skill was removed. Choose another skill before enabling the routine.");
    let file: string;
    try {
      file = readFileSync(record.skillPath, "utf8");
      if (record.skillPath.includes("/.opencode/")) file += "\n" + readFileSync(record.skillPath.replace("/.opencode/", "/.claude/"), "utf8");
    }
    catch { throw new Error("This skill's instructions are unavailable. Restore them and test the skill again."); }
    const context = JSON.parse(this.db.botSessionFingerprint(record.workflow.botId));
    // Memory and source contents are task inputs, not permission grants. A check
    // may itself write a note; that must not invalidate its own next tool call.
    delete context.memoryRevision;
    delete context.activeMemory;
    // Opening the connector catalog can add disconnected inventory rows. Those
    // are not a permission/setup change for a bot with no grant to that app.
    context.connectors = context.connectors.filter((c: { access: Array<{ canRead: boolean; canSend: boolean }> }) => c.access.some((a) => a.canRead || a.canSend));
    context.connectorGenerations = context.connectors.map((c: { id: string }) => ({ id: c.id, generation: this.db.connectorAuthorizationVersion(c.id) }));
    return { workflowId: id, revision: hash(JSON.stringify({ workflow: record.workflow, steps: record.steps, file, context })) };
  }

  private checks(id: string): Check[] { return this.db.extensionRecord<Check[]>(CHECKS, id) || []; }
  private save(id: string, checks: Check[]) { this.db.saveExtensionRecord(CHECKS, id, checks.slice(-20)); }
  status(id: string) {
    const current = this.stamp(id), checks = this.checks(id);
    const valid = checks.filter((c) => c.revision === current.revision && Date.parse(c.createdAt) > Date.now() - MAX_AGE);
    // A failed or unfinished newer attempt cannot leave an old green badge.
    const lastFailure = valid.reduce((at, c, i) => c.verdict === "failed" || this.db.getRun(c.runId)?.status === "failed" ? i : at, -1);
    const passing = valid.slice(lastFailure + 1).filter((c) => c.verdict === "passed" && this.db.getRun(c.runId)?.status === "completed");
    const reviewedInputs = new Set(passing.map((c) => c.inputIdentity)).size;
    const pending = valid.some((c) => c.verdict === null && this.db.getRun(c.runId)?.status !== "failed");
    const ready = reviewedInputs >= 2 && !pending;
    return { workflowId: id, ready, reviewedInputs, message: ready ? "Two different inputs checked by you. Scheduling is available for this version and setup." : "Check two different inputs and review the results before scheduling. Changed skills or setup need fresh checks.", checks: checks.map((c) => {
      const run = this.db.getRun(c.runId);
      return { runId: c.runId, input: c.input, expected: c.expected, createdAt: c.createdAt, verdict: c.verdict, reviewedAt: c.reviewedAt, current: c.revision === current.revision && Date.parse(c.createdAt) > Date.now() - MAX_AGE, status: run?.status || "missing", result: run?.summary || run?.partialText || "", error: run?.error || null, toolCount: run?.activities.filter((a) => ["tool", "browser", "file"].includes(a.kind)).length || 0 };
    }) };
  }

  start(id: string, body: unknown) {
    const input = workflowCheckInput.parse(body), stamp = this.stamp(id);
    const workflow = this.db.getWorkflowRecord(id)!.workflow, bot = this.db.getBot(workflow.botId)!;
    if (!bot.providerInstanceId || !bot.model) throw new Error("Choose this teammate's provider and model first. No check was started.");
    if (this.checks(id).some((c) => ["queued", "running", "awaiting_approval", "waiting_for_teammate"].includes(this.db.getRun(c.runId)?.status || ""))) throw new Error("Finish or stop the current check before starting another.");
    const inputIdentity = identity(input.input);
    if (this.checks(id).some((c) => c.revision === stamp.revision && c.verdict === "passed" && c.inputIdentity === inputIdentity && Date.parse(c.createdAt) > Date.now() - MAX_AGE)) throw new Error("Try a different input from the example you already checked.");
    const prompt = `Run a supervised check of /${workflow.skillSlug} for the owner. This is a real task, not a pretend result. Use the saved skill and current observations. Preserve ordinary permissions and approval boundaries; stop for login or unknown state. Do not create a routine or mark the skill validated. Provide source-linked results the owner can review.\n\nOwner's test input:\n${input.input}\n\nOwner's expected result:\n${input.expected}`;
    const reason = approvalReason(prompt);
    const run = this.db.createRun({ botId: bot.id, threadId: bot.threadId, prompt, status: reason ? "awaiting_approval" : "queued", approvalReason: reason });
    this.db.saveExtensionRecord(RUN, run.id, [stamp]);
    this.save(id, [...this.checks(id), { ...stamp, runId: run.id, inputIdentity, input: input.input, expected: input.expected, createdAt: new Date().toISOString(), verdict: null, reviewedAt: null }]);
    this.db.addMessage({ threadId: bot.threadId, senderType: "user", senderId: null, body: `Check /${workflow.skillSlug}\n\n${input.input}\n\nExpected: ${input.expected}`, runId: run.id });
    return this.status(id);
  }

  review(id: string, runId: string, body: unknown) {
    const input = workflowCheckReview.parse(body), checks = this.checks(id), check = checks.find((c) => c.runId === runId);
    if (!check) throw new Error("Choose a check started for this skill. Other tasks cannot certify it.");
    if (check.revision !== this.stamp(id).revision || Date.parse(check.createdAt) <= Date.now() - MAX_AGE) throw new Error("The skill or setup changed, or this check expired. Run a fresh check.");
    if (check.verdict) throw new Error("This review is already saved. Start a new check to change the outcome.");
    const run = this.db.getRun(runId);
    if (!run || !["completed", "failed", "cancelled"].includes(run.status)) throw new Error("Wait for the check to finish before reviewing its result.");
    if (input.verdict === "passed" && (run.status !== "completed" || !(run.summary || run.partialText)?.trim() || !run.activities.some((a) => ["tool", "browser", "file"].includes(a.kind)))) throw new Error("This check needs a completed result and recorded tool work before it can pass. A chat-only claim is not enough.");
    check.verdict = input.verdict; check.reviewedAt = new Date().toISOString(); this.save(id, checks);
    return this.status(id);
  }

  bindRoutine(routine: { id: string; botId: string; prompt: string }): Binding {
    const binding = this.routineBinding(routine);
    this.db.saveExtensionRecord(BINDING, routine.id, binding); return binding;
  }
  routineBinding(routine: { id: string; botId: string; prompt: string }): Binding {
    const previous = this.db.extensionRecord<Binding>(BINDING, routine.id);
    if (previous?.botId === routine.botId && previous.promptIdentity === hash(routine.prompt)) return previous;
    return this.resolve(routine.botId, routine.prompt);
  }
  private resolve(botId: string, prompt: string): Binding {
    const slugs = [...prompt.matchAll(/(?:^|\s)\/([a-z0-9][a-z0-9-]{0,79})(?=[\s.,!?;:]|$)/gi)].map((m) => m[1]!.toLowerCase());
    const workflows = this.db.listWorkflows().filter((w) => slugs.includes(w.skillSlug));
    if (workflows.some((w) => w.botId !== botId)) throw new WorkflowCheckError("Assign this skill to the routine's teammate first, then check that teammate's copy.");
    for (const slug of slugs) if (!workflows.some((w) => w.skillSlug === slug) && this.db.extensionRecord("retired-workflow-slug", slug)) throw new WorkflowCheckError("This routine refers to a renamed or removed skill. Update the slash command and check the replacement skill.");
    return { botId, promptIdentity: hash(prompt), ids: workflows.map((w) => w.id) };
  }
  assertRoutine(routine: { id?: string; botId: string; prompt: string }): Stamp[] {
    try {
      const binding = routine.id ? this.routineBinding({ ...routine, id: routine.id }) : this.resolve(routine.botId, routine.prompt);
      return binding.ids.map((id) => {
        if (!this.status(id).ready) throw new Error("Before enabling this routine, open the saved skill's Checks and review two different test inputs. You can still save a paused draft.");
        return this.stamp(id);
      });
    } catch (error) { throw new WorkflowCheckError(error instanceof Error ? error.message : "Check this skill before scheduling it."); }
  }
  bindRun(runId: string, routineId: string) {
    const routine = this.db.getRoutine(routineId);
    if (routine) this.db.saveExtensionRecord(RUN, runId, this.assertRoutine(routine));
  }
  assertRun(runId: string) {
    const stamps = this.db.extensionRecord<Stamp[]>(RUN, runId);
    if (stamps) for (const stamp of stamps) {
      if (this.stamp(stamp.workflowId).revision !== stamp.revision) throw new Error("This skill or its setup changed after the job was queued. Check the new version before running it again.");
    }
    const run = this.db.getRun(runId);
    if (run?.routineId) {
      const routine = this.db.getRoutine(run.routineId);
      if (routine) {
        const current = this.assertRoutine(routine);
        if (current.length && !stamps) throw new Error("This older queued skill job has no version check. Start it again after checking the current skill.");
      }
    }
  }
}
