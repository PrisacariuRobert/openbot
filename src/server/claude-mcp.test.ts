import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const bridgePath = fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url));

test("Claude bridge exposes tools while keeping file access inside the bot workspace", async () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "openbot-claude-workspace-"));
  const outside = mkdtempSync(path.join(tmpdir(), "openbot-claude-outside-"));
  writeFileSync(path.join(outside, "private.txt"), "outside", "utf8");
  symlinkSync(path.join(outside, "private.txt"), path.join(workspace, "shortcut.txt"));
  const child = spawn(process.execPath, [bridgePath], { env: { ...process.env, OPENBOT_WORKSPACE: workspace }, stdio: ["pipe", "pipe", "pipe"] });
  try {
    const responses = new Map<number, Record<string, unknown>>();
    let buffer = "";
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Claude MCP bridge did not answer.")), 4_000);
      child.stdout.on("data", (chunk) => {
        buffer += String(chunk);
        const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as Record<string, unknown>;
          responses.set(Number(message.id), message);
        }
        if (responses.size === 5) { clearTimeout(timer); resolve(); }
      });
      child.on("error", reject);
    });
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "workspace_write", arguments: { path: "notes/hello.txt", content: "hello" } } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "workspace_read", arguments: { path: "../private.txt" } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "workspace_read", arguments: { path: "shortcut.txt" } } },
      { jsonrpc: "2.0", id: 5, method: "tools/list", params: {} },
    ];
    child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`);
    await finished;
    assert.equal(readFileSync(path.join(workspace, "notes", "hello.txt"), "utf8"), "hello");
    assert.equal(((responses.get(2)?.result as { isError?: boolean })?.isError), false);
    assert.equal(((responses.get(3)?.result as { isError?: boolean })?.isError), true);
    assert.equal(((responses.get(4)?.result as { isError?: boolean })?.isError), true);
    const exposed = ((responses.get(5)?.result as { tools?: Array<{ name: string }> })?.tools || []).map((tool) => tool.name);
    assert.ok(exposed.includes("gmail_search"));
    assert.ok(exposed.includes("gmail_read"));
    assert.ok(exposed.includes("gmail_send"));
    assert.ok(exposed.includes("google_drive_search"));
    assert.ok(exposed.includes("google_drive_read"));
    assert.ok(exposed.includes("google_calendar_agenda"));
    assert.ok(exposed.includes("routine_create"));
    assert.ok(exposed.includes("mac_list"));
    assert.ok(exposed.includes("mac_read"));
    assert.ok(exposed.includes("mac_organize"));
    assert.ok(exposed.includes("mac_apps_list"));
    assert.ok(exposed.includes("mac_app_inspect"));
    assert.ok(exposed.includes("mac_app_click"));
    assert.ok(exposed.includes("code_projects"));
    assert.ok(exposed.includes("code_search"));
    assert.ok(exposed.includes("code_read"));
    assert.ok(exposed.includes("code_replace"));
    assert.ok(exposed.includes("code_run"));
  } finally {
    child.kill("SIGTERM");
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
