import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./testing/database";
import { BrowserSignIns } from "./browser-sign-in";
import { approvalPreview } from "../shared/approval-preview";
import { signInOrigin } from "../shared/browser-sign-in";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-sign-in-"));
  const db = new OpenBotDatabase(root);
  const handoffs = new BrowserSignIns(db);
  const run = db.createRun({ botId: "nova", threadId: db.getBot("nova")!.threadId, prompt: "Read ticket 17, compare the invoice, and prepare a local reply. Do not send it.", status: "running" });
  return { root, db, handoffs, run, close() { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("generic website handoff saves only its origin and the original task, not login secrets", () => {
  const { db, handoffs, run, close } = fixture();
  try {
    const a = handoffs.request("nova", run.id, "https://support.example.test/login?code=PRIVATE_CODE#PRIVATE_STATE");
    assert.equal(db.getRun(run.id)?.status, "awaiting_approval");
    assert.equal(db.getRun(run.id)?.prompt, run.prompt);
    assert.equal(handoffs.request("nova", run.id, "https://different.test" ).id, a.id);
    assert.equal(db.pendingNotifications().filter((notification) => notification.kind === "approval").length, 1);
    assert.match(db.pendingNotifications().find((notification) => notification.kind === "approval")!.title, /needs your sign-in/);
    const action = db.getApprovalAction(a.id);
    assert.deepEqual(action, { type: "browser_sign_in", botId: "nova", args: { siteOrigin: "https://support.example.test" } });
    const preview = approvalPreview(a, run, action);
    assert.equal(preview.canApprove, true);
    assert.equal(preview.browserSignIn?.siteOrigin, "https://support.example.test");
    assert.doesNotMatch(JSON.stringify([preview, db.listMessages(run.threadId), action]), /PRIVATE_CODE|PRIVATE_STATE/);
    assert.throws(() => handoffs.assertAgentAccess("nova"), /waiting/);
    assert.doesNotThrow(() => handoffs.assertAgentAccess("pixel"));
    const other = db.createRun({ botId: "nova", threadId: run.threadId, prompt: "Other task", status: "running" });
    assert.throws(() => handoffs.request("nova", other.id, "https://another.test"), /already waiting/);
    assert.equal(handoffs.continue(a.id)?.status, "approved");
    assert.equal(db.getRun(run.id)?.status, "queued");
    assert.match(db.getRun(run.id)!.prompt, /Read ticket 17/);
    assert.match(db.getRun(run.id)!.prompt, /NOT proof of authentication/);
    assert.match(db.getRun(run.id)!.prompt, /Do not repeat completed actions/);
    assert.equal(db.getApprovedAction(a.id), null, "Sign-in is not journalled as an external write");
    assert.throws(() => handoffs.details(a.id), /no longer waiting/);
    assert.throws(() => handoffs.continue(a.id), /no longer waiting/);
    assert.doesNotThrow(() => handoffs.assertAgentAccess("nova"));
  } finally { close(); }
});

test("pending sign-in is visible to a reopened database; decline releases the browser and cancels the task", () => {
  const { root, db, handoffs, run, close } = fixture();
  let reopened: OpenBotDatabase | undefined;
  try {
    const approval = handoffs.request("nova", run.id, "https://calendar.example.test");
    reopened = new OpenBotDatabase(root);
    const restarted = new BrowserSignIns(reopened);
    assert.equal(restarted.pending("nova")?.id, approval.id);
    assert.equal(restarted.details(approval.id).siteOrigin, "https://calendar.example.test");
    db.decideApproval(approval.id, "denied");
    assert.equal(db.getRun(run.id)?.status, "cancelled");
    assert.equal(restarted.pending("nova"), undefined);
    assert.throws(() => restarted.continue(approval.id), /no longer waiting/);
  } finally { reopened?.close(); close(); }
});

test("browser and known-service denials cannot be bypassed by sign-in", () => {
  const { db, handoffs, run, close } = fixture();
  try {
    db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
    db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
    assert.throws(() => handoffs.request("nova", run.id, "https://mail.google.com"), /reading is turned off/);
    const a = handoffs.request("nova", run.id, "https://support.example.test");
    db.updateBot("nova", { browserEnabled: false });
    assert.throws(() => handoffs.continue(a.id), /turned off/);
    assert.equal(db.getRun(run.id)?.status, "awaiting_approval");
  } finally { close(); }
});

test("sign-in origins reject embedded credentials, plaintext public sites and non-web schemes", () => {
  assert.equal(signInOrigin("https://app.example.test/secret/path?code=secret#token"), "https://app.example.test");
  for (const value of ["https://owner:secret@example.test", "http://example.test", "file:///tmp/private", "javascript:alert(1)", "not a URL"]) assert.throws(() => signInOrigin(value));
  assert.equal(signInOrigin("http://127.0.0.1:8234/login"), "http://127.0.0.1:8234");
});

test("profile operations are serialized, including after a failed operation", async () => {
  const { handoffs, close } = fixture();
  try {
    const steps: string[] = [];
    const a = handoffs.withProfile("nova", async () => { steps.push("owner starts"); await Promise.resolve(); steps.push("owner ends"); throw new Error("fixture"); });
    const b = handoffs.withProfile("nova", async () => { steps.push("next starts"); });
    await assert.rejects(a); await b;
    assert.deepEqual(steps, ["owner starts", "owner ends", "next starts"]);
  } finally { close(); }
});

test("both provider harnesses expose the same credential-free sign-in tool", () => {
  for (const file of ["workspace.ts", "claude-mcp.mjs", "tool-availability.ts", "opencode.ts"]) assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), /browser_request_sign_in/);
});
