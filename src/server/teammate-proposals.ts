import { z } from "zod";
import { missingSpecialists, SPECIALISTS } from "../shared/first-run.js";
import { teammateProposalSchema, type TeammateProposal } from "../shared/teammate-proposal.js";
import type { Bot } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { installTemplateMembers } from "./team-template-routes.js";
import { teamTemplate } from "./team-templates.js";

/** Task AU4: a teammate proposes a specialist from the starter team when a job
 * would clearly go better with one. It's an approval card naming who, why and the
 * AI they'd use (the proposer's). Adding a teammate is never automatic, at any
 * autonomy level, and counts against the teammate limit. A declined proposal isn't
 * repeated in that conversation. */

export const proposeTeammateInput = z.object({
  key: z.enum(SPECIALISTS as unknown as ["researcher", "writer"]),
  why: z.string().trim().min(10).max(400),
}).strict();

export { teammateProposalSchema, type TeammateProposal };

type Db = Pick<OpenBotDatabase, "listBots" | "getStudioSettings" | "getProvider" | "listThreadApprovals" | "getApprovalAction">;

/** Whether this proposal can still be approved: the role is still missing, there's
 * room, and the proposer's AI still exists. Null when it can. */
export function proposalProblem(db: Db, proposal: TeammateProposal): string | null {
  const bots = db.listBots();
  if (!missingSpecialists([{ key: proposal.key, role: proposal.role }], bots).length) return `A ${proposal.role.toLowerCase()} is already on the team.`;
  if (bots.length >= db.getStudioSettings().maxTeammates) return `The studio is full (${bots.length} teammates). Retire one or raise the limit first.`;
  if (!db.getProvider(proposal.providerInstanceId)) return "The AI this teammate would use is no longer connected.";
  return null;
}

/** Check a proposal from a teammate's tool call; on success, what the approval holds. */
export function prepareTeammateProposal(db: Db, bot: Bot, threadId: string, args: unknown): { error: string; status: number } | { proposal: TeammateProposal; reason: string; label: string } {
  const input = proposeTeammateInput.safeParse(args);
  if (!input.success) return { status: 400, error: "Name the specialist (researcher or writer) and say in a sentence why this job needs them." };
  const member = teamTemplate("starter-team")?.members.find((item) => item.key === input.data.key);
  if (!member) return { status: 400, error: "That specialist isn't available." };
  if (!bot.providerInstanceId || !bot.model) return { status: 409, error: "You have no AI connected, so a new teammate couldn't use yours. Don't propose one." };
  const proposal: TeammateProposal = {
    templateId: "starter-team", key: input.data.key, name: member.name, role: member.role, why: input.data.why,
    providerInstanceId: bot.providerInstanceId, model: bot.model, browserEnabled: input.data.key === "researcher",
  };
  // The owner said no to this specialist in this conversation: don't ask again.
  const declined = db.listThreadApprovals(threadId).some((approval) => {
    if (approval.status !== "denied") return false;
    const action = db.getApprovalAction(approval.id) as { type?: string; args?: { key?: string } } | null;
    return action?.type === "propose_teammate" && action.args?.key === input.data.key;
  });
  if (declined) return { status: 409, error: `The owner already declined adding a ${member.role.toLowerCase()} in this conversation. Don't propose it again; do the job yourself as well as you can.` };
  const problem = proposalProblem(db, proposal);
  if (problem) return { status: 409, error: `${problem} Don't propose a teammate now.` };
  return {
    proposal,
    reason: `${bot.name} suggests adding ${member.name}, a ${member.role.toLowerCase()}: ${input.data.why} ${member.name} would use ${bot.name}'s AI (${bot.model}).`,
    label: `Add ${member.name} (${member.role}) to your team`,
  };
}

/** After the owner approves: install that one member, checked again. */
export function performTeammateProposal(db: OpenBotDatabase, args: unknown): string {
  const proposal = teammateProposalSchema.parse(args);
  const problem = proposalProblem(db, proposal);
  if (problem) throw new Error(problem);
  const result = installTemplateMembers(db, proposal.templateId, { providerInstanceId: proposal.providerInstanceId, model: proposal.model, members: [{ key: proposal.key, browserEnabled: proposal.browserEnabled }] });
  if (result.status !== 201) throw new Error(String(result.body.error || "The teammate couldn't be added."));
  const [created] = result.body.bots as Bot[];
  return `${created!.name} (${created!.role}) joined the team on ${proposal.model}, with their own conversation. Hand the part of the job that needs them over with handoff, or tell the owner they're ready.`;
}
