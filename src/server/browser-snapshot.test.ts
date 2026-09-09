import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OpenBotDatabase } from './testing/database.js';
import { BrowserManager } from './runtime.js';

test('browser snapshots expose current editor values and observed selectors without private or hidden fields', { timeout: 20_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'openbot-snapshot-'));
  const db = new OpenBotDatabase(root), browser = new BrowserManager(db);
  const website = createServer((_req, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html><body>${'<p>Background row</p>'.repeat(280)}
      <div role="dialog" aria-label="Event editor">
        <input id="title" aria-label="Title" value="Dinner fixture">
        <label for="start">Start time</label><input id="start" value="9:00pm">
        <input id="end" aria-label="End time" value="10:00pm">
        <select id="calendar" aria-label="Calendar"><option value="id123">Personal calendar</option></select>
        <input id="guests" aria-label="Guests" value="">
        <input id="all-day" type="checkbox" aria-label="All day">
        <input id="password" type="password" aria-label="Password" value="PRIVATE_PASSWORD_FIXTURE">
        <label for="opaque">Password</label><input id="opaque" value="PRIVATE_LABELED_FIXTURE">
        <div role="status"><textarea aria-label="API token">PRIVATE_TOKEN_FIXTURE</textarea></div>
        <div contenteditable="true" aria-label="Verification code"><span role="textbox">PRIVATE_CODE_FIXTURE</span></div>
        <input hidden aria-label="Hidden stale date" value="PRIVATE_HIDDEN_FIXTURE">
        <button id="save">Save</button>
      </div></body></html>`);
  });
  await new Promise<void>(resolve => website.listen(0, '127.0.0.1', resolve));
  try {
    db.updateBot('nova', { browserEnabled: true });
    await browser.open('nova', `http://127.0.0.1:${(website.address() as { port: number }).port}`);
    const snapshot = await browser.snapshot('nova');
    assert.match(snapshot.text, /Title \| value: "Dinner fixture" \| selector: #title/);
    assert.match(snapshot.text, /Start time \| value: "9:00pm" \| selector: #start/);
    assert.match(snapshot.text, /End time \| value: "10:00pm" \| selector: #end/);
    assert.match(snapshot.text, /Calendar \| value: "Personal calendar"/);
    assert.match(snapshot.text, /Guests \| value: ""/);
    assert.match(snapshot.text, /All day \| value: "false"/);
    assert.match(snapshot.text, /Private field hidden/);
    assert.doesNotMatch(snapshot.text, /PRIVATE_(?:PASSWORD|LABELED|TOKEN|CODE|HIDDEN)_FIXTURE|Hidden stale date/);
    assert.match(snapshot.text, /Partial page/);
    assert.ok(snapshot.text.indexOf('Dinner fixture') < snapshot.text.indexOf('Background row'));
    await browser.type('nova', '#end', '11:00pm');
    assert.match((await browser.snapshot('nova')).text, /End time \| value: "11:00pm"/, 'Report the live field value, not its default HTML value or dropdown suggestions');
  } finally {
    await browser.close(); db.close();
    website.closeAllConnections(); await new Promise<void>(resolve => website.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
