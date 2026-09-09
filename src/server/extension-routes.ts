import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { OpenBotDatabase } from "./database.js";
import { McpConnections } from "./mcp-connections.js";
import { McpOAuth } from "./mcp-oauth.js";
import { CommunitySkills, inspectCommunitySkill } from "./community-skills.js";
import { memoryEdit } from "../shared/private-memory.js";
import { WorkflowValidation } from "./workflow-validation.js";

// Registered after the studio authentication/origin middleware. Models have no
// route for installing extensions, changing grants, or retrieving credentials.
export function registerExtensionRoutes(app: Express, db: OpenBotDatabase, onChange: () => void, addresses: { callback: string; app: string }) {
  const oauth = new McpOAuth(db, addresses.callback);
  const mcp = new McpConnections(db, 25_000, (id) => oauth.token(id)), skills = new CommunitySkills(db);
  const route = (work: (request: Request) => unknown | Promise<unknown>) => async (request: Request, response: Response) => {
    try { const result = await work(request); if (request.method !== "GET") onChange(); response.json(result); }
    catch (error) { response.status(400).json({ error: error instanceof z.ZodError ? "Check the required fields and their size limits." : error instanceof Error ? error.message : "This extension request could not be completed." }); }
  };
  const hostOnlySignIn = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(addresses.callback).hostname);
  const workflowChecks = new WorkflowValidation(db);
  app.get("/api/extensions/workflows", route(() => db.listWorkflows()));
  app.get("/api/extensions/workflows/:id/checks", route((request) => workflowChecks.status(String(request.params.id))));
  app.post("/api/extensions/workflows/:id/checks", route((request) => workflowChecks.start(String(request.params.id), request.body)));
  app.post("/api/extensions/workflows/:id/checks/:runId/review", route((request) => workflowChecks.review(String(request.params.id), String(request.params.runId), request.body)));
  app.get("/api/extensions", route(() => ({ connections: mcp.list(), skills: skills.list(), oauth: { callbackUrl: addresses.callback, hostOnly: hostOnlySignIn } })));
  app.get("/api/extensions/receipts/:id", (request, response) => {
    const receipt = db.extensionRecord("mcp-receipt", String(request.params.id));
    if (!receipt) return response.status(404).json({ error: "This source receipt is no longer retained." });
    response.setHeader("Cache-Control", "no-store"); response.json(receipt);
  });
  app.post("/api/extensions/mcp", route((request) => mcp.create(request.body)));
  app.post("/api/extensions/mcp/:id/check", route((request) => mcp.discover(String(request.params.id))));
  app.post("/api/extensions/mcp/:id/oauth", route((request) => oauth.begin(String(request.params.id))));
  app.delete("/api/extensions/mcp/:id/oauth", route((request) => { oauth.disconnect(String(request.params.id)); return { disconnected: true }; }));
  // Only this exact GET callback is public. The one-use, short-lived state binds
  // it to an owner-initiated sign-in; no tools or grants are enabled here.
  app.get("/api/extensions/oauth/callback", async (request, response) => {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    const destination = new URL(addresses.app); destination.search = ""; destination.hash = ""; destination.searchParams.set("panel", "connectors");
    try {
      const input = z.object({ state: z.string(), code: z.string(), iss: z.string().max(2048).optional() }).parse(request.query);
      await oauth.complete(input.state, input.code, input.iss); onChange(); destination.searchParams.set("extensionSignIn", "ready");
    } catch { destination.searchParams.set("extensionSignIn", "retry"); }
    response.redirect(303, destination.href);
  });
  app.delete("/api/extensions/mcp/:id", route((request) => { mcp.remove(String(request.params.id)); return { removed: true }; }));
  app.patch("/api/extensions/mcp/:id/access", route((request) => {
    const input = z.object({ botId: z.string().min(1), grants: z.record(z.string().max(128), z.enum(["ask", "read"])) }).strict().parse(request.body);
    mcp.configure(String(request.params.id), input.botId, input.grants); return { saved: true };
  }));
  app.post("/api/extensions/skills/inspect", route((request) => inspectCommunitySkill(request.body)));
  app.post("/api/extensions/skills/fetch", route((request) => skills.fetchPreview(z.object({ url: z.string().max(2_048) }).strict().parse(request.body).url)));
  app.post("/api/extensions/skills", route((request) => {
    const input = z.object({ bundle: z.unknown(), digest: z.string().length(64), botIds: z.array(z.string()).min(1).max(30) }).strict().parse(request.body);
    return skills.install(input.bundle, input.digest, input.botIds);
  }));
  app.patch("/api/extensions/skills/:id/access", route((request) => {
    const input = z.object({ botIds: z.array(z.string()).max(30) }).strict().parse(request.body);
    skills.assign(String(request.params.id), input.botIds); return { saved: true };
  }));
  app.delete("/api/extensions/skills/:id", route((request) => { skills.remove(String(request.params.id)); return { removed: true }; }));
  app.get("/api/extensions/skills/:id/share", route((request) => skills.shareBundle(String(request.params.id))));
  app.get("/api/extensions/memory/:botId", route((request) => db.memoryEntries(String(request.params.botId), true)));
  app.patch("/api/extensions/memory/:botId", route((request) => {
    const input = memoryEdit.parse(request.body);
    return db.remember(String(request.params.botId), input.key, input.content, { ...input, source: "owner", requireRevision: true });
  }));
  app.delete("/api/extensions/memory/:botId", route((request) => {
    const input = z.object({ key: z.string().trim().min(1).max(80), expectedRevision: z.string().max(80).optional() }).strict().parse(request.body);
    db.forgetMemory(String(request.params.botId), input.key, input.expectedRevision, true); return { removed: true };
  }));
  return { mcp, skills };
}
