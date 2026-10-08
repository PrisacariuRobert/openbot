import type { Express } from "express";
import { z } from "zod";
import type { OpenBotDatabase } from "./database.js";
import { memorySearchEndpoint } from "./embeddings.js";
import { decideMemory, pendingMemories } from "./memory-review.js";

/** Task T5. Studio routes only: a teammate's tools can't reach these. */
export function registerMemoryReviewRoutes(app: Express, db: OpenBotDatabase, onChange: () => void) {
  app.get("/api/bots/:id/memory-review", async (request, response) => {
    if (!db.getBot(request.params.id)) return response.status(404).json({ error: "That teammate no longer exists." });
    const endpoint = await memorySearchEndpoint(db).catch(() => null);
    response.json({
      items: pendingMemories(db, request.params.id),
      search: endpoint ? { mode: endpoint.connectionName === "Ollama on this Mac" ? "local" : "connection", model: endpoint.model, connection: endpoint.connectionName } : { mode: "keyword", model: null, connection: null },
    });
  });
  // Task F8: an export brings many facts; the owner can keep them all after reading them.
  app.post("/api/bots/:id/memory-review/keep-all", (request, response) => {
    const items = pendingMemories(db, request.params.id);
    let kept = 0;
    const failed: string[] = [];
    for (const item of items) {
      try { decideMemory(db, item.id, "keep"); kept += 1; } catch (error) { failed.push(`${item.key}: ${error instanceof Error ? error.message : "not saved"}`); }
    }
    onChange();
    response.json({ kept, failed });
  });
  app.post("/api/memory-review/:id", (request, response) => {
    const parsed = z.object({ decision: z.enum(["keep", "discard"]), content: z.string().trim().min(1).max(1200).optional() }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Choose keep or discard; an edited memory is 1 to 1,200 characters." });
    try {
      const saved = decideMemory(db, request.params.id, parsed.data.decision, parsed.data.content);
      onChange();
      response.json({ saved });
    } catch (error) { response.status(409).json({ error: error instanceof Error ? error.message : "That memory couldn't be saved." }); }
  });
}
