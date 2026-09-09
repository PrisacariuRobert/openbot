import test from 'node:test';
import assert from 'node:assert/strict';
import { browserWorkflowFixture } from './testing/browser-workflow-fixture.js';

test('a real browser Save survives the token pause; only a fresh owner review resumes, without repeating Save', { timeout: 45_000 }, async () => {
  const f = await browserWorkflowFixture({ pauseAfterSave: true, yolo: true });
  try {
    const a = await f.pending(/more tokens/);
    await f.until(() => f.db.extensionRecords<{ closed: boolean }>(`usage-attempt:${f.runId}`).every(record => record.value.closed));
    assert.deepEqual(f.writes, ['Dinner fixture']);
    assert.equal(f.db.getRun(f.runId)?.status, 'awaiting_approval', 'YOLO cannot grant more tokens');
    assert.equal((await f.post(`/api/approvals/${a.id}/decide`, { decision: 'approved' })).status, 409);
    const old = await f.preview(a);
    assert.equal(old.canApprove, true, JSON.stringify(old));
    f.db.updateRun(f.runId, { inputTokens: 2100 });
    assert.equal((await f.post(`/api/approvals/${a.id}/decide`, { decision: 'approved', reviewFingerprint: old.reviewFingerprint })).status, 409, 'Late usage invalidates the old ceiling');
    assert.equal((await f.approve(a)).status, 200);
    assert.equal((await f.post(`/api/approvals/${a.id}/decide`, { decision: 'approved', reviewFingerprint: old.reviewFingerprint })).status, 409);
    await f.until(() => f.db.getRun(f.runId)?.status === 'completed');
    assert.deepEqual(f.writes, ['Dinner fixture']);
    assert.match(f.db.getRun(f.runId)!.summary!, /saved and verified/);
    assert.equal(f.db.getRun(f.runId)!.inputTokens, 2100, 'The same run keeps its counters');
    assert.equal(f.db.listApprovedActions().filter(receipt => receipt.actionType === 'task_tokens').length, 0);
  } finally { await f.close(); }
});

test('declining more tokens stops the model but preserves the completed external result', { timeout: 45_000 }, async () => {
  const f = await browserWorkflowFixture({ pauseAfterSave: true, yolo: true });
  try {
    const a = await f.pending(/more tokens/);
    assert.equal((await f.post(`/api/approvals/${a.id}/decide`, { decision: 'denied' })).status, 200);
    assert.equal(f.db.getRun(f.runId)!.status, 'cancelled');
    assert.deepEqual(f.writes, ['Dinner fixture']);
    assert.equal(f.db.getApprovedAction(a.id), null);
  } finally { await f.close(); }
});

test('choosing a larger allowance is bounded and requires a new separate approval', { timeout: 45_000 }, async () => {
  const f = await browserWorkflowFixture({ pauseAfterSave: true });
  try {
    await f.approve(await f.pending(/Create/));
    await f.approve(await f.pending(/Save/));
    const a = await f.pending(/more tokens/);
    await f.until(() => f.db.extensionRecords<{ closed: boolean }>(`usage-attempt:${f.runId}`).every(record => record.value.closed));
    const old = await f.preview(a);
    assert.equal((await f.post(`/api/approvals/${a.id}/token-allowance`, { additionalTokens: 1_000_000 })).status, 400);
    assert.equal((await f.post(`/api/approvals/${a.id}/token-allowance`, { additionalTokens: 250_000 })).status, 200);
    assert.equal(f.db.getRun(f.runId)?.status, 'awaiting_approval');
    assert.equal(f.db.taskTokenPolicy(f.runId).extraTokens, 0);
    assert.equal((await f.post(`/api/approvals/${a.id}/decide`, { decision: 'approved', reviewFingerprint: old.reviewFingerprint })).status, 409);
    assert.equal((await f.preview(a)).taskTokens.additionalTokens, 250_000);
    assert.equal((await f.approve(a)).status, 200);
    await f.until(() => f.db.getRun(f.runId)?.status === 'completed');
    assert.deepEqual(f.writes, ['Dinner fixture']);
    assert.equal((await f.post(`/api/approvals/${a.id}/token-allowance`, { additionalTokens: 50_000 })).status, 409);
  } finally { await f.close(); }
});
