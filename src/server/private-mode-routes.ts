import type { Express } from "express";
import { z } from "zod";
import type { OpenBotDatabase } from "./database.js";
import { buildAiReceipt } from "./ai-receipt.js";
import { localConnection, privateModeSetting, savePrivateModeSetting, PRIVATE_NAMES_LIMIT } from "./private-mode.js";

/** Task F3. Studio routes only: a teammate's tools can't reach these. */
export function registerPrivateModeRoutes(app: Express, db: OpenBotDatabase, onChange: () => void) {
  const view = (botId: string) => {
    const bot = db.getBot(botId)!, provider = db.providerForBot(botId);
    return { ...privateModeSetting(db, botId), local: localConnection(provider), connection: provider?.name ?? null, model: bot.model.replace(/^(opencode|claude-code)\//, "") };
  };

  app.get("/api/bots/:id/private-mode", (request, response) => {
    if (!db.getBot(request.params.id)) return response.status(404).json({ error: "That teammate no longer exists." });
    response.json(view(request.params.id));
  });

  app.put("/api/bots/:id/private-mode", (request, response) => {
    if (!db.getBot(request.params.id)) return response.status(404).json({ error: "That teammate no longer exists." });
    const parsed = z.object({ on: z.boolean(), names: z.array(z.string().max(80)).max(PRIVATE_NAMES_LIMIT) }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: `Send whether Private mode is on, and up to ${PRIVATE_NAMES_LIMIT} names of up to 80 characters.` });
    savePrivateModeSetting(db, request.params.id, parsed.data);
    onChange();
    response.json(view(request.params.id));
  });

  app.get("/api/runs/:id/ai-receipt", (request, response) => {
    const receipt = buildAiReceipt(db, request.params.id);
    if (!receipt) return response.status(404).json({ error: "This task no longer exists." });
    response.json(receipt);
  });
}
