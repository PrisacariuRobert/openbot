import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const read = name => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
test('draft releases wait for all desktop installers and never publish automatically', () => {
  const release = read('release');
  assert.equal(release.jobs.desktop.uses, './.github/workflows/desktop.yml');
  assert.deepEqual(release.jobs.publish.needs, ['desktop']);
  const command = release.jobs.publish.steps.find(s => s.run?.includes('gh release')).run;
  assert.match(command, /--draft\b/); assert.match(command, /--verify-tag\b/);
  assert.doesNotMatch(release.jobs.publish.if, /always\(/);
});
test('each desktop target stages the host runtime and uploads the actual builder output', () => {
  const job = read('desktop').jobs.installer;
  assert.deepEqual(job.strategy.matrix.include.map(v => v.platform).sort(), ['darwin-arm64','darwin-x64','linux-x64','win-x64']);
  assert.ok(job.steps.some(s => s.run === 'npm run package:desktop'));
  const upload = job.steps.find(s => s.uses?.startsWith('actions/upload-artifact'));
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.match(upload.with.path, /desktop\/release\/\*\.dmg/);
  assert.doesNotMatch(JSON.stringify(job), /xcodebuild|desktop\/dist/);
});
