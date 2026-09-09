// The shipped React application, real host approval routes and a real private
// browser, using only a disposable calendar-like website and deterministic CLI.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { browserWorkflowFixture } from '../server/testing/browser-workflow-fixture.js';

const f = await browserWorkflowFixture();
const browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const output = '/tmp/openbot-browser-workflow-qa'; mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await f.pending(/Click “Create”/);
  await page.goto(f.base + '/?thread=bot-nova');
  const controls = page.getByRole('region', { name: 'Task controls', exact: true }).last();
  await controls.getByText(/Click “Create” on/).waitFor();
  assert.equal(await page.getByText('Private sign-in', { exact: true }).count(), 0, 'A generic browser review must not open the sign-in panel');
  assert.ok(await controls.getByRole('button', { name: 'Approve action', exact: true }).isDisabled());
  await controls.getByText('Review the full action', { exact: true }).click();
  assert.equal(f.writes.length, 0);
  await controls.getByRole('button', { name: 'Approve action', exact: true }).click();
  await f.pending(/Click “Save”/);
  await controls.getByText(/Click “Save” on/).waitFor();
  // A fresh action must require its own full review, not inherit the last one.
  assert.ok(await controls.getByRole('button', { name: 'Approve action', exact: true }).isDisabled());
  await controls.getByText('Review the full action', { exact: true }).click();
  await controls.getByText('Dinner fixture', { exact: true }).waitFor();
  await controls.getByText('2026-09-09 21:00 Europe/Brussels', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'review-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await controls.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'The complete review fits a phone');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, 'review-phone.png') });
  await controls.getByRole('button', { name: 'Approve action', exact: true }).click();
  await f.until(() => f.db.getRun(f.runId)?.status === 'completed');
  assert.deepEqual(f.writes, ['Dinner fixture']);
  await page.getByRole('main').getByText('The fixture event was saved and verified.', { exact: true }).waitFor();
  assert.ok(await page.getByText('Approved action completed', { exact: true }).count() >= 1);

  // Inject usage only into this disposable database. Real user limits, accounts
  // and personal tasks are never changed by this acceptance test.
  f.db.updateBot('nova', { weeklyTokenBudget: 1 });
  const stopped = f.db.createRun({ threadId: 'bot-nova', botId: 'nova', prompt: 'Fixture budget stop', status: 'failed' });
  f.db.updateRun(stopped.id, { inputTokens: 2, error: 'Nova reached the weekly token limit configured in OpenBot.' });
  f.db.finishRunTask(stopped.id, 'failed', 'Nova reached the weekly token limit configured in OpenBot.');
  await page.reload();
  await page.getByText('Weekly budget reached', { exact: true }).waitFor();
  await page.getByText(/Your provider’s allowance is separate/).waitFor();
  const draft = page.getByRole('textbox', { name: 'Message your team', exact: true });
  await draft.fill('Keep this fixture draft when the limit is reached');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Your draft has been kept' }).waitFor();
  assert.equal(await draft.inputValue(), 'Keep this fixture draft when the limit is reached');
  await page.screenshot({ path: path.join(output, 'limit-phone.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: 'Review budget', exact: true }).click();
  assert.equal(await page.getByLabel('Weekly token limit').inputValue(), '1', 'Budget help opens the correct teammate setting');
  assert.deepEqual(errors, []);
  console.log(`PASS: real UI Create → edit → review → Save → verified result, new-action acknowledgment reset, desktop/390px, immediate action receipt, visible weekly stop and preserved rejected draft. ${output}`);
} finally { await browser.close(); await f.close(); }
