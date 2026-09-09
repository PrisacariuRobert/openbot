import test from 'node:test';
import assert from 'node:assert/strict';
import { browserWorkflowFixture } from './testing/browser-workflow-fixture.js';

for (const stale of [false, true]) test(`real browser form reviews ${stale ? 'reject a changed target' : 'complete a two-step workflow'}`, { timeout: 45_000 }, async () => {
  const f = await browserWorkflowFixture();
  try {
    // This preparation request is read-only until a concrete browser control
    // is proposed. There is no blanket task approval to bypass first.
    const create = await f.pending(/Click “Create”/), createPreview = await f.preview(create);
    assert.equal(create.requiresSignIn, false, 'A normal browser action is not a private sign-in handoff');
    assert.equal(createPreview.canApprove, true); assert.equal(createPreview.limitation, null);
    assert.doesNotMatch(createPreview.actionLabel, /arrow_drop_down|addCreate/);
    assert.equal(f.writes.length, 0); assert.equal((await f.approve(create)).status, 200);
    const save = await f.pending(/Click “Save”/), savedPreview = await f.preview(save);
    assert.equal(savedPreview.canApprove, true);
    assert.ok(savedPreview.fields.some((field: { value: string }) => field.value === 'Dinner fixture'));
    assert.ok(savedPreview.fields.some((field: { value: string }) => field.value === '2026-09-09 21:00 Europe/Brussels'));
    if (stale) { f.changePage(); await f.until(f.changed); }
    assert.equal((await f.approve(save)).status, 200);
    await f.until(() => f.db.getRun(f.runId)?.status === 'completed');
    if (stale) {
      assert.equal(f.writes.length, 0); assert.equal(f.db.getApprovedAction(save.id)?.status, 'failed');
      assert.match(f.db.getApprovedAction(save.id)?.lastError || '', /changed after review/);
    } else {
      assert.deepEqual(f.writes, ['Dinner fixture']); assert.equal(f.db.getApprovedAction(save.id)?.status, 'completed');
      assert.ok(f.db.listMessages('bot-nova').some(message => message.eventType === 'action_completed'));
    }
  } finally { await f.close(); }
});
