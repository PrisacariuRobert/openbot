// Real BrowserManager and persistent Chromium against a disposable, simulated
// support/social portal. Not evidence of access to a commercial account.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { BrowserManager } from "../src/server/runtime.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-reference-browser-"));
const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
let browser = new BrowserManager(db, { headlessTeaching: true }), layout = 1, sends = 0;
const server = createServer((req, res) => {
  const route = new URL(req.url || "/", "http://fixture").pathname;
  res.setHeader("Cache-Control", "no-store");
  if (route === "/login" && req.method === "POST") {
    req.resume(); res.writeHead(303, { "set-cookie": "fixture-session=owner; HttpOnly; Path=/; Max-Age=600; SameSite=Lax", location: "/support" }); res.end(); return;
  }
  if (route === "/logout") { res.writeHead(303, { "set-cookie": "fixture-session=; HttpOnly; Path=/; Max-Age=0", location: "/support" }); res.end(); return; }
  if (route === "/send") { sends++; res.writeHead(403); res.end("This fixture must never send."); return; }
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (!req.headers.cookie?.includes("fixture-session=owner")) { res.end('<!doctype html><title>Owner sign-in required</title><h1>Sign in to this sample account</h1><form method="post" action="/login"><label for="password">Password</label><input type="password" id="password" name="password"><button id="login">Sign in</button></form>'); return; }
  if (route === "/inbox-list") {
    // A signed-in inbox whose messages mention signing in (a phishing subject,
    // a shared doc title): content must never read as a login wall.
    const rows = ["Action required: Pay your past due invoice — Sign in to review", "Mira shared a doc: Sign in sheet v3", "Your receipt", "Weekly digest", "Todoist reminder", "Notion update", "Calendar invite"].map((subject) => `<tr><td><span role="heading">${subject}</span></td></tr>`).join("");
    res.end(`<!doctype html><title>Sample inbox</title><h1>Inbox</h1><table>${rows}</table><input aria-label="Search mail"><button>Compose</button>`);
    return;
  }
  if (route === "/hop") {
    // A login-looking interstitial that forwards to signed-in content after a
    // beat (the LinkedIn shape): judging mid-redirect must never raise a wall.
    res.end('<!doctype html><title>Signing you in</title><meta http-equiv="refresh" content="1.2;url=/support"><h1>Sign in</h1><p>Checking your session…</p><button>Continue</button>');
    return;
  }
  res.end(`<!doctype html><title>${route === "/social" ? "Sample activity" : "Sample support"}</title><main><h1>${route === "/social" ? "Selected account activity" : "Support triage"}</h1><label for="filter">Find a topic</label><input id="filter" aria-label="Find a topic"><button type="button" id="preview">${layout === 1 ? "Preview" : "Preview selected topic"}</button><p id="result">${route === "/social" ? "Mira asked about dark mode. Prepare a reply for review only." : "Ticket 17: invoice export fails. Ticket 22: account invite delayed."}</p><a href="/support/17">Ticket 17 source</a><form action="/send" method="post"><button id="send">Send reply</button></form></main><script>document.querySelector('#preview').onclick=()=>document.querySelector('#result').textContent='Read-only results for '+document.querySelector('#filter').value;</script>`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
try {
  await browser.startTeaching("nova", "Selected support review", `${base}/support?code=private-callback#private-state`);
  assert.deepEqual(await browser.signInState("nova"), { siteOrigin: base, needsSignIn: true, evidence: "visible credential field" });
  await browser.type("nova", "#password", "fixture-password-must-not-be-recorded");
  await browser.click("nova", "#login");
  for (let n = 0; n < 20; n++) { if (JSON.stringify(await browser.snapshot("nova")).includes("Support triage")) break; await delay(50); }
  await browser.type("nova", "#filter", "private-customer-first@example.com");
  assert.equal((await browser.signInState("nova")).needsSignIn, false);
  await browser.click("nova", "#preview");
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Read-only results for private-customer-first/);
  await delay(100); // Let the async recorder binding finish before saving.
  const workflow = await browser.stopTeaching("nova");
  const recorded = JSON.stringify(db.getWorkflowRecord(workflow.id));
  assert.doesNotMatch(recorded, /fixture-password-must-not|private-customer-first|private-callback|private-state/);
  assert.match(recorded, /\{\{input_1\}\}/); assert.match(recorded, /\{\{secret\}\}/);
  const guide = readFileSync(path.join(db.workspacesDir, "nova", ".opencode", "skills", workflow.skillSlug, "SKILL.md"), "utf8");
  assert.match(guide, /different owner-supplied input/); assert.match(guide, /unexpected account/);
  // Teaching closed its visible context. Normal task mode must retain the same
  // bot's owner login, not silently switch to a separate empty browser profile.
  await browser.open("nova", `${base}/support`);
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Ticket 17/);
  await browser.type("nova", "#filter", "a different, held-out topic"); await browser.click("nova", "#preview");
  assert.match(JSON.stringify(await browser.snapshot("nova")), /held-out topic/);
  const reviewed = await browser.describeTarget("nova", "#preview");
  layout = 2; await browser.open("nova", `${base}/support`);
  await assert.rejects(browser.click("nova", "#preview", reviewed.fingerprint), /changed after review/);
  await browser.close(); browser = new BrowserManager(db, { headlessTeaching: true });
  await browser.open("nova", `${base}/social`); assert.match(JSON.stringify(await browser.snapshot("nova")), /Mira asked about dark mode/);
  await browser.open("pixel", `${base}/social`); assert.match(JSON.stringify(await browser.snapshot("pixel")), /Sign in to this sample account/);
  assert.equal((await browser.signInState("pixel")).needsSignIn, true);
  // A signed-in inbox whose message text mentions signing in is content, not
  // a gate: the host must not cry wolf on the phishing subject below.
  await browser.open("nova", `${base}/inbox-list`);
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Action required/);
  assert.equal((await browser.signInState("nova")).needsSignIn, false);
  // A login-looking hop that forwards into the signed-in app: the gate must
  // settle through the redirect instead of crying wolf mid-flight.
  await browser.open("nova", `${base}/hop`);
  assert.equal((await browser.signInState("nova")).needsSignIn, false);
  await browser.open("nova", `${base}/logout`); assert.match(JSON.stringify(await browser.snapshot("nova")), /Sign in to this sample account/);
  // A denied known-service URL is rejected before any navigation. Redirect-chain
  // classification has a separate deterministic unit test and is not a firewall.
  db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
  db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
  await assert.rejects(browser.open("nova", "https://mail.google.com/mail/u/0/"), /reading is turned off/);
  assert.equal(sends, 0);
  console.log("PASS: teaching-to-task login persistence, restart, bot-profile isolation, different-input read-only support flow, social source read, inbox message text never reads as a login wall, logout, changed-control rejection, denied-service navigation blocked and no recorded field secrets or accidental sends. Local fixtures, no model or real account used.");
} finally { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); db.close(); rmSync(root, { recursive: true, force: true }); }
