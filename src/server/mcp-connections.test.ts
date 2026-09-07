import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startMcpFixture } from "../../scripts/fixtures/mcp-service.js";
import { OpenBotDatabase } from "./testing/database.js";
import { McpConnections, McpUncertainError } from "./mcp-connections.js";
import { extensionURL } from "./extension-network.js";

async function setup(timeout = 2_500) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mcp-test-")), db = new OpenBotDatabase(root);
  const fixture = await startMcpFixture(), service = new McpConnections(db, timeout);
  const connection = service.create({ name: "Project tools", url: fixture.url, token: "fixture-private-token", allowLoopback: true });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Read the project", status: "running" });
  const input = { connectionId: connection.id, tool: "read_project", arguments: { project: "Cedar" } };
  return { root, db, fixture, service, connection, run, input, close: async () => { await fixture.close(); db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("custom MCP rejects unsafe endpoints and requires explicit local opt-in", () => {
  for (const url of ["http://example.com/mcp", "https://127.0.0.1/mcp", "https://10.0.0.1/mcp", "https://example.com/mcp?key=secret", "https://user:secret@example.com/mcp", "file:///etc/passwd", "https://example.local/mcp"]) assert.throws(() => extensionURL(url));
  assert.throws(() => extensionURL("http://127.0.0.1:1234/mcp"));
  assert.equal(extensionURL("http://127.0.0.1:1234/mcp", true).port, "1234");
});

test("MCP discovery is real but grants nothing; tokens stay encrypted and redacted", async () => {
  const f = await setup();
  try {
    const discovered = await f.service.discover(f.connection.id);
    assert.equal(discovered.tools.length, 2); assert.equal(discovered.lastUsedAt, null);
    assert.deepEqual(f.service.toolsFor("nova"), []);
    assert.throws(() => f.service.prepare("nova", f.input), /not been shared/);
    assert.ok(!JSON.stringify(f.service.list()).includes("fixture-private-token"));
    f.service.configure(f.connection.id, "nova", { read_project: "read" });
    assert.equal(f.service.search("nova", "project service Project Cedar").tools.length, 1);
    assert.equal(f.service.search("nova", "nonsense unmatched words").matchedQuery, false);
    assert.equal(f.service.search("nova", "nonsense unmatched words").tools.length, 1);
    const result = await f.service.call("nova", f.run.id, f.input);
    assert.equal(f.db.extensionRecord<{ tool: string }>("mcp-receipt", result.id)?.tool, "read_project");
    assert.match(result.text, /CEDAR-42/); assert.ok(!result.text.includes("fixture-private-token"));
    assert.equal(f.fixture.state.reads, 1); assert.ok(f.service.list()[0]!.lastUsedAt);
    assert.ok(!readFileSync(path.join(f.db.dataDir, "openbot.sqlite-wal")).includes(Buffer.from("fixture-private-token")));
    assert.throws(() => f.service.prepare("pixel", f.input), /not been shared/);
  } finally { await f.close(); }
});

test("invalid MCP arguments are rejected before reaching the service", async () => {
  const f = await setup();
  try {
    await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { read_project: "read" });
    await assert.rejects(f.service.call("nova", f.run.id, { ...f.input, arguments: { project: 42 } }), /No tool call was submitted/);
    assert.equal(f.fixture.state.calls.length, 0);
  } finally { await f.close(); }
});

test("prototype-named tools do not acquire implicit grants", async () => {
  const f = await setup();
  try {
    const checked = await f.service.discover(f.connection.id);
    const stored = f.db.extensionRecord<Record<string, unknown>>("mcp", checked.id)!;
    stored.tools = checked.tools.map((tool) => ({ ...tool, name: "constructor" }));
    stored.grants = { nova: {} };
    f.db.saveExtensionRecord("mcp", checked.id, stored);
    assert.deepEqual(f.service.toolsFor("nova"), []);
    assert.throws(() => f.service.prepare("nova", { ...f.input, tool: "constructor" }), /not been shared/);
  } finally { await f.close(); }
});

test("changed tool definitions fail closed and discovery revokes stale grants", async () => {
  const f = await setup();
  try {
    await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { read_project: "read" });
    f.fixture.state.changed = true;
    await assert.rejects(f.service.call("nova", f.run.id, f.input), /No tool call was submitted/);
    assert.equal(f.fixture.state.reads, 0);
    await f.service.discover(f.connection.id); assert.deepEqual(f.service.toolsFor("nova"), []);
  } finally { await f.close(); }
});

test("write calls require approval regardless of readOnlyHint and old approvals cannot survive revocation", async () => {
  const f = await setup();
  try {
    await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { save_note: "ask" });
    const input = { ...f.input, tool: "save_note", arguments: { text: "Reviewed note" } }, prepared = f.service.prepare("nova", input);
    assert.equal(prepared.approvalRequired, true);
    await assert.rejects(f.service.call("nova", f.run.id, input), /approval/); assert.equal(f.fixture.state.writes, 0);
    f.service.configure(f.connection.id, "nova", {});
    f.service.configure(f.connection.id, "nova", { save_note: "ask" });
    await assert.rejects(f.service.call("nova", f.run.id, input, prepared), /changed while waiting/);
    assert.equal(f.fixture.state.writes, 0);
    const result = await f.service.call("nova", f.run.id, input, f.service.prepare("nova", input));
    assert.equal(result.isError, false); assert.equal(f.fixture.state.writes, 1);
  } finally { await f.close(); }
});

test("lost write responses remain uncertain and are never retried by the transport", async () => {
  const f = await setup();
  try {
    await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { save_note: "ask" });
    const input = { ...f.input, tool: "save_note", arguments: { text: "Only once" } };
    f.fixture.state.dropWriteResponse = true;
    await assert.rejects(f.service.call("nova", f.run.id, input, f.service.prepare("nova", input)), McpUncertainError);
    assert.equal(f.fixture.state.writes, 1);
  } finally { await f.close(); }
});

test("cancelled runs and revoked grants interrupt in-flight reads", async () => {
  for (const change of ["cancel", "revoke"] as const) {
    const f = await setup();
    try {
      await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { read_project: "read" });
      f.fixture.state.delayMs = 500;
      const pending = f.service.call("nova", f.run.id, f.input);
      const timer = setTimeout(() => change === "cancel" ? f.db.updateRun(f.run.id, { status: "cancelled" }) : f.service.configure(f.connection.id, "nova", {}), 70);
      await assert.rejects(pending); clearTimeout(timer);
    } finally { await f.close(); }
  }
});

test("auth failure, oversized response, and deadline are not reported as success", async () => {
  const f = await setup(500);
  try {
    await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { read_project: "read" });
    f.fixture.state.unauthorized = true;
    await assert.rejects(f.service.discover(f.connection.id), /token|sign-in/);
    f.fixture.state.unauthorized = false; f.fixture.state.oversized = true;
    await assert.rejects(f.service.call("nova", f.run.id, f.input));
    f.fixture.state.oversized = false; f.fixture.state.delayMs = 900;
    await assert.rejects(f.service.call("nova", f.run.id, f.input));
  } finally { await f.close(); }
});

test("connector configuration and grants survive database reopen", async () => {
  const f = await setup();
  try {
    await f.service.discover(f.connection.id); f.service.configure(f.connection.id, "nova", { read_project: "read" });
    const reopened = new OpenBotDatabase(f.root);
    try { assert.equal(new McpConnections(reopened).toolsFor("nova").length, 1); }
    finally { reopened.close(); }
  } finally { await f.close(); }
});
