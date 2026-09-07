import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { UsageEvidenceAccumulator, reportedUsage, usageLedgerMarkdown } from "./usage-ledger.js";

test("usage evidence distinguishes explicit zero, omitted fields, invalid values and partial step coverage", () => {
  const evidence = new UsageEvidenceAccumulator();
  assert.deepEqual(evidence.evidence().cost, { value: null, reporting: "unavailable" });
  const step = { type: "step_finish", part: { id: "1", tokens: { input: 10, output: 0 }, cost: 0 } };
  evidence.add(step); evidence.add(step);
  assert.deepEqual(evidence.evidence().cost, { value: 0, reporting: "reported" });
  evidence.add({ type: "step_finish", part: { id: "2", tokens: { input: 20, output: 5, reasoning: Infinity, cache: { read: "bad" } } } });
  assert.deepEqual(evidence.evidence().inputTokens, { value: 30, reporting: "reported" });
  assert.deepEqual(evidence.evidence().cost, { value: 0, reporting: "partial" });
  assert.deepEqual(evidence.evidence().reasoningTokens, { value: null, reporting: "unavailable" });
  assert.equal(reportedUsage({ tokens: [] }), null);
});
test("cumulative provider evidence replaces step values without treating missing totals as zero", () => {
  const evidence = new UsageEvidenceAccumulator();
  evidence.add({ type: "assistant", message: { id: "a", usage: { input_tokens: 10, output_tokens: 2 } } });
  evidence.add({ type: "result", usage: { input_tokens: 20, output_tokens: 3 }, total_cost_usd: 0.1 });
  assert.deepEqual(evidence.evidence().inputTokens, { value: 20, reporting: "reported" });
  assert.deepEqual(evidence.evidence().cacheReadTokens, { value: null, reporting: "unavailable" });
});
test("job receipts include only their own consultations and disclose legacy/missing evidence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-usage-evidence-")), db = new OpenBotDatabase(root);
  try {
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Brief", status: "running" });
    const child = db.createRun({ botId: "pixel", threadId: "bot-nova", prompt: "Consult", status: "running", parentRunId: run.id });
    const evidence = new UsageEvidenceAccumulator(); evidence.add({ tokens: { input: 42, output: 10 }, cost: 0 });
    db.saveExtensionRecord(`usage-attempt:${child.id}`, "fixture", { id: "fixture", runId: child.id, model: "fixture-model", providerId: "fixture", runtime: "OpenCode", closed: false, at: new Date().toISOString(), evidence: evidence.evidence() });
    db.saveExtensionRecord("usage-attempt:other", "unrelated", { id: "unrelated", runId: "other", model: "should-not-appear" });
    const markdown = usageLedgerMarkdown(db, run.id);
    assert.match(markdown, /fixture-model/); assert.doesNotMatch(markdown, /should-not-appear/);
    assert.match(markdown, /Unavailable/); assert.match(markdown, /not zero usage/); assert.match(markdown, /completion not recorded/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
