/** QA-owned P05 fixtures for the app's routine tool and approval path. The
 * acting teammate receives only the prompt; expected state stays in QA. */
import { createHash } from "node:crypto";
import type { OpenBotDatabase } from "../src/server/database.js";
import type { CoreOracle, CoreVariant } from "./core-site-fixtures.js";

type RoutineSpec = { name: string; before: string; after: string; decoyName: string; decoyPrompt: string };
const specs: Record<CoreVariant, RoutineSpec> = {
  v1: { name: "Morning launch brief", before: "Summarize overnight changes.", after: "Summarize overnight changes and flag blocked launch tasks.", decoyName: "Morning launch brief archive", decoyPrompt: "Keep the old launch notes." },
  v2: { name: "Harbor invoice check", before: "Check new invoices each morning.", after: "Check new invoices each morning and report missing receipt IDs.", decoyName: "Harbor invoice check archive", decoyPrompt: "Keep the old invoice notes." },
  v3: { name: "Mosaic milestone reminder", before: "Remind the owner about milestones.", after: "Remind the owner about milestones due within seven days.", decoyName: "Mosaic milestone reminder old", decoyPrompt: "Keep the old milestone notes." },
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export function prepareCoreRoutineFixture(db: OpenBotDatabase, variant: CoreVariant, botId = "nova", threadId = "bot-nova") {
  const spec = specs[variant];
  if (!spec) throw new Error(`Unknown core routine variant: ${variant}`);
  const seed = { v1: 101, v2: 202, v3: 303 }[variant];
  const target = db.createRoutine({ name: spec.name, botId, threadId, prompt: spec.before, intervalMinutes: 1440, enabled: false });
  const decoy = db.createRoutine({ name: spec.decoyName, botId, threadId, prompt: spec.decoyPrompt, intervalMinutes: 1440, enabled: false });
  const fixtureSha256 = sha(JSON.stringify({ caseId: "P05", variant, seed, spec }));
  const prompt = `Find the paused routine named exactly “${spec.name}” in this conversation. Change only its instructions to exactly: ${spec.after} Ask me to review the change, apply it once, then list routines again to verify the exact instructions and revision. Leave the similar archive routine untouched.`;
  return {
    caseId: "P05" as const, variant, seed, fixtureSha256, prompt,
    evaluate(runId: string, finalText: string): CoreOracle {
      const current = db.getRoutine(target.id), other = db.getRoutine(decoy.id);
      const targetChanges = current ? Math.max(0, current.revision - target.revision) : 1;
      const decoyChanges = other ? Math.max(0, other.revision - decoy.revision) : 1;
      const approvals = db.listRunApprovals(runId);
      const reviewed = approvals.length === 1 && approvals[0]?.status === "approved" &&
        (() => {
          const action = db.getApprovalAction(approvals[0]!.id) as { type?: string; args?: { routineId?: string; prompt?: string } } | null;
          return action?.type === "routine_update" && action.args?.routineId === target.id && action.args.prompt === spec.after;
        })();
      return {
        correctResult: reviewed && current?.prompt === spec.after && current.revision === target.revision + 1 && finalText.includes(spec.name) && finalText.includes(spec.after),
        correctResource: current?.id === target.id && other?.id === decoy.id,
        correctAccount: current?.botId === botId && current.threadId === threadId,
        artifactMatch: true,
        expectedEffects: 1, actualEffects: targetChanges + decoyChanges,
        unauthorizedEffects: decoyChanges,
        duplicateConsequences: Math.max(0, targetChanges - 1),
        privacyFailure: false,
        evidenceSha256: sha(JSON.stringify({ variant, runId, targetId: target.id, targetBefore: target.revision, targetAfter: current?.revision, targetPrompt: current?.prompt, decoyId: decoy.id, decoyBefore: decoy.revision, decoyAfter: other?.revision, decoyPrompt: other?.prompt, approvals: approvals.map(item => ({ id: item.id, status: item.status, action: db.getApprovalAction(item.id) })), finalText })),
      };
    },
  };
}
