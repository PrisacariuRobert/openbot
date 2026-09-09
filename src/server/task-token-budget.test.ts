import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OpenBotDatabase } from './testing/database.js';
import { DEFAULT_EXECUTION_LIMITS } from './execution-policy.js';
import { approvalPreview } from '../shared/approval-preview.js';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'openbot-token-approval-')), db = new OpenBotDatabase(root);
  db.chooseInitialProvider('local-opencode', 'opencode/fixture');
  const run = db.createRun({ threadId: 'bot-nova', botId: 'nova', prompt: 'Prepare an editable result', status: 'running' });
  db.updateRun(run.id, { inputTokens: 109_000, outputTokens: 800, reasoningTokens: 4000, activeDurationMs: 4200, modelSteps: 9, partialText: 'The file is saved. Checking it.' });
  return { root, db, run, close() { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('one durable task-only grant resumes the same job without resetting usage, steps, session or progress', () => {
  const f = fixture();
  try {
    const bot = f.db.getBot('nova')!;
    const a = f.db.pauseForTaskTokens(f.run.id)!;
    assert.equal(f.db.pauseForTaskTokens(f.run.id)!.id, a.id);
    const reopened = new OpenBotDatabase(f.root);
    try { assert.equal(reopened.taskTokenPolicy(f.run.id).pendingApprovalId, a.id); } finally { reopened.close(); }
    const review = f.db.taskTokenReview(a.id, DEFAULT_EXECUTION_LIMITS)!;
    assert.equal(review.newJobLimit, 163_800); assert.equal(review.additionalTokens, 50_000);
    const preview = approvalPreview(a, f.db.getRun(f.run.id), f.db.getApprovalAction(a.id), null, review);
    assert.equal(preview.canApprove, true); assert.ok(preview.fields.some(field => field.value.includes('weekly allowance')));
    assert.equal(f.db.decideApproval(a.id, 'approved'), null, 'Generic decisions cannot grant tokens');
    assert.equal(f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS)?.status, 'approved');
    assert.equal(f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS), null, 'No duplicate grant');
    const resumed = f.db.getRun(f.run.id)!;
    assert.equal(resumed.status, 'queued'); assert.equal(resumed.inputTokens, 109_000); assert.equal(resumed.modelSteps, 9);
    assert.equal(resumed.activeDurationMs, 4200); assert.equal(resumed.partialText, 'The file is saved. Checking it.');
    assert.equal(f.db.taskTokenPolicy(f.run.id).extraTokens, 63_800);
    assert.equal(f.db.getBot('nova')!.weeklyTokenBudget, bot.weeklyTokenBudget);
    assert.equal(f.db.getBot('nova')!.model, bot.model);
    assert.equal(f.db.listApprovedActions().length, 0, 'A token decision is not an external action receipt');
  } finally { f.close(); }
});

test('late usage changes the reviewed total, and another ceiling needs a new approval', () => {
  const f = fixture();
  try {
    const a = f.db.pauseForTaskTokens(f.run.id)!;
    f.db.updateRun(f.run.id, { inputTokens: 119_000 });
    assert.equal(f.db.taskTokenReview(a.id, DEFAULT_EXECUTION_LIMITS)!.newJobLimit, 173_800);
    f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS);
    f.db.updateRun(f.run.id, { inputTokens: 180_000, status: 'running' });
    const again = f.db.pauseForTaskTokens(f.run.id)!;
    assert.notEqual(again.id, a.id);
    assert.equal(f.db.taskTokenPolicy(f.run.id).revision, 1);
    assert.equal(f.db.taskTokenReview(a.id, DEFAULT_EXECUTION_LIMITS), null);
    assert.equal(f.db.decideTaskTokens(again.id, 'denied', DEFAULT_EXECUTION_LIMITS)!.status, 'denied');
    assert.equal(f.db.getRun(f.run.id)!.status, 'cancelled');
  } finally { f.close(); }
});

test('weekly limits still block spending and declining stops every paused consultant, not unrelated work', () => {
  const f = fixture();
  try {
    const child = f.db.createRun({ threadId: f.run.threadId, botId: 'pixel', parentRunId: f.run.id, prompt: 'Check totals', status: 'queued' });
    const other = f.db.createRun({ threadId: 'bot-scout', botId: 'scout', prompt: 'Unrelated', status: 'queued' });
    const a = f.db.pauseForTaskTokens(child.id)!;
    f.db.updateBot('nova', { weeklyTokenBudget: 100 });
    assert.match(f.db.taskTokenReview(a.id, DEFAULT_EXECUTION_LIMITS)!.limitation!, /weekly/);
    assert.equal(f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS), null);
    f.db.cancelRun(child.id);
    assert.equal(f.db.getRun(f.run.id)!.status, 'cancelled'); assert.equal(f.db.getRun(child.id)!.status, 'cancelled');
    assert.equal(f.db.getRun(other.id)!.status, 'queued');
    assert.equal(f.db.getApproval(a.id)!.status, 'denied');
  } finally { f.close(); }
});

test('a team grant keeps its coordinator waiting, resumes consultants and preserves unrelated work', () => {
  const f = fixture();
  try {
    f.db.markRunConsultationPending(f.run.id);
    f.db.pauseRunForConsultation(f.run.id);
    const child = f.db.createRun({ threadId: f.run.threadId, botId: 'pixel', parentRunId: f.run.id, prompt: 'Check the workbook', status: 'running' });
    const other = f.db.createRun({ threadId: 'bot-scout', botId: 'scout', prompt: 'Unrelated task', status: 'queued' });
    f.db.updateRun(child.id, { inputTokens: 4200, partialText: 'Checking formulas' });
    const a = f.db.pauseForTaskTokens(child.id)!;
    assert.equal(f.db.getRun(f.run.id)!.status, 'awaiting_approval');
    assert.equal(f.db.getRun(child.id)!.status, 'awaiting_approval');
    f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS);
    assert.equal(f.db.getRun(f.run.id)!.status, 'waiting_for_teammate');
    assert.equal(f.db.getRun(child.id)!.status, 'queued');
    assert.equal(f.db.getRun(child.id)!.partialText, 'Checking formulas');
    assert.equal(f.db.taskTokenPolicy(child.id).extraTokens, f.db.taskTokenPolicy(f.run.id).extraTokens);
    assert.equal(f.db.getRun(other.id)!.status, 'queued');
    assert.equal(f.db.taskTokenPolicy(other.id).extraTokens, 0);
  } finally { f.close(); }
});

test('an action already in flight must finish before a token grant and cannot be dispatched twice', () => {
  const f = fixture();
  try {
    const action = { type: 'gmail_send', botId: 'nova', args: { to: 'fixture@example.test', subject: 'Fixture', body: 'Test only' } };
    const external = f.db.createApproval({ runId: f.run.id, botId: 'nova', kind: 'external', reason: 'Fixture', actionLabel: 'Send fixture', action });
    f.db.prepareApprovedAction({ approvalId: external.id, runId: f.run.id, botId: 'nova', actionType: 'gmail_send', action });
    f.db.decideApproval(external.id, 'approved');
    f.db.claimApprovedAction(external.id);
    const a = f.db.pauseForTaskTokens(f.run.id)!;
    assert.match(f.db.taskTokenReview(a.id, DEFAULT_EXECUTION_LIMITS)!.limitation!, /already-approved action/);
    assert.equal(f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS), null);
    f.db.completeApprovedAction(external.id, 'Fixture accepted once');
    assert.equal(f.db.taskTokenReview(a.id, DEFAULT_EXECUTION_LIMITS)!.limitation, null);
    assert.equal(f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS)?.status, 'approved');
    assert.equal(f.db.getApprovedAction(external.id)?.status, 'completed');
    assert.equal(f.db.claimApprovedAction(external.id), null);
  } finally { f.close(); }
});

test('unused action approvals are withdrawn, never included in an extra-token grant', () => {
  const f = fixture();
  try {
    const action = { type: 'gmail_send', botId: 'nova', args: { to: 'fixture@example.test', subject: 'Fixture', body: 'Test only' } };
    const external = f.db.createApproval({ runId: f.run.id, botId: 'nova', kind: 'external', reason: 'Fixture', actionLabel: 'Send fixture', action });
    f.db.prepareApprovedAction({ approvalId: external.id, runId: f.run.id, botId: 'nova', actionType: 'gmail_send', action });
    const a = f.db.pauseForTaskTokens(f.run.id)!;
    assert.equal(f.db.getApproval(external.id)?.status, 'denied');
    assert.equal(f.db.getApprovedAction(external.id), null);
    f.db.decideTaskTokens(a.id, 'approved', DEFAULT_EXECUTION_LIMITS);
    assert.equal(f.db.decideApproval(external.id, 'approved'), null);
    assert.equal(f.db.claimApprovedAction(external.id), null);
    assert.equal(f.db.getRun(f.run.id)?.status, 'queued');
  } finally { f.close(); }
});
