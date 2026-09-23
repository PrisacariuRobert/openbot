import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BrowserManager, chromePath } from "./runtime.js";
import { browserApprovalReason } from "./safety.js";
import { OpenBotDatabase } from "./testing/database.js";

const PAGE = `<!doctype html><title>Disclosure fixture</title>
<nav><button id="projects" aria-expanded="false" aria-controls="projects-list">Toggle list of My Projects</button><ul id="projects-list" hidden><li>Inbox</li></ul></nav>
<button id="ghost" aria-expanded="false" aria-controls="missing-panel">Show more</button>
<button id="delete" aria-expanded="false" aria-controls="projects-list">Delete project</button>
<button id="pressed" aria-pressed="false" aria-expanded="false" aria-controls="projects-list">Favorites</button>
<form method="post"><button id="in-form" aria-expanded="false" aria-controls="projects-list">Details</button><input name="note"></form>
<div role="dialog"><button id="in-dialog" aria-expanded="false" aria-controls="projects-list">Advanced</button></div>
<button id="plain">Continue</button>`;

test("real browser: only a genuine collapsed show/hide control runs without review", { timeout: 120_000, skip: chromePath() ? false : "Chrome or Chromium is not installed" }, async () => {
  const server = createServer((_request, response) => { response.setHeader("content-type", "text/html"); response.end(PAGE); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = mkdtempSync(path.join(tmpdir(), "openbot-disclosure-"));
  const db = new OpenBotDatabase(root);
  const browser = new BrowserManager(db, { headlessTeaching: true });
  try {
    await browser.open("nova", `http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    const decision = async (id: string) => browserApprovalReason("click", `#${id}`, await browser.describeTarget("nova", `#${id}`));
    assert.equal(await decision("projects"), null);
    for (const id of ["ghost", "delete", "pressed", "in-form", "in-dialog", "plain"]) assert.ok(await decision(id), `#${id} must stay reviewed`);
    assert.equal(await decision("delete"), "This click may create an external or irreversible action.");
    assert.equal(await decision("plain"), "Review this browser control before it runs; it may change data or send information.", "a formless button's default type is not a submission");
  } finally {
    await browser.close().catch(() => {});
    server.close();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
