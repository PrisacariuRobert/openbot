import express, { type Express } from "express";
import type { OpenBotDatabase } from "./database.js";
import { moveIn, readUpload, teammateZip } from "./move-in-out.js";

/** Task F8. Studio routes only. */
export function registerMoveRoutes(app: Express, db: OpenBotDatabase, onChange: () => void) {
  app.get("/api/bots/:id/files", (request, response) => {
    try {
      const { filename, bytes } = teammateZip(db, request.params.id);
      response.setHeader("Content-Type", "application/zip");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.send(Buffer.from(bytes));
    } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "That teammate couldn't be exported." }); }
  });
  // An export can be large (ChatGPT's conversations.json often is), so this route reads raw bytes.
  app.post("/api/move-in", express.raw({ type: "application/octet-stream", limit: "200mb" }), (request, response) => {
    if (!Buffer.isBuffer(request.body) || !request.body.length) return response.status(400).json({ error: "Choose a file: a ChatGPT or Claude data export, or a teammate exported from Sidemates." });
    try {
      const files = readUpload(new Uint8Array(request.body), String(request.headers["x-filename"] || "upload.json").slice(0, 200));
      const result = moveIn(db, files, { botId: typeof request.query.botId === "string" ? request.query.botId : undefined });
      onChange();
      response.json(result);
    } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "That file couldn't be read." }); }
  });
}
