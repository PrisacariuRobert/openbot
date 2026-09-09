// Real app + host + private browser, only a disposable synthetic calendar.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { browserWorkflowFixture } from '../server/testing/browser-workflow-fixture.js';

const f = await browserWorkflowFixture({ pauseAfterSave: true, yolo: true });
const browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const output = '/tmp/openbot-token-approval-qa'; mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(10_000);
  const a = await f.pending(/more tokens/);
  await page.goto(f.base + '/?thread=bot-nova');
  const controls = page.getByRole('region', { name: 'Task controls', exact: true }).last();
  await controls.getByText('Continue this task?', { exact: true }).waitFor();
  const allow = controls.getByRole('button', { name: 'Allow 50,000 more tokens', exact: true });
  if (await controls.getByRole('button', { name: 'Refresh allowance' }).isVisible()) await controls.getByRole('button', { name: 'Refresh allowance' }).click();
  await allow.waitFor(); assert.equal(await allow.isDisabled(), true);
  await controls.getByText('Review the token allowance', { exact: true }).click();
  await controls.getByText('52,000 tokens', { exact: true }).waitFor();
  await controls.getByText(/does not purchase tokens/).waitFor();
  await controls.getByRole('combobox', { name: 'Extra tokens for this task' }).selectOption('250000');
  const larger = controls.getByRole('button', { name: 'Allow 250,000 more tokens', exact: true });
  await larger.waitFor();
  assert.equal(await larger.isDisabled(), true, 'Changing the amount requires a fresh review');
  assert.equal(f.db.getRun(f.runId)?.status, 'awaiting_approval');
  await controls.getByText('Review the token allowance', { exact: true }).click();
  await controls.getByText('252,000 tokens', { exact: true }).waitFor();
  assert.deepEqual(f.writes, ['Dinner fixture']);
  await page.screenshot({ path: path.join(output, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, 'phone.png') });
  await larger.click();
  await f.until(() => f.db.getRun(f.runId)?.status === 'completed');
  await page.getByRole('main').getByText('The fixture event was saved and verified.', { exact: true }).waitFor();
  assert.equal(f.db.getApproval(a.id)!.status, 'approved'); assert.deepEqual(f.writes, ['Dinner fixture']);
  assert.deepEqual(errors, []);
  console.log(`PASS: reviewed task-only top-up, explicit owner decision in YOLO, desktop/390px, same-run resume and exactly one Save. ${output}`);
} finally { await browser.close(); await f.close(); }
