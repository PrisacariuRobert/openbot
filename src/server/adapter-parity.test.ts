import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const bridgePath = fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url));
const bridgeSource = readFileSync(bridgePath, "utf8");
const workspaceSource = readFileSync(new URL("./workspace.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

type ListedTool = {
  name: string;
  inputSchema?: { properties?: Record<string, Record<string, unknown>>; required?: string[] };
};

function listBridgeTools(): ListedTool[] {
  const workspace = mkdtempSync(path.join(tmpdir(), "openbot-adapter-parity-"));
  const request = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const result = spawnSync(process.execPath, [bridgePath], {
    env: { OPENBOT_WORKSPACE: workspace },
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    timeout: 4_000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  const response = JSON.parse(result.stdout.trim().split("\n").pop() as string) as {
    result: { tools: ListedTool[] };
  };
  return response.result.tools;
}

test("MCP handoff and message_teammate expose shared file artifacts like the OpenCode adapter", () => {
  const listed = listBridgeTools();
  for (const name of ["handoff", "message_teammate"]) {
    const tool = listed.find((candidate) => candidate.name === name);
    assert.ok(tool, `MCP bridge must expose ${name}`);
    const artifacts = tool?.inputSchema?.properties?.artifacts as
      | { type?: string; maxItems?: number; items?: { properties?: Record<string, unknown> } }
      | undefined;
    assert.equal(artifacts?.type, "array", `${name} must accept an artifacts array`);
    assert.equal(artifacts?.maxItems, 6, `${name} artifacts must be bounded to 6 like the host`);
    assert.ok(artifacts?.items?.properties?.artifactId, `${name} artifacts must accept artifactId`);
    assert.ok(artifacts?.items?.properties?.path, `${name} artifacts must accept path`);
  }
  // OpenCode side keeps the same bound so neither adapter drifts.
  assert.match(workspaceSource, /handoff.*artifacts[\s\S]{0,400}\.max\(6\)/);
  assert.match(workspaceSource, /message_teammate.*artifacts[\s\S]{0,400}\.max\(6\)/);
});

test("MCP routine_update prompt bound matches the OpenCode adapter", () => {
  const listed = listBridgeTools();
  const tool = listed.find((candidate) => candidate.name === "routine_update");
  assert.ok(tool, "MCP bridge must expose routine_update");
  assert.equal(
    (tool?.inputSchema?.properties?.prompt as { maxLength?: number } | undefined)?.maxLength,
    10000,
    "routine_update prompt must be bounded to 10000 on both adapters",
  );
  assert.match(workspaceSource, /routine_update.*prompt: tool\.schema\.string\(\)\.max\(10000\)/);
});

test("every MCP bridge action is accepted by the shared host tool endpoint", () => {
  const actions = [...bridgeSource.matchAll(/action: "([a-z_]+)"/g)].map((match) => match[1]);
  assert.ok(actions.length > 40, "expected the full MCP action catalogue to be pinned");
  for (const action of new Set(actions)) {
    assert.ok(
      indexSource.includes(`"${action}"`),
      `MCP action ${action} must be accepted by the host internal-tool endpoint`,
    );
  }
});

test("every MCP bridge action is allowlisted for the Claude runtime", () => {
  const opencodeSource = readFileSync(new URL("./opencode.ts", import.meta.url), "utf8");
  const actions = [...bridgeSource.matchAll(/action: "([a-z_]+)"/g)].map((match) => match[1]);
  // Former known gaps (routine lifecycle, browser file upload) were closed
  // by allowlisting them with unchanged host enforcement; the positive pin
  // below fails if any bridge action loses its allowlist entry.
  const knownGaps = new Set<string>([]);
  for (const action of new Set(actions)) {
    if (action === "bash") continue; // local-only workspace tool, not an MCP host action
    if (knownGaps.has(action)) {
      assert.ok(
        !opencodeSource.includes(`mcp__openbot__${action}`),
        `known gap closed for ${action}: remove it from knownGaps and rely on the positive pin`,
      );
      continue;
    }
    assert.ok(
      opencodeSource.includes(`mcp__openbot__${action}`),
      `MCP action ${action} must be in the Claude runtime allowlist or Claude models cannot call it`,
    );
  }
});

test("Todoist correction tools exist in both adapters with the exact task id required", () => {
  const listed = listBridgeTools();
  for (const name of ["todoist_task_update", "todoist_task_complete"]) {
    const tool = listed.find((candidate) => candidate.name === name);
    assert.ok(tool, `MCP bridge must expose ${name}`);
    assert.deepEqual(tool?.inputSchema?.required, ["taskId"], `${name} must address one exact task id`);
  }
  assert.match(workspaceSource, /todoist_task_update/);
  assert.match(workspaceSource, /todoist_task_complete/);
});
