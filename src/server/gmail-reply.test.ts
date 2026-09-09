import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareGmailReply, rawReply, replyDeliveryId, gmailReplyMatches, type ReplyMessage } from "./gmail-reply.js";
import { gmailReplyInputSchema } from "../shared/gmail-reply.js";
import { GoogleWorkspaceConnector, GOOGLE_SCOPES, buildRawEmail } from "./google-workspace.js";
import { OpenBotDatabase } from "./testing/database.js";
import { ApprovedConnectorDispatch, ApprovedConnectorOutcomeUncertainError, ApprovalReviewChangedError } from "./approval-review-binding.js";
import { approvalPreview } from "../shared/approval-preview.js";
import { prepareWorkspace } from "./workspace.js";
import { toolAvailability } from "./tool-availability.js";

const source: ReplyMessage = { id: "message001", threadId: "thread001", internalDate: "1000", labelIds: ["INBOX", "UNREAD"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Customer <customer@example.com>" }, { name: "Reply-To", value: "support@example.com" }, { name: "Subject", value: "Project review" }, { name: "Message-ID", value: "<original@example.com>" }], body: { data: Buffer.from("Can we review the project?").toString("base64url") } } };
const body = "The project review is ready. Here is the confirmed meeting link.";
const review = prepareGmailReply(source, [source], body, "owner@example.com");
const deliveryId = replyDeliveryId("approval-fixture");
function sentMessage(raw: string): ReplyMessage {
  const decoded = Buffer.from(raw, "base64url").toString("utf8"), boundary = decoded.indexOf("\r\n\r\n");
  const headers = decoded.slice(0, boundary).replace(/\r\n /g, " ").split("\r\n").map(line => ({ name: line.slice(0, line.indexOf(":")), value: line.slice(line.indexOf(":") + 1).trim() }));
  return { id: "sent001", threadId: "thread001", labelIds: ["SENT"], payload: { mimeType: "text/plain", headers: [...headers, { name: "From", value: "owner@example.com" }], body: { data: Buffer.from(decoded.slice(boundary + 4)).toString("base64url") } } };
}

test("reply preparation binds the actual Reply-To, subject and thread; payload cannot choose recipients", () => {
  assert.equal(review.to, "support@example.com");
  assert.equal(review.inReplyTo, "<original@example.com>");
  assert.equal(review.subject, "Project review");
  assert.throws(() => gmailReplyInputSchema.parse({ messageId: source.id, body, to: "other@example.com" }));
  const raw = rawReply(buildRawEmail(review), review, deliveryId);
  assert.match(Buffer.from(raw, "base64url").toString(), /In-Reply-To: <original@example.com>\r\nReferences: <original@example.com>/);
  assert.equal(gmailReplyMatches(review, deliveryId, sentMessage(raw)), true);
  assert.equal(replyDeliveryId("approval-fixture"), deliveryId);
  assert.notEqual(replyDeliveryId("another-approval"), deliveryId);
  for (const name of ["Reply-To", "Subject", "Message-ID"]) {
    const changed = structuredClone(source); changed.payload!.headers!.find(header => header.name === name)!.value = "bad\r\nBcc: stranger@example.com";
    assert.throws(() => prepareGmailReply(changed, [changed], body, "owner@example.com"));
  }
  const duplicate = structuredClone(source); duplicate.payload!.headers!.push({ name: "Reply-To", value: "other@example.com" });
  assert.throws(() => prepareGmailReply(duplicate, [duplicate], body, "owner@example.com"), /ambiguous/);
});

test("stale, drafted, sent, ambiguous and malformed conversations cannot be replied to blindly", () => {
  for (const changed of [
    { id: "new-message", internalDate: "2000" }, { labelIds: ["DRAFT"] }, { labelIds: ["SENT"] },
    { labelIds: undefined }, { internalDate: "unknown" }, { threadId: "other-thread" }, { id: "same-time" },
  ]) assert.throws(() => prepareGmailReply(source, [source, { ...source, ...changed }], body, "owner@example.com"));
  assert.throws(() => prepareGmailReply(source, [source], body, "support@example.com"), /own account/);
  assert.equal(prepareGmailReply(source, [{ ...source, labelIds: ["INBOX"] }], body, "owner@example.com").threadRevision, review.threadRevision, "Marking as read does not invalidate an otherwise unchanged thread");
});

test("sent-copy proof rejects a different body, thread, recipient, sender or missing SENT label", () => {
  const sent = sentMessage(rawReply(buildRawEmail(review), review, deliveryId));
  for (const key of ["To", "From", "Subject", "Message-ID", "In-Reply-To", "Cc", "Bcc"]) {
    const changed = structuredClone(sent); changed.payload!.headers = changed.payload!.headers!.filter(header => header.name !== key);
    changed.payload!.headers.push({ name: key, value: "different@example.com" });
    assert.equal(gmailReplyMatches(review, deliveryId, changed), false, key);
  }
  assert.equal(gmailReplyMatches(review, deliveryId, { ...sent, threadId: "wrong-thread" }), false);
  assert.equal(gmailReplyMatches(review, deliveryId, { ...sent, labelIds: [] }), false);
  assert.equal(gmailReplyMatches(review, deliveryId, { ...sent, payload: { ...sent.payload, body: { data: Buffer.from("Wrong body").toString("base64url") } } }), false);
});

async function fixture(scenario: string, work: (connector: GoogleWorkspaceConnector, db: OpenBotDatabase, requests: Array<{ method: string; url: string }>) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-reply-test-")), db = new OpenBotDatabase(root);
  try {
    db.configureGoogleConnector({ clientId: "fixture" });
    db.completeGoogleConnector({ accessToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    const requests: Array<{ method: string; url: string }> = []; let sent: ReplyMessage | null = null;
    const transport: typeof fetch = async (input, init) => {
      const url = String(input), method = init?.method || "GET"; requests.push({ method, url });
      if (url.includes("/threads/")) return Response.json({ id: source.threadId, messages: scenario === "stale" ? [source, { ...source, id: "later-message", internalDate: "2000" }] : [source] });
      if (url.includes("/messages/message001")) return Response.json(source);
      if (method === "POST") {
        const payload = JSON.parse(String(init?.body)); assert.equal(payload.threadId, review.threadId);
        sent = sentMessage(payload.raw);
        if (scenario === "account-change") db.completeGoogleConnector({ accessToken: "new-fixture", expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "replacement@example.com" });
        if (scenario !== "success") throw new Error("Response lost after acceptance");
        return Response.json({ id: sent.id, threadId: sent.threadId });
      }
      if (url.includes("/messages?")) {
        assert.equal(new URL(url).searchParams.get("q"), `in:sent rfc822msgid:${deliveryId.slice(1, -1)}`);
        return Response.json({ messages: scenario === "not-found" ? [] : scenario === "duplicate" ? [{ id: "sent001" }, { id: "sent002" }] : [{ id: "sent001" }] });
      }
      if (url.includes("/messages/sent001")) return Response.json(scenario === "mismatch" ? { ...sent, threadId: "wrong-thread" } : sent);
      throw new Error(`Unexpected fixture request: ${url}`);
    };
    const dispatch = new ApprovedConnectorDispatch(transport), connector = new GoogleWorkspaceConnector(db, "http://127.0.0.1/callback", dispatch.fetch);
    await dispatch.run(() => true, () => work(connector, db, requests));
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
}

for (const scenario of ["success", "lost", "not-found", "duplicate", "mismatch", "stale", "account-change"]) {
  test(`reply ${scenario}: checked destination or explicit uncertainty, never a blind resend`, async () => {
    await fixture(scenario, async (connector, _db, requests) => {
      if (["success", "lost"].includes(scenario)) {
        const result = await connector.reply(review, "approval-fixture");
        assert.equal(result.id, "sent001"); assert.equal(result.recovered, scenario === "lost");
      } else await assert.rejects(connector.reply(review, "approval-fixture"), scenario === "account-change" ? ApprovalReviewChangedError : scenario === "stale" ? /latest received/ : ApprovedConnectorOutcomeUncertainError);
      assert.equal(requests.filter(request => request.method === "POST").length, scenario === "stale" ? 0 : 1);
      if (scenario === "account-change") assert.equal(requests.length, 3, "Do not inspect the replacement account");
    });
  });
}

test("reply review and runtime exposure require an identified account and read plus send access", async () => {
  await fixture("success", async (_connector, db) => {
    const approval = { id: "review", runId: "run", botId: "nova", botName: "Nova", kind: "external" as const, reason: "Reply", actionLabel: "Reply", status: "pending" as const, createdAt: "2026-09-08", decidedAt: null };
    const run = { id: "run", botId: "nova", prompt: "Reply to the customer" }, action = { type: "gmail_reply", botId: "nova", args: review };
    const preview = approvalPreview(approval, run, action, review.account);
    assert.equal(preview.canApprove, true);
    assert.equal(preview.fields.find(field => field.label === "Reply to")?.value, "support@example.com");
    assert.equal(preview.fields.find(field => field.label === "Your reply")?.value, body);
    assert.equal(approvalPreview(approval, run, action, "other@example.com").canApprove, false);
    db.setBotConnectorAccess("nova", { canRead: false, canSend: true });
    assert.equal(toolAvailability(db, db.getBot("nova")!).gmail_reply, false);
    db.setBotConnectorAccess("nova", { canRead: true, canSend: true });
    assert.equal(toolAvailability(db, db.getBot("nova")!).gmail_reply, true);
    assert.equal(toolAvailability(db, db.getBot("nova")!, true).gmail_reply, false);
    prepareWorkspace(db, db.getBot("nova")!);
  });
});
