import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { skillAuthoringFixture } from "./skill-authoring-fixture.js";
import { GOOGLE_SCOPES } from "../google-workspace.js";
import type { ReplyMessage } from "../gmail-reply.js";

export async function customerWorkflowFixture(customer = "Cedar", lostResponses = false) {
  const source: ReplyMessage = { id: "source001", threadId: "thread001", internalDate: "1000", labelIds: ["INBOX"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: `${customer} <${customer.toLowerCase()}@example.com>` }, { name: "Reply-To", value: `${customer.toLowerCase()}-team@example.com` }, { name: "Subject", value: `${customer} review` }, { name: "Message-ID", value: `<${customer.toLowerCase()}@example.com>` }], body: { data: Buffer.from(`Can we review the ${customer} project tomorrow?`).toString("base64url") } } };
  const messages = [source], writes: Array<{ path: string; body: any }> = [];
  const failures: string[] = [];
  let event: any, sent: ReplyMessage | undefined;
  const api = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, "http://fixture"), method = request.method || "GET";
      const reply = (body: unknown) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(body)); };
      if (method === "POST") {
        let raw = ""; for await (const chunk of request) raw += String(chunk);
        const body = JSON.parse(raw); writes.push({ path: url.pathname, body });
        if (url.pathname.endsWith("/events")) {
          event = { ...body, status: "confirmed", htmlLink: `https://calendar.google.com/calendar/event?eid=${customer.toLowerCase()}` };
          if (lostResponses) { response.destroy(); return; }
          return reply(event);
        }
        if (url.pathname.endsWith("/messages/send")) {
          const mime = Buffer.from(body.raw, "base64url").toString(), split = mime.indexOf("\r\n\r\n");
          const headers = mime.slice(0, split).replace(/\r\n /g, " ").split("\r\n").map(line => ({ name: line.slice(0, line.indexOf(":")), value: line.slice(line.indexOf(":") + 1).trim() }));
          sent = { id: "sent001", threadId: body.threadId, labelIds: ["SENT"], payload: { mimeType: "text/plain", headers: [...headers, { name: "From", value: "owner@example.com" }], body: { data: Buffer.from(mime.slice(split + 4)).toString("base64url") } } };
          if (lostResponses) { response.destroy(); return; }
          return reply({ id: sent.id, threadId: sent.threadId });
        }
        throw new Error("Unexpected fixture write " + url.pathname);
      }
      if (url.pathname.endsWith("/messages/source001")) return reply(source);
      if (url.pathname.endsWith("/threads/thread001")) return reply({ id: "thread001", messages });
      if (url.pathname.endsWith("/messages/sent001")) return reply(sent);
      if (url.pathname.endsWith("/messages")) return reply({ messages: url.searchParams.get("q")?.includes("rfc822msgid:") ? sent ? [{ id: "sent001" }] : [] : [{ id: source.id }] });
      if (url.pathname.endsWith("/events")) return reply({ items: [] });
      if (event && url.pathname.endsWith("/events/" + event.id)) return reply(event);
      throw new Error("Unexpected fixture read " + url.pathname);
    } catch (error) { failures.push(String(error)); response.writeHead(500).end(JSON.stringify({ error: { message: "Fixture failure" } })); }
  });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
  const runtime = `#!${process.execPath}\n${readFileSync(new URL("./customer-runtime-fixture.cjs", import.meta.url), "utf8")}`;
  let fixture: Awaited<ReturnType<typeof skillAuthoringFixture>>;
  try {
    fixture = await skillAuthoringFixture({ runtime, preload: fileURLToPath(new URL("./google-fetch-fixture.mjs", import.meta.url)), environment: { OPENBOT_TEST_GOOGLE_URL: endpoint }, configure(db) {
      db.updateStudioSettings({ yoloMode: false });
      db.configureGoogleConnector({ clientId: "fixture" });
      db.completeGoogleConnector({ accessToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
      db.setBotConnectorAccess("nova", { canRead: true, canSend: true });
      db.setBotConnectorAccess("nova", { canRead: true, canSend: true }, "google-calendar");
    } });
  } catch (error) { api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve())); throw error; }
  const close = async () => {
    try { await fixture.close(); }
    finally { api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve())); }
  };
  let runId: string;
  try {
    const response = await fixture.post("/api/messages", { threadId: "bot-nova", body: `Handle the ${customer} review request`, targetBotIds: ["nova"] });
    assert.equal(response.status, 202);
    const { runs } = await response.json() as { runs: Array<{ id: string }> };
    runId = runs[0]!.id;
  } catch (error) { await close(); throw error; }
  const pending = (type: string) => fixture.until(() => {
    const run = fixture.db.getRun(runId);
    if (run && ["failed", "cancelled", "completed"].includes(run.status)) throw new Error(`Fixture task ${run.status} before ${type}: ${run.error}; transport: ${failures.join("; ")}`);
    return fixture.db.listApprovals().find(approval => approval.runId === runId && approval.status === "pending" && (fixture.db.getApprovalAction(approval.id) as { type?: string })?.type === type);
  });
  const preview = async (id: string) => (await fetch(`${fixture.base}/api/approvals/${id}/preview`)).json();
  async function approve(id: string) { const review = await preview(id); assert.equal(review.canApprove, true); return fixture.post(`/api/approvals/${id}/decide`, { decision: "approved", reviewFingerprint: review.reviewFingerprint }); }
  return { ...fixture, runId, writes, failures, pending, preview, approve, injectIncoming() { messages.push({ ...source, id: "incoming002", internalDate: "2000" }); }, sent: () => sent,
    close };
}
