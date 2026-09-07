// Opt-in Spark acceptance: full OpenBot HTTP API -> real model/runtime ->
// scoped tool gateway -> actual MCP HTTP fixture. Never uses the owner's data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { startMcpFixture } from "./fixtures/mcp-service.js";
import type { AppState, Run } from "../src/shared/types.js";
import type { CommunitySkill, McpConnection } from "../src/shared/extensions.js";

const model = process.env.OPENBOT_BENCHMARK_MODEL;
const documentMethod = process.env.OPENBOT_BENCHMARK_MODE === "bundled-documents";
const bundled = process.env.OPENBOT_BENCHMARK_MODE === "bundled" || documentMethod;
assert.equal(model, "opencode/muse-spark-1.3-contributor-free", "Explicitly select the requested free Spark 1.3 model. No fallback is used.");
const root = mkdtempSync(path.join(tmpdir(), "openbot-extension-acceptance-"));
const db = new OpenBotDatabase(root);
db.chooseInitialProvider("local-opencode", model);
db.updateBot("nova", { computerEnabled: false, browserEnabled: false, weeklyTokenBudget: 100_000 });
const dataDir = db.dataDir;
db.close();
const reservation = createServer();
await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const address = reservation.address(); assert.ok(address && typeof address !== "string");
const port = address.port; await new Promise<void>((resolve) => reservation.close(() => resolve()));
const base = `http://127.0.0.1:${port}`, fixture = await startMcpFixture();
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_APP_URL: base, OPENBOT_HOST: "127.0.0.1", OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", (data) => { log = (log + data).slice(-8_000); });
child.stderr.on("data", (data) => { log = (log + data).slice(-8_000); });
async function api<T>(route: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(base + route, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
  const result = await response.json(); assert.ok(response.ok, result.error || `HTTP ${response.status}`); return result;
}
let success = false;
try {
  for (let i = 0; i < 60; i++) { try { await api("/api/healthz"); break; } catch { if (i === 59) throw new Error(log); await delay(200); } }
  if (!bundled) {
  const connection = await api<McpConnection>("/api/extensions/mcp", { name: "Cedar project service", url: fixture.url, token: "fixture-private-token", allowLoopback: true });
  await api(`/api/extensions/mcp/${connection.id}/check`, {});
  await api(`/api/extensions/mcp/${connection.id}/access`, { botId: "nova", grants: { read_project: "read" } }, "PATCH");
  const bundle = { source: "OpenBot synthetic acceptance skill", files: {
    "SKILL.md": "---\nname: project-brief\ndescription: Prepare an evidence-based project brief\nlicense: MIT\n---\nUse the current project connector, not assumptions. Load [format](references/format.md). Look up writing preferences with memory_search. Save the result to brief.md and link it. Never send anything.",
    "references/format.md": "Use headings: Owner, Review time, Blocker, Source. State the exact source reference. Include a final line: Prepared from a current project service read.",
  } };
  const preview = await api<CommunitySkill>("/api/extensions/skills/inspect", bundle);
  await api("/api/extensions/skills", { bundle, digest: preview.digest, botIds: ["nova"] });
  await api("/api/extensions/memory/nova", { key: "writing", content: "Keep project briefs concise; do not invent a deadline for missing supplier estimates." }, "PATCH");
  } else {
    const library = await api<{ skills: CommunitySkill[]; connections: McpConnection[] }>("/api/extensions");
    assert.equal(library.skills.length, 7); assert.equal(library.connections.length, 0);
    assert.ok(library.skills.every((skill) => skill.bundled && skill.botIds.includes("nova")));
  }
  const started = Date.now();
  const submitted = await api<{ runs: Run[] }>("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: documentMethod
    ? 'Extract an action register from this project policy excerpt and save it as brief.md. Preserve source clauses and unresolved owners/dates. Do not send or publish anything. Document: Lantern beta policy v2, 5 September 2026. [C1] Mira must deliver the access review by 8 September 2026. [C2] A public launch may be proposed after security approval; this is not a release commitment. [C3] The beta must remain private until that decision is made. [C4] Accessibility labels should be reviewed; an owner and deadline have not been assigned. [C5] Appendix B contains additional acceptance criteria, but is not included in this excerpt. Distinguish obligations, recommendations and optional proposals, and identify missing coverage.'
    : bundled
    ? 'Turn these meeting notes into a clear decision and action register. Save it as brief.md and give me one short answer with the file link. Notes (Project Lantern, 5 September 2026): [N1] Mira: "I will send the mockups on 8 September 2026." [N2] Leo: "We could launch on 12 September, if security approves." [N3] Decision: keep the beta private. [N4] Someone needs to check the accessibility labels; no owner or date was agreed. [N5] Supplier estimate is still missing. Preserve source references and unresolved items. Do not send anything or create external tasks.'
    : "Use my reviewed project-brief community skill to prepare a brief for Project Cedar from the connected project service. Follow its format and my saved writing preferences. Save brief.md and give me one short answer with its file link. Do not send messages or change the project service." });
  const id = submitted.runs[0]!.id;
  let state: AppState | undefined;
  for (let i = 0; i < 240; i++) {
    await delay(1_000); state = await api<AppState>("/api/state?threadId=bot-nova");
    const run = state.runs.find((run) => run.id === id)!;
    if (["completed", "failed", "cancelled", "awaiting_approval"].includes(run.status)) break;
  }
  const run = state!.runs.find((run) => run.id === id)!;
  writeFileSync(path.join(root, "run.json"), JSON.stringify(run, null, 2));
  assert.equal(run.status, "completed", run.error || run.approvalReason || run.summary || "Task did not finish.");
  const brief = readFileSync(path.join(dataDir, "workspaces/nova/brief.md"), "utf8");
  if (bundled) {
    for (const phrase of [/Mira/, /(?:8 September|September 8|2026-09-08)/, /private/i, /accessibility/i, /(?:not assigned|unassigned|not set|unresolved|unspecified|TBD)/i, documentMethod ? /C1/ : /N1/, documentMethod ? /C4/ : /N4/, /(?:conditional|proposal|tentative|not.*decision)/i]) assert.match(brief, phrase);
    if (documentMethod) for (const phrase of [/Appendix B/, /(?:missing|not included|unavailable)/i, /recommend/i]) assert.match(brief, phrase);
    const workspace = path.join(dataDir, "workspaces/nova");
    assert.match(readFileSync(path.join(workspace, "AGENTS.md"), "utf8"), /meeting-action-items/);
    // Check the provider's real recorded tool stream, not only the final prose.
    const method = documentMethod ? "document-to-action-items" : "meeting-action-items";
    assert.ok(run.activities.some((activity) => activity.label === "Using a reusable method" && activity.detail?.includes(`"skill":"${method}"`)), "The host must confirm the matching built-in method was actually read.");
    assert.equal(fixture.state.reads, 0);
  } else {
    for (const phrase of [/Mira/, /Tuesday/, /14:00/, /missing supplier estimate/i, /CEDAR-42/, /Prepared from a current project service read/]) assert.match(brief, phrase);
    assert.ok(fixture.state.reads > 0);
  }
  assert.equal(fixture.state.writes, 0);
  assert.ok(!brief.includes("fixture-private-token"));
  for (let i = 0; i < 30 && !state!.messages.some((message) => message.runId === id); i++) { await delay(100); state = await api<AppState>("/api/state?threadId=bot-nova"); }
  assert.equal(state!.messages.filter((message) => message.runId === id && message.senderType === "bot").length, 1);
  const receipts = run.activities;
  writeFileSync(path.join(root, "evidence.json"), JSON.stringify({ model, bundled, elapsedMs: Date.now() - started, fixture: fixture.state, receipts, brief, run }, null, 2));
  success = true;
  console.log(JSON.stringify({ passed: true, model, evidence: root, elapsedMs: Date.now() - started, reads: fixture.state.reads, writes: fixture.state.writes }));
} finally {
  if (!success) writeFileSync(path.join(root, "server.log"), log);
  console.log(`Isolated acceptance files: ${root}`);
  child.kill("SIGTERM"); await fixture.close();
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(3_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
