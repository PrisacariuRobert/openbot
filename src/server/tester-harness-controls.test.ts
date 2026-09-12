import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TesterBrowser } from "./tester-browser.js";

/** S5-H01 / S4-H02 / S5-H02: control-level regressions in the tester harness.
 * A normal ref click that opens a native confirm must return an actionable
 * awaiting-dialog result quickly (not stall to the MCP timeout); clearing an
 * input through its reference must actually change the field. */

const PAGE = `<!doctype html><html><head><title>controls fixture</title></head><body>
<textarea id="q" aria-label="Query">old draft text</textarea>
<button id="go" type="button">Go</button>
<script>
  document.getElementById("go").addEventListener("click", function () {
    if (confirm("Proceed?")) { document.title = "confirmed"; }
  });
</script>
</body></html>`;

function fixtureServer(): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end(PAGE); });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      resolve({ server, base: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function openFixture(tester: TesterBrowser, base: string): Promise<{ sessionId: string; snapshot: string }> {
  const session = await tester.createSession({ id: "controls", label: "controls" });
  await tester.open(base, session.sessionId);
  const snap = await tester.snapshot(session.sessionId);
  return { sessionId: session.sessionId, snapshot: snap.snapshot };
}

function refOf(snapshot: string, pattern: RegExp): string {
  const line = snapshot.split("\n").find((entry) => pattern.test(entry));
  assert.ok(line, `expected a snapshot line matching ${pattern} in:\n${snapshot}`);
  const ref = /\[ref:(\d+)\]/.exec(line!);
  assert.ok(ref, `expected a ref on line: ${line}`);
  return ref![1]!;
}

test("a ref click that opens a native dialog reports awaiting-dialog promptly", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-harness-dialog-"));
  const { server, base } = await fixtureServer();
  const tester = new TesterBrowser(root, base);
  try {
    const { sessionId, snapshot } = await openFixture(tester, base);
    const goRef = refOf(snapshot, /button: Go/);
    const started = Date.now();
    let failure: { code?: string; dialogId?: string; message?: string } | null = null;
    try { await tester.act({ kind: "click", ref: goRef, sessionId }); }
    catch (error) { failure = error as { code?: string; dialogId?: string; message?: string }; }
    assert.ok(failure, "the click must not report plain success while a dialog is open");
    assert.equal(failure!.code, "DIALOG_PENDING", `expected DIALOG_PENDING, got: ${JSON.stringify(failure)}`);
    assert.ok(Date.now() - started < 5_000, "the awaiting-dialog result must return quickly, not at the MCP timeout");
    const dialogs = tester.dialogs(sessionId);
    assert.ok(dialogs.some((dialog) => dialog.id === failure!.dialogId && dialog.type === "confirm"), "the pending dialog is listed for explicit resolution");
    await tester.resolveDialog(sessionId, failure!.dialogId!, false);
  } finally {
    await tester.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("clear by reference actually empties the field", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-harness-clear-"));
  const { server, base } = await fixtureServer();
  const tester = new TesterBrowser(root, base);
  try {
    const { sessionId, snapshot } = await openFixture(tester, base);
    const boxRef = refOf(snapshot, /textbox: Query/);
    await tester.act({ kind: "clear", ref: boxRef, sessionId });
    const after = (await tester.snapshot(sessionId)).snapshot;
    const line = after.split("\n").find((entry) => entry.includes("textbox: Query")) || "";
    assert.ok(!line.includes("old draft text"), `the field must be empty after clear, got: ${line}`);
  } finally {
    await tester.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
