import type { Express } from "express";
import { z } from "zod";
import { BLOCKED_FREE_TIER_MESSAGE, isBlockedFreeTierModel, modelBelongsToConnection } from "../shared/provider-config.js";
import type { OpenBotDatabase } from "./database.js";
import { TEAM_TEMPLATES, teamTemplate } from "./team-templates.js";

const STARTING_TEMPLATE_NOTE = "You are a starting template, not a finished teammate: the owner will shape your job, connect your model and set your limits.";

/** Everything is optional: with no body, the whole template arrives without a model, browser or computer, as before. */
const installInput = z.object({
  providerInstanceId: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(300).optional(),
  members: z.array(z.object({ key: z.string().min(1).max(40), browserEnabled: z.boolean().optional() }).strict()).min(1).max(12).optional(),
  onlyIfEmpty: z.boolean().optional(),
}).strict();

/** Starter rosters, installed as ordinary teammates. The guided first run uses one member at a time, on the AI the owner chose. */
export function registerTeamTemplateRoutes(app: Express, db: OpenBotDatabase, broadcast: () => void) {
  app.get("/api/team-templates", (_request, response) => response.json(TEAM_TEMPLATES));

  app.post("/api/team-templates/:id/install", (request, response) => {
    const template = teamTemplate(request.params.id);
    if (!template) return response.status(404).json({ error: "That team template is not available." });
    const parsed = installInput.safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: "That request to add teammates isn't valid." });
    const input = parsed.data;

    // Two open tabs finishing the first run at once must not make two teams.
    const existing = db.listBots();
    if (input.onlyIfEmpty && existing.length) return response.status(409).json({ error: "Your studio already has teammates.", bots: existing });

    const chosen = input.members
      ? input.members.map((entry) => ({ entry, member: template.members.find((member) => member.key === entry.key) }))
      : template.members.map((member) => ({ entry: { key: member.key ?? member.name, browserEnabled: false }, member }));
    if (chosen.some((item) => !item.member) || new Set(chosen.map((item) => item.entry.key)).size !== chosen.length) {
      return response.status(400).json({ error: "Choose teammates from this template, each once." });
    }

    // Check the AI choice the same way as adding one teammate, before creating anyone.
    if (Boolean(input.providerInstanceId) !== Boolean(input.model)) return response.status(400).json({ error: "Choose both an AI connection and a model." });
    if (input.providerInstanceId && input.model) {
      const connection = db.getProvider(input.providerInstanceId);
      if (!connection) return response.status(400).json({ error: "Choose a valid AI connection for this teammate." });
      if (!modelBelongsToConnection(input.model, connection)) return response.status(400).json({ error: "Choose a model from the selected connection." });
      if (isBlockedFreeTierModel(input.model)) return response.status(400).json({ error: BLOCKED_FREE_TIER_MESSAGE });
    }
    const room = db.getStudioSettings().maxTeammates - existing.length;
    if (chosen.length > room) {
      return response.status(409).json({ error: `This studio has room for ${Math.max(0, room)} more teammate${room === 1 ? "" : "s"}. Retire one or raise the limit, then try again.` });
    }

    try {
      const created = chosen.map(({ entry, member }) => db.createBot({
        name: member!.name, emoji: member!.emoji ?? "●", mascot: member!.mascot, color: member!.color, role: member!.role,
        instructions: input.model ? member!.instructions : `${member!.instructions}\n\n${STARTING_TEMPLATE_NOTE}`,
        providerInstanceId: input.providerInstanceId ?? null, model: input.model,
        browserEnabled: entry.browserEnabled === true, computerEnabled: false, toolGroups: member!.toolGroups ?? null,
      }));
      broadcast();
      response.status(201).json({ template: template.name, bots: created });
    } catch (error) {
      broadcast();
      response.status(409).json({ error: error instanceof Error ? error.message : "The team could not be created completely. Teammates already created stay in the roster; retire them or free a slot and try again." });
    }
  });
}
