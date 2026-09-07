import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

const names = ["connected_tools", "connected_call", "community_skill_search", "community_skill_read", "memory_search"];

test("Claude's real stdio bridge forwards extension tools with host-bound credentials and surfaces host failures", { timeout: 15_000 }, async () => {
  const calls: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/api/internal/tools");
    assert.equal(request.headers["x-openbot-token"], "fixture-run-token");
    let raw = ""; for await (const chunk of request) raw += String(chunk);
    const input = JSON.parse(raw); calls.push(input);
    assert.equal(input.botId, "nova"); assert.equal(input.runId, "fixture-run");
    response.setHeader("content-type", "application/json");
    if (input.args.fail) response.writeHead(403).end(JSON.stringify({ error: "This tool is no longer shared." }));
    else response.end(JSON.stringify({ action: input.action, received: input.args, receiptUrl: "/api/extensions/receipts/fixture" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const child = spawn(process.execPath, [fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url))], {
    env: { PATH: process.env.PATH, OPENBOT_INTERNAL_URL: `http://127.0.0.1:${address.port}`, OPENBOT_INTERNAL_TOKEN: "fixture-run-token", OPENBOT_BOT_ID: "nova", OPENBOT_RUN_ID: "fixture-run" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, (value: any) => void>(); let sequence = 0;
  lines.on("line", (line) => { const message = JSON.parse(line); pending.get(message.id)?.(message.result); pending.delete(message.id); });
  const rpc = (method: string, params = {}): Promise<any> => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error("Bridge response timed out.")); }, 3_000);
    pending.set(id, (result) => { clearTimeout(timer); resolve(result); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  try {
    await rpc("initialize", { protocolVersion: "2025-03-26" });
    const listed = await rpc("tools/list");
    for (const name of names) {
      assert.ok(listed.tools.some((tool: { name: string }) => tool.name === name));
      const result = await rpc("tools/call", { name, arguments: { query: "Cedar" } });
      assert.equal(result.isError, false);
      assert.equal(JSON.parse(result.content[0].text).action, name);
      assert.ok(!JSON.stringify(result).includes("fixture-run-token"));
    }
    const denied = await rpc("tools/call", { name: "connected_call", arguments: { fail: true } });
    assert.equal(denied.isError, true); assert.match(denied.content[0].text, /no longer shared/);
    assert.equal(calls.length, 6);
  } finally { child.kill("SIGTERM"); await exited; lines.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
