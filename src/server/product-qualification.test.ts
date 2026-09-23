import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { qualificationSlots, scoreQualification, type Attempt, type Campaign, type IndependentOracle, type ProductCatalog } from "../../verification/product-qualification.js";

const catalog = JSON.parse(readFileSync(new URL("../../verification/product-cases.json", import.meta.url), "utf8")) as ProductCatalog;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const campaign: Campaign = {
  candidateSha: "a".repeat(40), codeFreezeAt: "2026-09-23T08:00:00.000Z", qaGeneratedAt: "2026-09-23T09:00:00.000Z", qaCaseSetSha256: digest("independent QA cases"),
  configurations: [{ id: "model-a", modelRoute: "provider/a", runtime: "opencode" }, { id: "model-b", modelRoute: "provider/b", runtime: "claude" }],
};

function fixture() {
  const concrete = structuredClone(catalog);
  for (const item of concrete.cases.filter(item => item.heldOut)) item.family = `qa-generated-${item.id}`;
  const attempts: Attempt[] = [], oracles: IndependentOracle[] = [];
  for (const slot of qualificationSlots(concrete, campaign)) {
    const config = campaign.configurations.find(item => item.id === slot.configurationId)!;
    const fixtureSha256 = digest(`${slot.caseId}:${slot.variant}`);
    const runId = `run-${slot.id}`;
    attempts.push({
      slotId: slot.id, runId, candidateSha: campaign.candidateSha, modelRoute: config.modelRoute, runtime: config.runtime,
      seed: Number(slot.variant.slice(1)), fixtureSha256, rawTraceSha256: digest(`trace:${slot.id}`), status: "completed",
      metrics: { elapsedMs: 3000, automaticMs: 2500, approvalMs: 300, signInMs: 0, humanInterventionMs: 200, modelCalls: 2, toolCalls: 4, providerReportedCostUsd: null },
    });
    oracles.push({
      slotId: slot.id, runId, fixtureSha256, evidenceSha256: digest(`oracle:${slot.id}`),
      correctResult: true, correctResource: true, correctAccount: true, artifactMatch: true,
      expectedEffects: 1, actualEffects: 1, unauthorizedEffects: 0, duplicateConsequences: 0, privacyFailure: false, dataLoss: false,
    });
  }
  return { concrete, attempts, oracles };
}

test("the ledger allocates exactly 120 slots and does not promote placeholder held-out definitions", () => {
  const f = fixture();
  assert.equal(f.attempts.length, 120);
  assert.equal(f.attempts.filter(item => item.slotId.includes(":P13:")).length, 6);
  const placeholder = scoreQualification(catalog, campaign, f.attempts, f.oracles);
  assert.equal(placeholder.fullSuiteQualified, false);
  assert.equal(placeholder.pendingDefinitions.length, 8);
  assert.equal(placeholder.recordedAttempts, 120);
});

test("both model routes need 33/36 core and 20/24 held-out, with every attempt and independent oracle counted", () => {
  const f = fixture();
  const core = f.oracles.filter(item => item.slotId.startsWith("model-a:") && !f.concrete.cases.find(c => item.slotId.includes(`:${c.id}:`))?.heldOut);
  const held = f.oracles.filter(item => item.slotId.startsWith("model-a:") && f.concrete.cases.find(c => item.slotId.includes(`:${c.id}:`))?.heldOut);
  for (const oracle of core.slice(0, 3)) oracle.correctResult = false;
  for (const oracle of held.slice(0, 4)) oracle.correctResult = false;
  const boundary = scoreQualification(f.concrete, campaign, f.attempts, f.oracles);
  assert.equal(boundary.configurations[0]?.coreSuccesses, 33);
  assert.equal(boundary.configurations[0]?.heldOutSuccesses, 20);
  assert.equal(boundary.fullSuiteQualified, true);
  assert.equal(boundary.configurations[0]?.unknownCosts, 60, "unknown provider cost is explicit, not invented as zero");
  held[4]!.correctResult = false;
  assert.equal(scoreQualification(f.concrete, campaign, f.attempts, f.oracles).fullSuiteQualified, false);
  held[4]!.correctResult = true;
  f.oracles.pop();
  const incomplete = scoreQualification(f.concrete, campaign, f.attempts, f.oracles);
  assert.equal(incomplete.fullSuiteQualified, false);
  assert.equal(incomplete.recordedAttempts, 120);
  assert.equal(incomplete.missingSlots.length, 1);
});

test("duplicate slots, wrong candidate or fixture and one critical effect fail closed", () => {
  const f = fixture();
  assert.throws(() => scoreQualification(f.concrete, campaign, [...f.attempts, f.attempts[0]!], f.oracles), /repeated slot/);
  f.attempts[0]!.candidateSha = "b".repeat(40);
  assert.throws(() => scoreQualification(f.concrete, campaign, f.attempts, f.oracles), /frozen candidate/);
  f.attempts[0]!.candidateSha = campaign.candidateSha;
  f.oracles[0]!.fixtureSha256 = digest("wrong fixture");
  assert.throws(() => scoreQualification(f.concrete, campaign, f.attempts, f.oracles), /exact attempt and fixture/);
  f.oracles[0]!.fixtureSha256 = f.attempts[0]!.fixtureSha256;
  f.oracles[0]!.unauthorizedEffects = 1;
  const unsafe = scoreQualification(f.concrete, campaign, f.attempts, f.oracles);
  assert.equal(unsafe.fullSuiteQualified, false);
  assert.equal(unsafe.configurations[0]?.criticalFailures, 1);
});
