import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chmodSync, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { OpenBotDatabase } from "./database.js";
import { OpenCodeRunner } from "./opencode.js";
import { ProviderConnectionManager, readProviderStatus } from "./providers.js";
import { approvalReason, browserApprovalReason, commandApprovalReason } from "./safety.js";
import { BrowserManager, ComputerManager } from "./runtime.js";
import { buildRawEmail, connectorCatalog, GoogleWorkspaceConnector } from "./google-workspace.js";
import { friendlyGoogleError, googleApiRecovery, googleCallbackPage, googleCloudProjectFromClientId, googleReturnUrl } from "./google-callback.js";
import { MacFileAccess, type MacFileMove } from "./mac-files.js";
import { MacAppControl } from "./mac-apps.js";
import { CodeProjectManager } from "./code-projects.js";
import type { CodeProject, CodeProjectEdit, CodeProjectReview, CodeProjectSuggestion, CodeTaskReview, CodeTaskWorkspace, ConnectorStatus, GoogleConnectorService, ProviderInstance, WorkspaceFile } from "../shared/types.js";
import { resolveMessageTargets } from "../shared/routing.js";
import { parseRoutineIntent } from "../shared/routine-intent.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (existsSync(path.join(rootDir, ".env"))) process.loadEnvFile(path.join(rootDir, ".env"));
const db = new OpenBotDatabase(rootDir);
const app = express();
const port = Number(process.env.OPENBOT_PORT || 4311);
const host = process.env.OPENBOT_HOST || "127.0.0.1";
const appUrl = process.env.OPENBOT_APP_URL?.trim() || `http://127.0.0.1:${process.env.NODE_ENV === "production" ? port : 4310}/`;
const internalUrl = `http://127.0.0.1:${port}`;
const internalToken = randomBytes(32).toString("base64url");
const computer = new ComputerManager(db);
const browser = new BrowserManager(db);
const googleWorkspace = new GoogleWorkspaceConnector(db, `http://127.0.0.1:${port}/api/connectors/google/callback`);
const macFiles = new MacFileAccess();
const macApps = new MacAppControl();
const codeProjects = new CodeProjectManager(db);
const managedGoogleClient = Boolean(process.env.OPENBOT_GOOGLE_CLIENT_ID?.trim());
if (managedGoogleClient) db.configureGoogleConnector({ clientId: process.env.OPENBOT_GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.OPENBOT_GOOGLE_CLIENT_SECRET?.trim() || null });
const eventClients = new Set<express.Response>();

function persistentAccessToken() {
  const tokenPath = path.join(db.dataDir, "access.token");
  if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(24).toString("base64url"), { mode: 0o600, flag: "wx" });
  chmodSync(tokenPath, 0o600);
  return readFileSync(tokenPath, "utf8").trim();
}
const accessToken = persistentAccessToken();

function accessTokenMatches(value: string | null | undefined) {
  if (!value) return false;
  const actual = Buffer.from(accessToken), candidate = Buffer.from(value);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

app.use(express.json({ limit: "2mb" }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  next();
});

function loopback(request: express.Request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function cookie(request: express.Request, key: string) {
  const raw = request.headers.cookie || "";
  for (const item of raw.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === key) return decodeURIComponent(value.join("="));
  }
  return null;
}

app.post("/api/auth/login", (request, response) => {
  const parsed = z.object({ token: z.string() }).safeParse(request.body);
  if (!parsed.success || !accessTokenMatches(parsed.data.token)) return response.status(401).json({ error: "That access key is not valid." });
  response.setHeader("Set-Cookie", `openbot_access=${encodeURIComponent(accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${request.secure ? "; Secure" : ""}`);
  response.json({ ok: true });
});

app.use("/api", (request, response, next) => {
  if (request.path === "/auth/login" || loopback(request)) return next();
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (accessTokenMatches(bearer) || accessTokenMatches(cookie(request, "openbot_access"))) return next();
  response.status(401).json({ error: "OpenBot needs your private access key." });
});

function broadcast(event: Record<string, unknown> = { type: "state", at: Date.now() }) {
  for (const response of eventClients) response.write(`data: ${JSON.stringify(event)}\n\n`);
}

const runner = new OpenCodeRunner({ db, onChange: () => broadcast(), internalUrl, internalToken, maxParallel: 3 });
const providerConnections = new ProviderConnectionManager(() => broadcast({ type: "provider", at: Date.now() }));
runner.start();

app.get("/api/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  eventClients.add(response);
  request.on("close", () => eventClients.delete(response));
});

app.get("/api/state", (request, response) => {
  const threadId = typeof request.query.threadId === "string" ? request.query.threadId : undefined;
  response.json(db.getState(threadId));
});

app.patch("/api/settings", (request, response) => {
  const parsed = z.object({ macAccessEnabled: z.boolean() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose whether the studio can use visible files on this Mac." });
  const settings = db.updateStudioSettings(parsed.data);
  broadcast();
  response.json(settings);
});

app.get("/api/code-projects", (_request, response) => {
  response.json({ projects: db.listCodeProjects(), edits: db.listCodeProjectEdits(undefined, 30), workspaces: db.listCodeTaskWorkspaces(), reviews: db.listCodeTaskReviews(), suggestions: codeProjects.suggestions() } satisfies { projects: CodeProject[]; edits: CodeProjectEdit[]; workspaces: CodeTaskWorkspace[]; reviews: CodeTaskReview[]; suggestions: CodeProjectSuggestion[] });
});

app.post("/api/code-projects", (request, response) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(80), rootPath: z.string().trim().min(1).max(1_000),
    access: z.array(z.object({ botId: z.string(), canRead: z.boolean(), canWrite: z.boolean(), canRun: z.boolean() })).max(50),
  }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose a project name, folder, and teammate access." });
  try {
    const inspected = codeProjects.inspectRoot(parsed.data.rootPath);
    const project = db.createCodeProject({ ...parsed.data, ...inspected });
    broadcast({ type: "code-project", at: Date.now() });
    response.status(201).json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duplicate = /UNIQUE constraint failed|already connected/i.test(message);
    response.status(duplicate ? 409 : 400).json({ error: duplicate ? "That project folder is already connected." : message });
  }
});

app.post("/api/code-projects/clone", async (request, response) => {
  const parsed = z.object({
    repository: z.string().trim().min(1).max(500),
    access: z.array(z.object({ botId: z.string(), canRead: z.boolean(), canWrite: z.boolean(), canRun: z.boolean() })).max(50),
  }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Paste a GitHub link and choose teammate access." });
  try {
    const project = await codeProjects.cloneGitHub(parsed.data.repository, parsed.data.access);
    broadcast({ type: "code-project", at: Date.now() });
    response.status(201).json(project);
  } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/code-projects/:projectId/review", (request, response) => {
  const requestedRunId = typeof request.query.runId === "string" ? request.query.runId : undefined;
  const workspace = requestedRunId ? db.getCodeTaskWorkspace(requestedRunId) : null;
  if (requestedRunId && (!workspace || workspace.projectId !== request.params.projectId)) return response.status(404).json({ error: "That isolated task is not available for this project." });
  const project = db.getCodeProject(request.params.projectId), reader = workspace ? project?.access.find((item) => item.botId === workspace.botId && item.canRead) : project?.access.find((item) => item.canRead);
  if (!project || !reader) return response.status(404).json({ error: "That project is not available for review." });
  try { response.json(codeProjects.review(reader.botId, project.id, requestedRunId) satisfies CodeProjectReview); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.post("/api/code-project-edits/:editId/restore", (request, response) => {
  try {
    const restored = codeProjects.restoreEdit(request.params.editId);
    broadcast({ type: "code-project", at: Date.now() });
    response.json(restored);
  } catch (error) { response.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.patch("/api/code-projects/:projectId/access/:botId", (request, response) => {
  const parsed = z.object({ canRead: z.boolean(), canWrite: z.boolean(), canRun: z.boolean() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose read-only, coding, or no access." });
  try {
    const access = db.setCodeProjectAccess(request.params.projectId, request.params.botId, parsed.data);
    broadcast({ type: "code-project", at: Date.now() });
    response.json(access);
  } catch (error) { response.status(404).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.delete("/api/code-projects/:projectId", (request, response) => {
  try {
    if (!codeProjects.disconnectProject(request.params.projectId)) return response.status(404).json({ error: "That code project is no longer connected." });
    broadcast({ type: "code-project", at: Date.now() });
    response.json({ removed: true, filesDeleted: false });
  } catch (error) { response.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/provider", async (_request, response) => {
  response.json(await readProviderStatus(db, providerConnections.listAttempts()));
});

app.post("/api/provider/connect", async (request, response) => {
  const parsed = z.object({ providerId: z.enum(["claude", "openai", "github-copilot", "gitlab", "xai"]) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose a supported connection." });
  try { response.status(202).json(await providerConnections.connect(parsed.data.providerId)); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.post("/api/provider/connect/:attemptId/callback", async (request, response) => {
  const parsed = z.object({ code: z.string().trim().min(1).max(4_000) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Paste the sign-in code first." });
  try { response.json(await providerConnections.finish(request.params.attemptId, parsed.data.code)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

function readConnectorStatus(): ConnectorStatus {
  let connection = db.restoreGoogleConnectorAfterStaleCallback();
  const services: GoogleConnectorService[] = ["gmail", "google-drive", "google-calendar"];
  const credentials = db.googleConnectorCredentials();
  const events = db.listConnectorEvents("google-workspace", 12);
  const scopedIssue = connection?.lastError ? googleApiRecovery(connection.lastError) : null;
  if (scopedIssue && connection?.accountEmail && (credentials?.accessToken || credentials?.refreshToken)) {
    for (const event of events.filter((item) => item.status === "failed")) {
      const recovery = googleApiRecovery(event.summary);
      if (recovery) db.markConnectorServiceError(recovery.service, event.summary);
    }
    db.markConnectorServiceError(scopedIssue.service, connection.lastError!);
    connection = db.restoreGoogleConnectorAfterServiceError();
  }
  const googleIssue = connection?.lastError ? googleApiRecovery(connection.lastError) : null;
  const serviceRecoveries = db.listConnectorServiceErrors().map((item) => googleApiRecovery(item.error)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const unavailableServices = new Set(serviceRecoveries.map((item) => item.service));
  const saved = new Map(db.listBotConnectorAccess().map((access) => [`${access.botId}:${access.service}`, access]));
  return {
    connection: connection ? { ...connection, lastError: connection.lastError ? friendlyGoogleError(connection.lastError) : null } : null,
    callbackUrl: googleWorkspace.redirectUri, managedGoogleClient, oauthInProgress: googleWorkspace.oauthInProgress(),
    googleProjectId: googleCloudProjectFromClientId(credentials?.clientId), googleApiRecovery: googleIssue, googleApiRecoveries: serviceRecoveries,
    catalog: connectorCatalog(Boolean(connection?.connected), connection?.scopes || []).map((entry) => unavailableServices.has(entry.id as GoogleConnectorService) ? { ...entry, connected: false, badge: "Needs setup" } : entry),
    access: db.listBots().flatMap((bot) => services.map((service) => saved.get(`${bot.id}:${service}`) || { botId: bot.id, connectorId: "google-workspace", service, canRead: false, canSend: false, updatedAt: connection?.updatedAt || new Date(0).toISOString() })),
    events,
  };
}

app.get("/api/connectors", (_request, response) => response.json(readConnectorStatus()));

app.post("/api/connectors/google/config", (request, response) => {
  if (managedGoogleClient) return response.status(409).json({ error: "This OpenBot release already manages its Google connection." });
  const parsed = z.object({ clientId: z.string().trim().min(20).max(400), clientSecret: z.string().trim().max(1_000).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Paste a valid Google OAuth client ID." });
  const connection = db.configureGoogleConnector({ clientId: parsed.data.clientId, clientSecret: parsed.data.clientSecret || null });
  broadcast({ type: "connector", at: Date.now() });
  response.json(connection);
});

app.post("/api/connectors/google/connect", (_request, response) => {
  try { response.status(202).json(googleWorkspace.beginOAuth()); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/connectors/google/callback", async (request, response) => {
  const parsed = z.object({
    state: z.string().min(10).max(500), code: z.string().min(1).max(4_000).optional(),
    error: z.string().trim().max(200).optional(), error_description: z.string().trim().max(1_000).optional(),
  }).refine((value) => Boolean(value.code || value.error)).safeParse(request.query);
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  if (!parsed.success) return response.status(400).send(googleCallbackPage(false, "Google did not return a valid authorization response."));
  if (parsed.data.error) {
    const message = parsed.data.error_description || parsed.data.error;
    const existing = db.restoreGoogleConnectorAfterStaleCallback();
    if (!existing?.connected) db.markConnectorError("google-workspace", message);
    broadcast({ type: "connector", at: Date.now() });
    return response.redirect(303, googleReturnUrl(appUrl, existing?.connected ? "connected" : "attention"));
  }
  try {
    const connection = await googleWorkspace.completeOAuth(parsed.data.state, parsed.data.code!);
    broadcast({ type: "connector", at: Date.now() });
    response.redirect(303, googleReturnUrl(appUrl, "connected"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const existing = db.restoreGoogleConnectorAfterStaleCallback();
    if (!existing?.connected) db.markConnectorError("google-workspace", message);
    broadcast({ type: "connector", at: Date.now() });
    response.redirect(303, googleReturnUrl(appUrl, existing?.connected ? "connected" : "attention"));
  }
});

app.post("/api/connectors/google/disconnect", async (_request, response) => {
  response.json(await googleWorkspace.disconnect());
  broadcast({ type: "connector", at: Date.now() });
});

app.patch("/api/connectors/gmail/access/:botId", (request, response) => {
  const parsed = z.object({ canRead: z.boolean(), canSend: z.boolean() }).safeParse(request.body);
  if (!parsed.success || !db.getBot(request.params.botId)) return response.status(400).json({ error: "Choose valid Gmail permissions for this teammate." });
  try { response.json(db.setBotConnectorAccess(request.params.botId, parsed.data)); broadcast({ type: "connector", at: Date.now() }); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.patch("/api/connectors/google/access/:service/:botId", (request, response) => {
  const service = z.enum(["gmail", "google-drive", "google-calendar"]).safeParse(request.params.service);
  const parsed = z.object({ canRead: z.boolean(), canSend: z.boolean().default(false) }).safeParse(request.body);
  if (!service.success || !parsed.success || !db.getBot(request.params.botId)) return response.status(400).json({ error: "Choose valid app permissions for this teammate." });
  try { response.json(db.setBotConnectorAccess(request.params.botId, parsed.data, service.data)); broadcast({ type: "connector", at: Date.now() }); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/connectors/gmail/preview", async (request, response) => {
  if (!db.getConnector("google-workspace")?.connected) return response.status(409).json({ error: "Connect Gmail first." });
  const query = typeof request.query.q === "string" ? request.query.q.slice(0, 500) : "newer_than:7d";
  try { response.json(await googleWorkspace.search(query, 4)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/connectors/drive/preview", async (request, response) => {
  if (!db.getConnector("google-workspace")?.connected) return response.status(409).json({ error: "Connect Google Workspace first." });
  const query = typeof request.query.q === "string" ? request.query.q.slice(0, 200) : "";
  try { response.json(await googleWorkspace.searchDrive(query, 4)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/connectors/calendar/preview", async (_request, response) => {
  if (!db.getConnector("google-workspace")?.connected) return response.status(409).json({ error: "Connect Google Workspace first." });
  try { response.json(await googleWorkspace.calendarAgenda(7, 6)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/access", (request, response) => {
  if (!loopback(request)) return response.status(403).json({ error: "The access key is only shown on this computer." });
  const remoteEnabled = host !== "127.0.0.1" && host !== "localhost";
  const clientPort = process.env.NODE_ENV === "production" ? port : 4310;
  const urls = remoteEnabled ? Object.values(networkInterfaces()).flat().filter((address) => address?.family === "IPv4" && !address.internal).map((address) => `http://${address!.address}:${clientPort}`) : [];
  response.json({ host, port: clientPort, remoteEnabled, token: accessToken, urls: [...new Set(urls)] });
});

function safeUploadName(raw: string) {
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* use the original header */ }
  return path.basename(decoded).replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").slice(0, 120) || "attachment";
}

app.post("/api/attachments", express.raw({ type: "application/octet-stream", limit: "25mb" }), (request, response) => {
  const threadId = typeof request.query.threadId === "string" ? request.query.threadId : "";
  const thread = db.getThread(threadId);
  if (!thread) return response.status(404).json({ error: "Conversation not found." });
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) return response.status(400).json({ error: "Choose a file that is not empty." });
  const name = safeUploadName(String(request.headers["x-file-name"] || "attachment"));
  const mime = String(request.headers["x-file-type"] || "application/octet-stream").slice(0, 120);
  const id = randomBytes(16).toString("hex");
  const directory = path.join(db.attachmentsDir, id), storagePath = path.join(directory, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(storagePath, request.body, { flag: "wx", mode: 0o600 });
  const attachment = db.createAttachment({ threadId, name, mime, size: request.body.length, storagePath });
  response.status(201).json(attachment);
});

app.get("/api/attachments/:id", (request, response) => {
  const file = db.attachmentFile(request.params.id);
  if (!file || !existsSync(file.storagePath)) return response.status(404).json({ error: "File not found." });
  response.setHeader("Content-Type", file.attachment.mime);
  response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.attachment.name)}`);
  response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  response.setHeader("Cache-Control", "private, max-age=3600");
  response.setHeader("Content-Length", String(file.attachment.size));
  const stream = createReadStream(file.storagePath);
  stream.on("error", () => { if (!response.headersSent) response.status(404).json({ error: "File not found." }); else response.destroy(); });
  stream.pipe(response);
});

const messageInput = z.object({
  threadId: z.string().min(1), body: z.string().trim().max(20_000).default(""),
  targetBotIds: z.array(z.string()).max(6).optional(), attachmentIds: z.array(z.string()).max(6).default([]),
}).refine((value) => value.body.length > 0 || value.attachmentIds.length > 0, { message: "Write a message or attach a file." });

app.post("/api/messages", (request, response) => {
  const parsed = messageInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Please write a message first." });
  const thread = db.getThread(parsed.data.threadId);
  if (!thread) return response.status(404).json({ error: "Conversation not found." });
  const candidates = db.getThreadBots(thread.id);
  const requested = resolveMessageTargets({ body: parsed.data.body, bots: candidates, requestedIds: parsed.data.targetBotIds, directBotId: thread.botId });
  if (!requested.length) return response.status(400).json({ error: "Choose at least one teammate." });
  const badAttachment = parsed.data.attachmentIds.map((id) => db.getAttachment(id)).find((item) => !item || item.threadId !== thread.id || item.messageId);
  if (badAttachment !== undefined) return response.status(400).json({ error: "One of those files is no longer available." });
  const body = parsed.data.body || `Shared ${parsed.data.attachmentIds.length} file${parsed.data.attachmentIds.length === 1 ? "" : "s"}.`;
  const userMessage = db.addMessage({ threadId: thread.id, senderType: "user", senderId: null, body });
  const attachments = db.claimAttachments(parsed.data.attachmentIds, userMessage.id, thread.id);
  const attachmentLines = attachments.map((attachment) => {
    const file = db.attachmentFile(attachment.id)!;
    const workspaceName = `${attachment.id.slice(0, 8)}-${attachment.name}`;
    for (const bot of requested) {
      const inbox = path.join(db.workspacesDir, bot.id, "inbox", userMessage.id);
      mkdirSync(inbox, { recursive: true });
      copyFileSync(file.storagePath, path.join(inbox, workspaceName));
    }
    return `- inbox/${userMessage.id}/${workspaceName} (${attachment.mime}, ${attachment.size} bytes)`;
  });
  const routineIntent = attachmentLines.length === 0 ? parseRoutineIntent(body) : null;
  if (routineIntent) {
    const routines = requested.map((bot) => {
      const routine = db.createRoutine({ name: routineIntent.name, botId: bot.id, threadId: thread.id, prompt: routineIntent.prompt, intervalMinutes: routineIntent.intervalMinutes, enabled: true });
      db.addMessage({ threadId: thread.id, senderType: "bot", senderId: bot.id, body: routineIntent.confirmation });
      return routine;
    });
    broadcast();
    return response.status(201).json({ routines, routedTo: requested.map((bot) => ({ id: bot.id, name: bot.name })), attachments });
  }
  const prompt = attachmentLines.length ? `${body}\n\nFiles attached by the user are available in your workspace:\n${attachmentLines.join("\n")}\nInspect the relevant files before answering. Do not modify the originals in inbox.` : body;
  const reason = approvalReason(body);
  const runs = requested.map((bot) => db.createRun({ threadId: thread.id, botId: bot.id, prompt, status: reason ? "awaiting_approval" : "queued", approvalReason: reason }));
  broadcast();
  response.status(202).json({ runs, routedTo: requested.map((bot) => ({ id: bot.id, name: bot.name })), attachments });
});

async function performApprovedAction(action: unknown): Promise<string> {
  const parsed = z.object({ type: z.string(), botId: z.string().optional(), args: z.record(z.string(), z.unknown()).optional() }).safeParse(action);
  if (!parsed.success || !parsed.data.botId) return "Approval recorded.";
  const args = parsed.data.args || {};
  if (parsed.data.type === "bash") {
    if (!db.getBot(parsed.data.botId)?.computerEnabled) throw new Error("This teammate’s computer access is turned off.");
    const result = await computer.execute(parsed.data.botId, String(args.command || ""));
    return `Command exited ${result.code}.\n${result.stdout || result.stderr}`.slice(0, 12_000);
  }
  if (parsed.data.type === "code_run") {
    const projectId = String(args.projectId || ""), workspaceRunId = args.workspaceRunId ? String(args.workspaceRunId) : undefined;
    const project = codeProjects.forRun(parsed.data.botId, projectId, workspaceRunId);
    const access = project.access.find((item) => item.botId === parsed.data.botId)!;
    const result = await computer.executeCodeProject(parsed.data.botId, project.rootPath, String(args.command || ""), access.canWrite);
    return `Project command exited ${result.code}.\n${result.stdout || result.stderr}`.slice(0, 14_000);
  }
  if (parsed.data.type === "code_publish_pr") {
    return JSON.stringify(await codeProjects.publishPullRequest(parsed.data.botId, String(args.projectId || ""), {
      title: String(args.title || ""), body: String(args.body || ""), base: args.base ? String(args.base) : undefined, draft: args.draft === true,
    }, args.workspaceRunId ? String(args.workspaceRunId) : undefined));
  }
  if (parsed.data.type === "browser_click") {
    if (!db.getBot(parsed.data.botId)?.browserEnabled) throw new Error("This teammate’s browser access is turned off.");
    const result = await browser.click(parsed.data.botId, String(args.selector || ""));
    return `The approved click completed on ${result.title} (${result.url}).`;
  }
  if (parsed.data.type === "browser_type") {
    if (!db.getBot(parsed.data.botId)?.browserEnabled) throw new Error("This teammate’s browser access is turned off.");
    const result = await browser.type(parsed.data.botId, String(args.selector || ""), String(args.value || ""));
    return `The approved field entry completed on ${result.title} (${result.url}).`;
  }
  if (parsed.data.type === "gmail_send") {
    const bot = db.getBot(parsed.data.botId), access = db.getBotConnectorAccess(parsed.data.botId);
    if (!bot || !access?.canSend || !db.getConnector("google-workspace")?.connected) throw new Error("Gmail sending is not available for this teammate.");
    const message = { to: String(args.to || ""), cc: String(args.cc || ""), subject: String(args.subject || ""), body: String(args.body || "") };
    const result = await googleWorkspace.send(message);
    db.addConnectorEvent({ botId: bot.id, action: "gmail_send", status: "completed", summary: `Sent “${message.subject.replace(/[\r\n]+/g, " ").slice(0, 120)}” to ${message.to.replace(/[\r\n]+/g, " ").slice(0, 120)}` });
    broadcast({ type: "connector", at: Date.now() });
    return `The email was sent to ${message.to}. Gmail reference: ${result.id}.`;
  }
  if (parsed.data.type === "mac_organize") {
    if (!db.getStudioSettings().macAccessEnabled) throw new Error("Files on this Mac are turned off for the studio.");
    const moves = z.array(z.object({ from: z.string().min(1).max(1_000), to: z.string().min(1).max(1_000) })).min(1).max(100).parse(args.moves) as MacFileMove[];
    const result = macFiles.organize(moves);
    return `${result.count} file${result.count === 1 ? " was" : "s were"} moved into the approved folders. Nothing was deleted or overwritten.`;
  }
  if (["mac_app_click", "mac_app_type", "mac_app_key"].includes(parsed.data.type)) {
    if (!db.getStudioSettings().macAccessEnabled) throw new Error("Mac access is turned off for the studio.");
    const appName = String(args.app || "");
    if (parsed.data.type === "mac_app_click") await macApps.click(appName, String(args.elementIndex || ""), Number(args.clickCount || 1));
    if (parsed.data.type === "mac_app_type") await macApps.type(appName, String(args.text || ""), args.clear === true);
    if (parsed.data.type === "mac_app_key") await macApps.key(appName, String(args.key || ""), Array.isArray(args.modifiers) ? args.modifiers.map(String) : []);
    return `The approved action was completed in ${appName}.`;
  }
  return "Approval recorded.";
}

async function decideApproval(approvalId: string, decision: "approved" | "denied") {
  const approval = db.getApproval(approvalId);
  if (!approval || approval.status !== "pending") return null;
  const action = db.getApprovalAction(approval.id) as { type?: string; botId?: string } | null;
  const decided = db.decideApproval(approval.id, decision);
  if (decision === "denied" && action?.type === "gmail_send") {
    db.addConnectorEvent({ botId: action.botId || approval.botId, action: "gmail_send", status: "failed", summary: "Email was not sent because you chose Not now" });
    broadcast({ type: "connector", at: Date.now() });
  }
  if (decision === "approved" && action?.type && action.type !== "run") {
    db.updateRun(approval.runId, { status: "running", progressAt: new Date().toISOString(), taskStage: "working" });
    try {
      const result = await performApprovedAction(action);
      db.setRunPrompt(approval.runId, `The user approved the requested action and OpenBot performed it. Result:\n${result}\n\nContinue the task from here without repeating that action.`);
      db.addActivity({ runId: approval.runId, botId: approval.botId, kind: "status", label: "Approved and completed", detail: result.slice(0, 180) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (action.type === "gmail_send") { db.addConnectorEvent({ botId: action.botId || approval.botId, action: "gmail_send", status: "failed", summary: message }); broadcast({ type: "connector", at: Date.now() }); }
      db.setRunPrompt(approval.runId, `The user approved the action, but it failed with: ${message}. Continue safely or explain the blocker.`);
      db.addActivity({ runId: approval.runId, botId: approval.botId, kind: "error", label: "The approved action needs attention", detail: message.slice(0, 180) });
    }
    db.updateRun(approval.runId, { status: "queued", taskStage: "working" });
  }
  return decided;
}

app.post("/api/approvals/:id/decide", async (request, response) => {
  const parsed = z.object({ decision: z.enum(["approved", "denied"]) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose approve or deny." });
  const decided = await decideApproval(request.params.id, parsed.data.decision);
  if (!decided) return response.status(409).json({ error: "This approval is no longer waiting." });
  broadcast();
  response.json(decided);
});

app.post("/api/runs/:id/approve", async (request, response) => {
  const run = db.getRun(request.params.id);
  if (!run?.approvalId) return response.status(409).json({ error: "This task is not waiting for approval." });
  const approval = await decideApproval(run.approvalId, "approved");
  if (!approval) return response.status(409).json({ error: "This task is no longer waiting." });
  db.addActivity({ runId: run.id, botId: run.botId, kind: "status", label: "Approved by you", detail: null });
  broadcast();
  response.json({ ok: true });
});

app.post("/api/runs/:id/cancel", async (request, response) => {
  const run = db.getRun(request.params.id);
  if (!run) return response.status(404).json({ error: "Task not found." });
  if (run.status === "running") runner.cancel(run.id);
  else { db.updateRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString(), taskStage: "blocked" }); db.finishRunTask(run.id, "cancelled"); }
  if (run.approvalId) await decideApproval(run.approvalId, "denied");
  broadcast();
  response.json({ ok: true });
});

const botInput = z.object({
  name: z.string().trim().min(1).max(30), emoji: z.string().trim().min(1).max(8),
  mascot: z.enum(["nova", "blob", "sprout", "orbit", "pebble", "sunny"]).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i), role: z.string().trim().min(1).max(60),
  instructions: z.string().trim().min(1).max(2_000), model: z.string().optional(), providerInstanceId: z.string().nullable().optional(),
  computerEnabled: z.boolean().optional(), browserEnabled: z.boolean().optional(), weeklyTokenBudget: z.number().int().min(0).max(100_000_000).optional(),
});

app.post("/api/bots", (request, response) => {
  const parsed = botInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "A name, role and personality are required." });
  const connection = db.getProvider(parsed.data.providerInstanceId || "local-opencode");
  if (!connection) return response.status(400).json({ error: "Choose a valid AI connection for this teammate." });
  if (parsed.data.model && !modelBelongsToConnection(parsed.data.model, connection)) return response.status(400).json({ error: "That model does not belong to the selected connection." });
  const bot = db.createBot(parsed.data);
  broadcast();
  response.status(201).json(bot);
});

function modelBelongsToConnection(model: string, provider: ProviderInstance): boolean {
  if (provider.runtime === "claude_code") return model.startsWith("claude-code/");
  if (provider.provider === "custom") return !model.startsWith("claude-code/");
  const prefix: Record<Exclude<ProviderInstance["provider"], "custom">, string[]> = {
    opencode: ["opencode/", "opencode-go/"], claude: ["anthropic/"], openai: ["openai/"],
    "github-copilot": ["github-copilot/"], gitlab: ["gitlab/"], xai: ["xai/"],
  };
  return prefix[provider.provider].some((value) => model.startsWith(value));
}

app.patch("/api/bots/:id", (request, response) => {
  const parsed = botInput.partial().safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Those bot settings are not valid." });
  const current = db.getBot(request.params.id);
  if (!current) return response.status(404).json({ error: "Teammate not found." });
  const connectionId = parsed.data.providerInstanceId === undefined ? current.providerInstanceId : parsed.data.providerInstanceId;
  const connection = connectionId ? db.getProvider(connectionId) : null;
  if (!connection) return response.status(400).json({ error: "Choose a valid AI connection for this teammate." });
  const model = parsed.data.model ?? current.model;
  if (!modelBelongsToConnection(model, connection)) return response.status(400).json({ error: "That model does not belong to the selected connection." });
  const bot = db.updateBot(request.params.id, parsed.data);
  broadcast();
  response.json(bot);
});

const providerInput = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(60), provider: z.enum(["opencode", "claude", "openai", "github-copilot", "gitlab", "xai", "custom"]).optional(), authMode: z.enum(["cli", "subscription", "api_key"]), runtime: z.enum(["opencode", "claude_code"]).optional(), envName: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/).nullable().optional(), secret: z.string().max(10_000).nullable().optional() });
app.post("/api/providers", (request, response) => {
  const parsed = providerInput.safeParse(request.body);
  if (!parsed.success || (parsed.data.authMode === "api_key" && !parsed.data.envName)) return response.status(400).json({ error: "API key connections need a valid environment variable name." });
  const provider = db.upsertProvider(parsed.data);
  broadcast();
  response.status(201).json(provider);
});

const routineInput = z.object({ name: z.string().trim().min(1).max(80), botId: z.string(), threadId: z.string(), prompt: z.string().trim().min(1).max(10_000), intervalMinutes: z.number().int().min(5).max(43_200), enabled: z.boolean().optional() });
app.post("/api/routines", (request, response) => {
  const parsed = routineInput.safeParse(request.body);
  if (!parsed.success || !db.getBot(parsed.data.botId) || !db.getThread(parsed.data.threadId)) return response.status(400).json({ error: "That routine needs a teammate, conversation and instruction." });
  const routine = db.createRoutine(parsed.data);
  broadcast();
  response.status(201).json(routine);
});
app.patch("/api/routines/:id", (request, response) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose whether this routine is on or off." });
  const routine = db.toggleRoutine(request.params.id, parsed.data.enabled);
  if (!routine) return response.status(404).json({ error: "Routine not found." });
  broadcast(); response.json(routine);
});
app.post("/api/routines/:id/run", (request, response) => {
  const routine = db.getRoutine(request.params.id);
  if (!routine) return response.status(404).json({ error: "Routine not found." });
  const run = db.createRun({ threadId: routine.threadId, botId: routine.botId, prompt: routine.prompt, status: "queued", routineId: routine.id });
  db.markRoutineRan(routine); broadcast(); response.status(202).json(run);
});

function safeWorkspacePath(botId: string, relativePath = ""): string | null {
  const root = path.resolve(db.workspacesDir, botId), target = path.resolve(root, relativePath);
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
}
function listWorkspace(root: string, current = root, depth = 0): WorkspaceFile[] {
  if (depth > 5 || !existsSync(current)) return [];
  return readdirSync(current, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).flatMap((entry) => {
    const absolute = path.join(current, entry.name), stat = statSync(absolute);
    const item: WorkspaceFile = { path: path.relative(root, absolute), size: stat.size, modifiedAt: stat.mtime.toISOString(), kind: entry.isDirectory() ? "directory" : "file" };
    return entry.isDirectory() ? [item, ...listWorkspace(root, absolute, depth + 1)] : [item];
  });
}
app.get("/api/bots/:id/files", (request, response) => {
  if (!db.getBot(request.params.id)) return response.status(404).json({ error: "Teammate not found." });
  const root = safeWorkspacePath(request.params.id);
  response.json(root ? listWorkspace(root) : []);
});
app.get("/api/bots/:id/file", (request, response) => {
  const relativePath = typeof request.query.path === "string" ? request.query.path : "";
  const target = safeWorkspacePath(request.params.id, relativePath);
  if (!db.getBot(request.params.id) || !target || !existsSync(target) || !statSync(target).isFile()) return response.status(404).json({ error: "File not found." });
  if (statSync(target).size > 500_000) return response.status(413).json({ error: "This file is too large to preview." });
  response.json({ path: relativePath, content: readFileSync(target, "utf8") });
});

app.get("/api/bots/:id/computer", async (request, response) => {
  if (!db.getBot(request.params.id)) return response.status(404).json({ error: "Teammate not found." });
  response.json(await browser.status(request.params.id, computer));
});
app.post("/api/bots/:id/computer/start", async (request, response) => {
  try { await computer.ensure(request.params.id); response.json(await browser.status(request.params.id, computer)); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/api/bots/:id/browser/open", async (request, response) => {
  const parsed = z.object({ url: z.string().url() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Enter a complete web address." });
  try { response.json(await browser.open(request.params.id, parsed.data.url)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.get("/api/bots/:id/browser/snapshot", async (request, response) => {
  try { response.json(await browser.snapshot(request.params.id)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/api/bots/:id/browser/click", async (request, response) => {
  const parsed = z.object({ selector: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose something to click." });
  try { response.json(await browser.click(request.params.id, parsed.data.selector)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/api/bots/:id/browser/type", async (request, response) => {
  const parsed = z.object({ selector: z.string().min(1), value: z.string() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Choose a field and value." });
  try { response.json(await browser.type(request.params.id, parsed.data.selector, parsed.data.value)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.get("/api/bots/:id/workflows", (request, response) => response.json(db.listWorkflows(request.params.id)));
app.get("/api/bots/:id/teach", (request, response) => response.json(browser.teachingStatus(request.params.id)));
app.post("/api/bots/:id/teach/start", async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), startUrl: z.string().url() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Give the workflow a name and complete starting web address." });
  try { response.json(await browser.startTeaching(request.params.id, parsed.data.name, parsed.data.startUrl)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/api/bots/:id/teach/stop", async (request, response) => {
  try { response.json(await browser.stopTeaching(request.params.id)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

const internalToolInput = z.object({ botId: z.string(), runId: z.string(), action: z.enum(["bash", "browser_open", "browser_snapshot", "browser_click", "browser_type", "mac_list", "mac_read", "mac_organize", "mac_apps_list", "mac_app_inspect", "mac_app_open", "mac_app_click", "mac_app_type", "mac_app_key", "mac_app_scroll", "code_projects", "code_list", "code_search", "code_read", "code_write", "code_replace", "code_status", "code_diff", "code_branch", "code_commit", "code_request_review", "code_review_result", "code_publish_pr", "code_run", "gmail_search", "gmail_read", "gmail_send", "google_drive_search", "google_drive_read", "google_calendar_agenda", "task_plan", "task_progress", "task_verify", "routine_create", "remember", "handoff", "message_teammate", "request_approval"]), args: z.record(z.string(), z.unknown()) });
app.post("/api/internal/tools", async (request, response) => {
  if (request.headers["x-openbot-token"] !== internalToken) return response.status(403).json({ error: "Internal tool access denied." });
  const parsed = internalToolInput.safeParse(request.body);
  if (!parsed.success || !db.getBot(parsed.data.botId) || !db.getRun(parsed.data.runId)) return response.status(400).json({ error: "Invalid bot tool request." });
  const { botId, runId, action, args } = parsed.data;
  const bot = db.getBot(botId)!;
  const holdForApproval = (kind: "terminal" | "browser" | "external", reason: string, actionLabel: string, savedArgs: Record<string, unknown> = args) => {
    const approval = db.createApproval({ runId, botId, kind, reason, actionLabel, action: { type: action, botId, args: savedArgs } });
    broadcast();
    setTimeout(() => runner.cancel(runId), 80);
    return response.json({ approvalRequired: true, approvalId: approval.id, message: "Paused. The user can approve this whenever they are ready; it will not expire." });
  };
  try {
    if (action === "task_plan") {
      const plan = z.object({
        goal: z.string().trim().min(1).max(240), deliverable: z.string().trim().min(1).max(240),
        steps: z.array(z.string().trim().min(1).max(140)).min(1).max(8),
        requiredApps: z.array(z.enum(["gmail", "google-drive", "google-calendar", "browser", "computer", "mac", "code", "teammate"])).max(8).default([]),
        approvalBoundary: z.string().trim().max(240).optional(),
      }).safeParse(args);
      if (!plan.success) return response.status(400).json({ error: "Set one clear outcome, deliverable, and up to eight meaningful steps." });
      const task = db.setRunTaskPlan(runId, plan.data);
      broadcast();
      return response.json({ ok: true, task });
    }
    if (action === "task_progress") {
      const progress = z.object({ stepId: z.number().int().min(1).max(8), status: z.enum(["active", "completed", "blocked", "skipped"]), detail: z.string().trim().max(220).optional() }).safeParse(args);
      if (!progress.success) return response.status(400).json({ error: "Choose a job step and its current state." });
      const task = db.updateRunTaskStep(runId, progress.data.stepId, progress.data.status, progress.data.detail);
      broadcast();
      return response.json({ ok: true, task });
    }
    if (action === "task_verify") {
      const verification = z.object({
        status: z.enum(["passed", "partial", "blocked"]), summary: z.string().trim().min(1).max(500),
        checks: z.array(z.object({ label: z.string().trim().min(1).max(180), passed: z.boolean() })).min(1).max(8),
      }).safeParse(args);
      if (!verification.success) return response.status(400).json({ error: "Record what was checked and whether each check passed." });
      const task = db.verifyRunTask(runId, verification.data);
      broadcast();
      return response.json({ ok: true, task });
    }
    if (action === "code_projects") {
      const workspace = db.getCodeTaskWorkspace(runId);
      const projects = db.listCodeProjects(botId).map((project) => {
        const access = project.access.find((item) => item.botId === botId)!;
        const reviewers = project.access.filter((item) => item.botId !== botId && item.canRead).map((item) => { const reviewer = db.getBot(item.botId)!; return { id: reviewer.id, name: reviewer.name, role: reviewer.role }; });
        return { id: project.id, name: project.name, projectKind: project.projectKind, gitRepository: project.gitRepository, remoteUrl: project.remoteUrl, defaultBranch: project.defaultBranch, canRead: access.canRead, canWrite: access.canWrite, canRun: access.canRun, workspace: workspace?.projectId === project.id ? workspace : null, reviewers };
      });
      return response.json({ projects });
    }
    if (action === "code_review_result") {
      const result = z.object({ sourceRunId: z.string().uuid(), projectId: z.string().uuid(), headCommit: z.string().regex(/^[a-f0-9]{40}$/i), verdict: z.enum(["approved", "changes_requested"]), summary: z.string().trim().min(1).max(800), findings: z.array(z.string().trim().min(1).max(500)).max(12) }).safeParse(args);
      if (!result.success) return response.status(400).json({ error: "Give the code review a clear verdict, summary, and focused findings." });
      const reviewerRun = db.getRun(runId), sourceRun = db.getRun(result.data.sourceRunId), workspace = db.getCodeTaskWorkspace(result.data.sourceRunId);
      if (!reviewerRun || reviewerRun.botId !== botId || reviewerRun.parentRunId !== result.data.sourceRunId || !sourceRun || sourceRun.botId === botId || !workspace || workspace.projectId !== result.data.projectId) return response.status(403).json({ error: "This review is not linked to the coding task that requested it." });
      if (!db.getCodeProjectForBot(botId, result.data.projectId, "read")) return response.status(403).json({ error: "This teammate no longer has review access to that project." });
      if (codeProjects.currentCommit(sourceRun.botId, result.data.projectId, result.data.sourceRunId) !== result.data.headCommit) return response.status(409).json({ error: "The branch changed during review. Ask for a fresh independent review." });
      if (db.getCodeTaskReviewByReviewerRun(runId)) return response.json({ ok: true, review: db.getCodeTaskReviewByReviewerRun(runId) });
      const saved = db.recordCodeTaskReview({ sourceRunId: result.data.sourceRunId, reviewerRunId: runId, projectId: result.data.projectId, reviewerBotId: botId, verdict: result.data.verdict, summary: result.data.summary, findings: result.data.findings, headCommit: result.data.headCommit });
      db.addActivity({ runId: result.data.sourceRunId, botId: sourceRun.botId, kind: "message", label: `${bot.name} ${saved.verdict === "approved" ? "approved the code review" : "requested changes"}`, detail: saved.summary.slice(0, 180) });
      db.addAgentMessage({ threadId: sourceRun.threadId, fromBotId: botId, toBotId: sourceRun.botId, body: `${saved.verdict === "approved" ? "Review approved" : "Changes requested"}: ${saved.summary}${saved.findings.length ? `\n${saved.findings.map((finding) => `- ${finding}`).join("\n")}` : ""}`.slice(0, 4_000), kind: "finding", expectsReply: false, runId, hopCount: db.runDepth(runId), dedupeKey: `code-review-result:${runId}` });
      broadcast();
      return response.json({ ok: true, review: saved });
    }
    if (["code_list", "code_search", "code_read", "code_write", "code_replace", "code_status", "code_diff", "code_branch", "code_commit", "code_request_review", "code_publish_pr", "code_run"].includes(action)) {
      const base = z.object({ projectId: z.string().uuid() }).safeParse(args);
      if (!base.success) return response.status(400).json({ error: "Choose one of the code projects shared with you." });
      const projectId = base.data.projectId;
      const taskWorkspace = db.getCodeTaskWorkspace(runId);
      if (["code_write", "code_replace", "code_commit", "code_request_review", "code_publish_pr", "code_run"].includes(action) && !taskWorkspace) return response.status(409).json({ error: "Start an isolated task branch before changing code or running checks." });
      if (taskWorkspace && taskWorkspace.projectId !== projectId) return response.status(409).json({ error: `This task is already working in ${taskWorkspace.projectName}.` });
      if (action === "code_list") return response.json(codeProjects.list(botId, projectId, typeof args.path === "string" ? args.path : "", runId));
      if (action === "code_search") return response.json(codeProjects.search(botId, projectId, z.string().min(1).max(240).parse(args.query), runId));
      if (action === "code_read") return response.json(codeProjects.read(botId, projectId, z.string().min(1).max(1_000).parse(args.path), runId));
      if (action === "code_write") return response.json(codeProjects.write(botId, projectId, z.string().min(1).max(1_000).parse(args.path), z.string().max(1_000_000).parse(args.content), runId));
      if (action === "code_replace") return response.json(codeProjects.replace(botId, projectId, z.string().min(1).max(1_000).parse(args.path), z.string().min(1).max(1_000_000).parse(args.oldText), z.string().max(1_000_000).parse(args.newText), args.expectedOccurrences === undefined ? 1 : z.number().int().min(1).max(100).parse(args.expectedOccurrences), runId));
      if (action === "code_status") return response.json(codeProjects.status(botId, projectId, runId));
      if (action === "code_diff") return response.json(codeProjects.review(botId, projectId, runId));
      if (action === "code_branch") return response.json(codeProjects.branch(botId, projectId, z.string().min(1).max(120).parse(args.name), runId));
      if (action === "code_commit") {
        const commit = z.object({ message: z.string().min(1).max(120), paths: z.array(z.string().min(1).max(1_000)).min(1).max(50) }).parse(args);
        return response.json(codeProjects.commit(botId, projectId, commit.message, commit.paths, runId));
      }
      if (action === "code_request_review") {
        const requestReview = z.object({ reviewerBotId: z.string().min(1) }).parse(args);
        const target = db.getBot(requestReview.reviewerBotId), sourceRun = db.getRun(runId);
        if (!sourceRun || sourceRun.botId !== botId) return response.status(403).json({ error: "This coding task is not available for that teammate." });
        if (!target || target.id === botId) return response.status(400).json({ error: "Choose a different teammate to review the code." });
        if (!db.getCodeProjectForBot(target.id, projectId, "read")) return response.status(403).json({ error: `${target.name} needs read access to this project before reviewing it.` });
        if (sourceRun?.task.verificationStatus !== "passed") return response.status(409).json({ error: "Finish and record the project checks before asking for independent review." });
        if (db.runDepth(runId) >= 3 || db.descendantRunCount(runId) >= 8) return response.status(409).json({ error: "Teamwork limit reached for this task." });
        const prepared = codeProjects.prepareIndependentReview(botId, projectId, runId), previous = db.latestCodeTaskReview(runId);
        if (previous?.headCommit === prepared.headCommit && previous.verdict === "approved") return response.json({ ok: true, status: `${previous.reviewerBotName} already approved this exact commit.`, review: previous });
        if (!db.claimDedupe(`code-review:${runId}:${prepared.headCommit}`)) return response.json({ ok: true, status: `${target.name} is already reviewing this commit.` });
        const verification = sourceRun?.task.verificationSummary || "The coding teammate recorded all requested checks as passed.";
        const reviewerPrompt = `Independent code review requested by ${sourceRun?.botName || bot.name}.\n\nProject: ${prepared.project.name}\nBranch: ${prepared.workspace.branch}\nBase: ${prepared.base}\nExact commit: ${prepared.headCommit}\nRecorded verification: ${verification}\n\nChanged files:\n${prepared.review.changes.join("\n")}\n\nCode diff:\n${prepared.review.diff}\n\nReview the supplied diff independently for correctness, regressions, security, unsafe scope, and missing tests. Do not edit or publish anything. When finished, call code_review_result exactly once with sourceRunId=${runId}, projectId=${projectId}, headCommit=${prepared.headCommit}, a verdict of approved or changes_requested, a concise summary, and up to 12 actionable findings. Then give the user a short natural review outcome.`;
        const reviewerRun = db.createRun({ threadId: sourceRun!.threadId, botId: target.id, prompt: reviewerPrompt, status: "queued", parentRunId: runId });
        db.addAgentMessage({ threadId: sourceRun!.threadId, fromBotId: botId, toBotId: target.id, body: `Please independently review ${prepared.project.name} branch ${prepared.workspace.branch} at ${prepared.headCommit.slice(0, 8)}.`, kind: "handoff", expectsReply: true, runId, hopCount: db.runDepth(runId) + 1, dedupeKey: `agent:code-review:${reviewerRun.id}` });
        db.addActivity({ runId, botId, kind: "handoff", label: `${target.name} is independently reviewing the code`, detail: prepared.workspace.branch });
        broadcast();
        return response.json({ ok: true, status: `${target.name} is independently reviewing this exact commit.` });
      }
      if (action === "code_publish_pr") {
        const publish = z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(10_000), base: z.string().min(1).max(120).optional(), draft: z.boolean().optional() }).parse(args);
        const run = db.getRun(runId);
        if (run?.task.verificationStatus !== "passed") return response.status(409).json({ error: "Run and record the final checks before asking to publish this pull request." });
        const ready = codeProjects.preparePublish(botId, projectId, publish.base, runId);
        const independentReview = db.latestCodeTaskReview(runId), headCommit = codeProjects.currentCommit(botId, projectId, runId);
        if (!independentReview || independentReview.verdict !== "approved" || independentReview.headCommit !== headCommit) return response.status(409).json({ error: "Ask another teammate for an independent code review of this exact commit before publishing." });
        return holdForApproval("external", `${bot.name} finished the checks and is ready to publish branch “${ready.branch}” as ${publish.draft ? "a draft " : ""}pull request into “${ready.base}”. Title: “${publish.title}”.`, `Publish pull request for ${ready.project.name}`, { ...args, workspaceRunId: runId });
      }
      const command = z.string().min(1).max(4_000).parse(args.command), reason = commandApprovalReason(command);
      if (reason) return holdForApproval("terminal", reason, `Run in ${db.getCodeProject(projectId)?.name || "code project"}: ${command.slice(0, 140)}`, { ...args, workspaceRunId: runId });
      const project = codeProjects.forRun(botId, projectId, runId);
      const access = project.access.find((item) => item.botId === botId)!;
      const result = await computer.executeCodeProject(botId, project.rootPath, command, access.canWrite);
      return response.json(result);
    }
    if (action === "bash") {
      if (!bot.computerEnabled) return response.status(403).json({ error: "Your computer access is turned off. The user can enable it in your settings." });
      const command = String(args.command || ""), reason = commandApprovalReason(command);
      if (reason) return holdForApproval("terminal", reason, command.slice(0, 180));
      const result = await computer.execute(botId, command);
      return response.json(result);
    }
    if (action.startsWith("browser_") && !bot.browserEnabled) return response.status(403).json({ error: "Your browser access is turned off. The user can enable it in your settings." });
    if (action === "browser_open") return response.json(await browser.open(botId, String(args.url || "")));
    if (action === "browser_snapshot") return response.json(await browser.snapshot(botId));
    if (action === "browser_click") {
      const selector = String(args.selector || ""), reason = browserApprovalReason("click", selector);
      if (reason) return holdForApproval("browser", reason, `Click ${selector}`);
      return response.json(await browser.click(botId, selector));
    }
    if (action === "browser_type") {
      const selector = String(args.selector || ""), value = String(args.value || ""), reason = browserApprovalReason("type", `${selector} ${value}`);
      if (reason) return holdForApproval("browser", reason, `Enter information in ${selector}`);
      return response.json(await browser.type(botId, selector, value));
    }
    if (action.startsWith("mac_")) {
      if (!db.getStudioSettings().macAccessEnabled) return response.status(403).json({ error: "Mac files and apps are turned off for the studio. The user can turn them on in Control center." });
      if (action === "mac_list") return response.json({ files: macFiles.list(String(args.path || "")) });
      if (action === "mac_read") return response.json(macFiles.read(String(args.path || "")));
      if (action === "mac_apps_list") return response.json(await macApps.list());
      if (action === "mac_app_inspect") {
        const maxElements = Math.max(1, Math.min(100, Number(args.maxElements || 50)));
        const state = await macApps.inspect(String(args.app || ""), maxElements);
        if ("error" in state) return response.status(404).json({ error: "That Mac app is not open. Open it first, then inspect it again." });
        return response.json(state);
      }
      if (action === "mac_app_open") return response.json({ opened: await macApps.open(String(args.app || "")) });
      if (action === "mac_app_scroll") { await macApps.scroll(String(args.app || ""), Number(args.amount || 0)); return response.json({ ok: true }); }
      if (action === "mac_app_click") {
        const appName = String(args.app || ""), elementIndex = String(args.elementIndex || "");
        const state = await macApps.inspect(appName, 100);
        const label = "elements" in state ? state.elements.find((element) => element.index === elementIndex)?.label : null;
        return holdForApproval("external", `${bot.name} is ready to click ${label ? `“${label}”` : `control ${elementIndex}`} in ${appName}.`, `Click in ${appName}`);
      }
      if (action === "mac_app_type") {
        const appName = String(args.app || ""), value = String(args.text || ""), preview = value.replace(/\s+/g, " ").slice(0, 180);
        return holdForApproval("external", `${bot.name} is ready to enter${args.clear === true ? " and replace the current field with" : ""}: “${preview}${value.length > 180 ? "…" : ""}” in ${appName}.`, `Type in ${appName}`);
      }
      if (action === "mac_app_key") return holdForApproval("external", `${bot.name} is ready to press ${[...(Array.isArray(args.modifiers) ? args.modifiers : []), args.key].filter(Boolean).join("+")} in ${String(args.app || "this app")}.`, `Press a key in ${String(args.app || "a Mac app")}`);
      const moves = z.array(z.object({ from: z.string().min(1).max(1_000), to: z.string().min(1).max(1_000) })).min(1).max(100).safeParse(args.moves);
      if (!moves.success) return response.status(400).json({ error: "Choose the files and their destination folders." });
      const destinations = [...new Set(moves.data.map((move) => path.dirname(move.to)))].slice(0, 3);
      return holdForApproval("external", `${bot.name} is ready to move ${moves.data.length} file${moves.data.length === 1 ? "" : "s"} into ${destinations.join(", ")}${destinations.length < new Set(moves.data.map((move) => path.dirname(move.to))).size ? " and other folders" : ""}. Nothing will be deleted or overwritten.`, `Organize ${moves.data.length} Mac file${moves.data.length === 1 ? "" : "s"}`);
    }
    if (action === "gmail_search" || action === "gmail_read" || action === "gmail_send") {
      const connection = db.getConnector("google-workspace"), access = db.getBotConnectorAccess(botId);
      if (!connection?.connected) return response.status(409).json({ error: "Gmail is not connected yet. Ask the user to connect it in Apps & Tools." });
      if ((action === "gmail_search" || action === "gmail_read") && !access?.canRead) return response.status(403).json({ error: "This teammate does not have permission to read Gmail." });
      if (action === "gmail_send" && !access?.canSend) return response.status(403).json({ error: "This teammate does not have permission to prepare Gmail messages." });
      if (action === "gmail_search") {
        const query = String(args.query || "").trim().slice(0, 500), maxResults = Number(args.maxResults || 8);
        const messages = await googleWorkspace.search(query, Number.isFinite(maxResults) ? maxResults : 8);
        db.addConnectorEvent({ botId, action, status: "completed", summary: `${bot.name} found ${messages.length} matching email${messages.length === 1 ? "" : "s"}` });
        broadcast({ type: "connector", at: Date.now() });
        return response.json({ messages, count: messages.length });
      }
      if (action === "gmail_read") {
        const message = await googleWorkspace.read(String(args.messageId || ""));
        db.addConnectorEvent({ botId, action, status: "completed", summary: `${bot.name} read “${message.subject.slice(0, 120)}”` });
        broadcast({ type: "connector", at: Date.now() });
        return response.json(message);
      }
      const email = { to: String(args.to || ""), cc: String(args.cc || ""), subject: String(args.subject || ""), body: String(args.body || "") };
      buildRawEmail(email);
      const recipient = email.to.replace(/[\r\n]+/g, " ").slice(0, 120), subject = email.subject.replace(/[\r\n]+/g, " ").slice(0, 120);
      db.addConnectorEvent({ botId, action, status: "waiting", summary: `${bot.name} prepared “${subject}” for ${recipient}` });
      broadcast({ type: "connector", at: Date.now() });
      const preview = email.body.trim().replace(/\s+/g, " ").slice(0, 260);
      return holdForApproval("external", `${bot.name} prepared an email to ${recipient}. Subject: “${subject}”. Preview: ${preview}${email.body.trim().length > 260 ? "…" : ""}`, `Send “${subject}” to ${recipient}`);
    }
    if (action === "google_drive_search" || action === "google_drive_read") {
      const access = db.getBotConnectorAccess(botId, "google-drive"), catalog = connectorCatalog(Boolean(db.getConnector("google-workspace")?.connected), db.getConnector("google-workspace")?.scopes || []);
      if (!catalog.find((entry) => entry.id === "google-drive")?.connected) return response.status(409).json({ error: "Google Drive needs to be connected or reconnected in Apps & Tools." });
      if (!access?.canRead) return response.status(403).json({ error: "This teammate does not have permission to read Google Drive." });
      if (action === "google_drive_search") {
        const files = await googleWorkspace.searchDrive(String(args.query || ""), Number(args.maxResults || 8));
        db.addConnectorEvent({ botId, action, status: "completed", summary: `${bot.name} found ${files.length} matching Drive file${files.length === 1 ? "" : "s"}` });
        broadcast({ type: "connector", at: Date.now() }); return response.json({ files, count: files.length });
      }
      const file = await googleWorkspace.readDriveFile(String(args.fileId || ""));
      db.addConnectorEvent({ botId, action, status: "completed", summary: `${bot.name} read “${file.name.slice(0, 120)}” from Drive` });
      broadcast({ type: "connector", at: Date.now() }); return response.json(file);
    }
    if (action === "google_calendar_agenda") {
      const access = db.getBotConnectorAccess(botId, "google-calendar"), catalog = connectorCatalog(Boolean(db.getConnector("google-workspace")?.connected), db.getConnector("google-workspace")?.scopes || []);
      if (!catalog.find((entry) => entry.id === "google-calendar")?.connected) return response.status(409).json({ error: "Google Calendar needs to be connected or reconnected in Apps & Tools." });
      if (!access?.canRead) return response.status(403).json({ error: "This teammate does not have permission to read Google Calendar." });
      const events = await googleWorkspace.calendarAgenda(Number(args.days || 7), Number(args.maxResults || 20));
      db.addConnectorEvent({ botId, action, status: "completed", summary: `${bot.name} checked ${events.length} upcoming calendar event${events.length === 1 ? "" : "s"}` });
      broadcast({ type: "connector", at: Date.now() }); return response.json({ events, count: events.length });
    }
    if (action === "routine_create") {
      const sourceRun = db.getRun(runId)!;
      const routine = routineInput.safeParse({
        name: args.name, botId, threadId: sourceRun.threadId, prompt: args.prompt,
        intervalMinutes: args.intervalMinutes, enabled: args.enabled !== false,
      });
      if (!routine.success) return response.status(400).json({ error: "Choose a name, what should happen, and a repeat time of at least 5 minutes." });
      const created = db.createRoutine(routine.data);
      db.addActivity({ runId, botId, kind: "tool", label: `Set up ${created.name}`, detail: null });
      broadcast();
      return response.status(201).json({ ok: true, name: created.name, schedule: created.intervalMinutes, enabled: created.enabled });
    }
    if (action === "remember") { db.remember(botId, String(args.key || "preference"), String(args.content || "")); return response.json({ saved: true }); }
    if (action === "handoff") {
      const target = db.getBot(String(args.botId || ""));
      if (!target) return response.status(404).json({ error: "That teammate does not exist." });
      if (target.id === botId) return response.status(400).json({ error: "Choose a different teammate for a handoff." });
      const depth = db.runDepth(runId), descendantCount = db.descendantRunCount(runId);
      if (depth >= 3 || descendantCount >= 8) return response.status(409).json({ error: "Teamwork limit reached for this task. Share the current result with the user before starting more work." });
      const dedupeKey = `${runId}:${String(args.dedupeKey || args.task || "handoff")}`;
      if (!db.claimDedupe(dedupeKey)) return response.json({ ok: true, status: `${target.name} is already taking a look.` });
      const sourceRun = db.getRun(runId)!;
      db.addAgentMessage({ threadId: sourceRun.threadId, fromBotId: botId, toBotId: target.id, body: String(args.task || "").slice(0, 4_000), kind: "handoff", expectsReply: true, runId, hopCount: depth + 1, dedupeKey: `agent:${dedupeKey}` });
      db.createRun({ threadId: sourceRun.threadId, botId: target.id, prompt: `Handoff from ${sourceRun.botName}: ${String(args.task || "")}`, status: "queued", parentRunId: runId });
      db.addActivity({ runId, botId, kind: "handoff", label: `${target.name} is helping with this`, detail: null });
      broadcast(); return response.json({ ok: true, status: `${target.name} is taking care of that part.` });
    }
    if (action === "message_teammate") {
      const target = db.getBot(String(args.botId || ""));
      if (!target || target.id === botId) return response.status(400).json({ error: "Choose another teammate." });
      const sourceRun = db.getRun(runId)!, depth = db.runDepth(runId), expectsReply = args.expectsReply === true;
      if (depth >= 3 || db.descendantRunCount(runId) >= 8) return response.status(409).json({ error: "Team conversation limit reached. Bring the useful findings back to the user now." });
      const body = String(args.message || "").trim().slice(0, 4_000);
      if (!body) return response.status(400).json({ error: "Write a useful message for the teammate." });
      const dedupeKey = `agent:${runId}:${String(args.dedupeKey || body)}`;
      const message = db.addAgentMessage({
        threadId: sourceRun.threadId, fromBotId: botId, toBotId: target.id, body,
        kind: ["message", "question", "finding"].includes(String(args.kind)) ? String(args.kind) as "message" | "question" | "finding" : "message",
        expectsReply, runId, replyToId: typeof args.replyToId === "string" ? args.replyToId : null, hopCount: depth + 1, dedupeKey,
      });
      if (!message) return response.json({ ok: true, status: `${target.name} already has this.` });
      if (expectsReply) {
        db.createRun({ threadId: sourceRun.threadId, botId: target.id, prompt: `Private teammate message from ${sourceRun.botName}: ${body}\n\nGive a focused answer. Quietly share the useful result back with message_teammate using expectsReply=false. Then tell the user only the useful outcome in natural language—never mention the tool name, fields, IDs, or delivery receipt.`, status: "queued", parentRunId: runId });
      }
      db.addActivity({ runId, botId, kind: "message", label: expectsReply ? `Asked ${target.name} for a second look` : `Shared an update with ${target.name}`, detail: null });
      broadcast(); return response.json({ ok: true, status: expectsReply ? `${target.name} is taking a look.` : `${target.name} has the update.` });
    }
    if (action === "request_approval") return holdForApproval("external", String(args.reason || "This action needs your okay."), String(args.actionLabel || "Sensitive action"));
    return response.status(400).json({ error: "Unknown tool." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (action.startsWith("gmail_") || action.startsWith("google_")) { db.addConnectorEvent({ botId, action, status: "failed", summary: message }); broadcast({ type: "connector", at: Date.now() }); }
    return response.status(500).json({ error: message });
  }
});

setInterval(() => {
  let changed = false;
  for (const routine of db.dueRoutines()) {
    db.addMessage({ threadId: routine.threadId, senderType: "system", senderId: null, body: `Routine “${routine.name}” started for ${routine.botName}.` });
    db.createRun({ threadId: routine.threadId, botId: routine.botId, prompt: routine.prompt, status: "queued", routineId: routine.id });
    db.markRoutineRan(routine); changed = true;
  }
  if (changed) broadcast();
}, 15_000);

const distDir = path.join(rootDir, "dist");
if (process.env.NODE_ENV === "production" && existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("/{*splat}", (_request, response) => response.sendFile(path.join(distDir, "index.html")));
}

const server = app.listen(port, host, () => {
  console.log(`OpenBot is awake at http://${host}:${process.env.NODE_ENV === "production" ? port : 4310}`);
  if (host !== "127.0.0.1" && host !== "localhost") console.log(`Remote access is enabled. The private access key is stored at ${path.join(db.dataDir, "access.token")}`);
});

async function shutdown() {
  runner.stop();
  providerConnections.stop();
  await browser.close();
  server.close(() => { db.close(); process.exit(0); });
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
