import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { McpConnections } from "./mcp-connections.js";

const HOME = process.env.HOME!;
process.env.HOME = "/private-fixture-home";

async function stdioSetup() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mcp-stdio-")), db = new OpenBotDatabase(root);
  const service = new McpConnections(db, 4_000);
  const connection = service.create({
    name: "Stdio fixture",
    transport: "stdio",
    command: process.execPath,
    args: [path.resolve("scripts/fixtures/mcp-stdio.mjs")],
    env: { FIXTURE_KEY: "fixture-owner-value" },
  });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Read the project", status: "running" });
  return { root, db, service, connection, run, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("stdio MCP servers are discovered, granted per bot and called through the reviewed contract", async () => {
  const f = await stdioSetup();
  try {
    for (const bad of [
      { name: "shell metacharacters", command: "sh; echo hi", args: [], env: {} },
      { name: "newline argument", command: "node", args: ["-e", "one\ntwo"], env: {} },
      { name: "bad env key", command: "node", args: [], env: { "lower UPPER": "x" } },
    ]) {
      assert.throws(() => f.service.create({ transport: "stdio", ...bad } as Record<string, unknown>));
    }
    const discovered = await f.service.discover(f.connection.id);
    assert.equal(discovered.tools.length, 2);
    assert.deepEqual(f.service.toolsFor("nova"), []);
    f.service.configure(f.connection.id, "nova", { read_project: "read", echo_env: "read" });
    f.service.configure(f.connection.id, "pixel", {});
    assert.throws(() => f.service.prepare("pixel", { connectionId: f.connection.id, tool: "read_project", arguments: {} }), /not been shared/);
    const result = await f.service.call("nova", f.run.id, { connectionId: f.connection.id, tool: "read_project", arguments: { project: "Cedar" } });
    assert.match(result.text, /CEDAR-42 \(stdio\)/);
    const safeCall = await f.service.call("nova", f.run.id, { connectionId: f.connection.id, tool: "echo_env", arguments: { key: "HOME" } });
    assert.match(safeCall.text, /seen:HOME|missing/);
    await assert.rejects(f.service.call("nova", f.run.id, { connectionId: f.connection.id, tool: "echo_env", arguments: { key: 42 } }), /No tool call was submitted/i);
    assert.match(result.endpoint, /stdio:[^\n]*node/);
  } finally { f.close(); process.env.HOME = HOME; }
});
