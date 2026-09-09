import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fixtureSkill, skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("learn uses the real host review and save path: scoped requests, manual approval, denial, stale review and replay", { timeout: 60_000 }, async () => {
  const f = await skillAuthoringFixture();
  try {
    const first = await f.propose();
    assert.equal(first.observation.learning, true);
    assert.ok(first.observation.modelArgs.includes("opencode/fixture"));
    assert.equal(first.observation.badToken, 403);
    assert.equal(first.observation.wrongBot, 403);
    assert.equal(first.observation.malformed, 400);
    assert.equal(first.observation.secret, 400);
    assert.equal(first.preview.canApprove, true);
    assert.ok(first.preview.fields.some((field: { value: string }) => field.value === fixtureSkill.instructions));
    assert.equal(f.db.getApproval(first.approvalId)?.status, "pending", "YOLO does not approve persistent skill instructions");
    assert.match(first.observation.result.message, /Paused/);
    assert.equal(f.db.listWorkflows().length, 0);
    const decline = await f.post(`/api/approvals/${first.approvalId}/decide`, { decision: "denied" });
    assert.equal(decline.status, 200);
    assert.equal(f.db.listWorkflows().length, 0, "Declining writes no skill");

    const second = await f.propose();
    assert.notEqual((await f.post(`/api/approvals/${second.approvalId}/decide`, { decision: "approved", reviewFingerprint: first.preview.reviewFingerprint })).status, 200);
    assert.equal(f.db.listWorkflows().length, 0, "A review from another proposal cannot authorize this draft");
    const decision = { decision: "approved", reviewFingerprint: second.preview.reviewFingerprint };
    const responses = await Promise.all([f.post(`/api/approvals/${second.approvalId}/decide`, decision), f.post(`/api/approvals/${second.approvalId}/decide`, decision)]);
    assert.equal(responses.filter(response => response.status === 200).length, 1);
    const skills = f.db.listWorkflows(); assert.equal(skills.length, 1);
    assert.equal(skills[0]!.instructions, fixtureSkill.instructions);
    assert.equal(skills[0]!.startUrl, "");
    assert.equal(f.db.getApprovedAction(second.approvalId)?.status, "completed");
    assert.equal(f.db.listRoutines().length, 0);
    for (const runtime of [".opencode", ".claude"]) assert.ok(readFileSync(path.join(f.db.workspacesDir, "nova", runtime, "skills", skills[0]!.skillSlug, "SKILL.md"), "utf8").includes(fixtureSkill.instructions));
    assert.match(f.db.getRun(second.runId)!.prompt, /Saved the exact reviewed instructions/);
    assert.equal((await f.post(`/api/workflows/${skills[0]!.id}`, { ...fixtureSkill, name: "Invoice review" }, "PATCH")).status, 200, "Owner can edit a skill without a starting website");
    const third = await f.propose();
    assert.equal((await f.post(`/api/runs/${third.runId}/cancel`, {})).status, 200);
    assert.notEqual((await f.post(`/api/approvals/${third.approvalId}/decide`, { decision: "approved", reviewFingerprint: third.preview.reviewFingerprint })).status, 200);
    assert.equal(f.db.listWorkflows().length, 1, "Cancelling invalidates the pending skill proposal");
  } finally { await f.close(); }
});
