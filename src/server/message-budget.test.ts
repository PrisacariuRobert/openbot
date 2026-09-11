import assert from 'node:assert/strict';
import test from 'node:test';
import { skillAuthoringFixture } from './testing/skill-authoring-fixture.js';

test('message preflight preserves uploads, history and routing when a teammate budget is exhausted', { timeout: 30_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime: `#!${process.execPath}\nconsole.log(JSON.stringify({type:'text',text:'Fixture completed.'}));`, configure(db) {
    db.updateBot('nova', { weeklyTokenBudget: 1 });
    const run = db.createRun({ threadId: 'bot-nova', botId: 'nova', prompt: 'Existing fixture', status: 'completed' });
    db.updateRun(run.id, { inputTokens: 2 });
    db.updateBot('pixel', { providerInstanceId: 'local-opencode', model: 'opencode/fixture' });
  } });
  try {
    const response = await fetch(f.base + '/api/attachments?threadId=bot-nova', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'records.csv', 'x-file-type': 'text/csv' }, body: 'id,amount\n001,10\n' });
    assert.equal(response.status, 201); const uploaded = await response.json() as { id: string };
    const count = f.db.listMessages('bot-nova').length, runs = f.db.listRuns('bot-nova').length;
    for (let n = 0; n < 2; n++) {
      const blocked = await f.post('/api/messages', { threadId: 'bot-nova', body: 'Check the supplied records', attachmentIds: [uploaded.id] });
      assert.equal(blocked.status, 409); const problem = await blocked.json();
      assert.equal(problem.code, 'teammate_budget_exhausted'); assert.equal(problem.blockedBots[0].name, 'Nova');
      assert.equal(f.db.getAttachment(uploaded.id)?.messageId, null);
      assert.equal(f.db.listMessages('bot-nova').length, count); assert.equal(f.db.listRuns('bot-nova').length, runs);
    }
    const teamBefore = f.db.listMessages('team-room').length;
    const team = await f.post('/api/messages', { threadId: 'team-room', body: 'Check this together', targetBotIds: ['nova', 'pixel'] });
    assert.equal(team.status, 409); assert.equal(f.db.listMessages('team-room').length, teamBefore, 'No partial team dispatch or silent substitution');
    const schedule = await f.post('/api/messages', { threadId: 'bot-nova', body: 'Every day at 09:00 UTC check project progress' });
    assert.equal(schedule.status, 201, 'Saving a schedule itself needs no model tokens');
    assert.equal(f.db.listRuns('bot-nova').length, runs);
    f.db.updateBot('nova', { weeklyTokenBudget: 20000 }); // Disposable fixture only, never owner settings: must clear one bounded step reserve.
    const retry = await f.post('/api/messages', { threadId: 'bot-nova', body: 'Check the supplied records', attachmentIds: [uploaded.id] });
    assert.equal(retry.status, 202, await retry.clone().text());
    const { runs: accepted } = await retry.json() as { runs: Array<{ id: string }> };
    await f.until(() => f.db.getRun(accepted[0]!.id)?.status === 'completed');
    assert.ok(f.db.getAttachment(uploaded.id)?.messageId, 'The same upload is reusable after an intentional retry');
  } finally { await f.close(); }
});
