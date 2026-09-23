import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

/** P03a: routine_list through the REAL host dispatch.
 *
 * The fixture runtime below is the test harness, not the product: it calls
 * the actual `/api/internal/tools` endpoint with the run's scoped token,
 * proving the new tool is reachable through the production conversation
 * runtime, bound to the run's conversation, and covered by the same host
 * boundary (scoped token, bot/run binding, active run) as every other tool.
 * Deterministic child, no model/account calls. */

const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const record = path.join(process.cwd(), '.routine-list-' + runId + '.json');
async function main() {
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const base = { botId: process.env.OPENBOT_BOT_ID, runId };
  const call = (action, args, h = headers) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers: h, body: JSON.stringify({ ...base, action, args }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const list = await call('routine_list', {});
  const exact = await call('routine_list', { routineId: list.body.routines.find(r => r.name === 'Monday review')?.id });
  const filtered = await call('routine_list', { query: 'monday' });
  const badQuery = await call('routine_list', { query: 42 });
  const badToken = await call('routine_list', {}, { ...headers, 'x-openbot-token': 'invalid' });
  const wrongBot = await (async () => {
    const r = await fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ botId: 'pixel', runId, action: 'routine_list', args: {} }) });
    return { status: r.status, text: (await r.text()).slice(0, 200) };
  })();
  fs.writeFileSync(record, JSON.stringify({ list, exact, filtered, badQuery, badToken: badToken.status, wrongBot }));
  console.log(JSON.stringify({ type: 'text', text: 'Listed the routines of this conversation. Nothing was changed.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

test("routine_list exposes exactly this conversation's routines through the scoped host dispatch", { timeout: 120_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      db.createRoutine({ name: "Monday review", botId: "nova", threadId: "bot-nova", prompt: "Review the inbox.", intervalMinutes: 10080 });
      db.createRoutine({ name: "Paused digest", botId: "nova", threadId: "bot-nova", prompt: "Summarize.", intervalMinutes: 1440, enabled: false });
      db.createRoutine({ name: "Pixel Monday review", botId: "pixel", threadId: "bot-pixel", prompt: "Pixel work.", intervalMinutes: 10080 });
    },
  });
  try {
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "List the automations in this conversation." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const completed = await f.until(() => f.db.getRun(runId)?.status === "completed" && f.db.getRun(runId));
    assert.ok(completed);
    const record = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "nova", `.routine-list-${runId}.json`), "utf8")) as {
      list: { status: number; body: { routines: Array<{ id: string; name: string; enabled: boolean }>; count: number; scope: string } };
      exact: { status: number; body: { routines: Array<{ id: string; name: string; prompt: string }>; count: number; scope: string } };
      filtered: { status: number; body: { routines: Array<{ name: string }>; count: number } };
      badQuery: { status: number };
      badToken: number;
      wrongBot: { status: number; text: string };
    };
    assert.equal(record.list.status, 200);
    assert.equal(record.list.body.scope, "conversation");
    assert.equal(record.list.body.count, 2, "only bot-nova routines are visible, never pixel's thread");
    const names = record.list.body.routines.map((routine) => routine.name).sort();
    assert.deepEqual(names, ["Monday review", "Paused digest"]);
    assert.ok(record.list.body.routines.every((routine) => typeof routine.id === "string" && routine.id.length > 0), "summaries carry stable ids for follow-ups");
    assert.ok(!("prompt" in (record.list.body.routines[0] as Record<string, unknown>)), "listing never exposes routine instructions");
    assert.equal(record.exact.status, 200);
    assert.equal(record.exact.body.count, 1);
    assert.equal(record.exact.body.routines[0]?.name, "Monday review");
    assert.equal(record.exact.body.routines[0]?.prompt, "Review the inbox.", "exact-id readback exposes only the selected routine's instructions");
    assert.equal(record.list.body.routines.find((routine) => routine.name === "Paused digest")?.enabled, false);
    assert.equal(record.filtered.status, 200);
    assert.deepEqual(record.filtered.body.routines.map((routine) => routine.name), ["Monday review"]);
    assert.equal(record.badQuery.status, 400, "malformed filter is rejected, not ignored");
    assert.equal(record.badToken, 403, "forged tokens fail on the new tool like every other");
    assert.equal(record.wrongBot.status, 403, `cross-bot run binding fails: ${record.wrongBot.text}`);
  } finally {
    await f.close();
  }
});
