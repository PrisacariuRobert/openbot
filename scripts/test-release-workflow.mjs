import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const read = name => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
test('draft releases wait for all desktop installers and never publish automatically', () => {
  const release = read('release');
  assert.equal(release.jobs.desktop.uses, './.github/workflows/desktop.yml');
  assert.deepEqual(release.jobs.publish.needs, ['desktop', 'terminal-bundles']);
  // The one-command Mac install downloads these stable names from the release.
  const bundles = release.jobs['terminal-bundles'];
  assert.deepEqual(bundles.strategy.matrix.include.map(v => v.platform).sort(), ['darwin-arm64', 'darwin-x64']);
  const upload = bundles.steps.find(s => s.uses?.startsWith('actions/upload-artifact'));
  assert.equal(upload.with['if-no-files-found'], 'error');
  // The Mac download page's disk images come from the same bundle and installer, under stable names.
  assert.ok(bundles.steps.some(s => s.run === 'scripts/build-mac-download.sh ${{ matrix.platform }} dist-release dist-release'));
  assert.match(upload.with.path, /dist-release\/Sidemates-mac-\*\.dmg\n/);
  assert.ok(bundles.steps.findIndex(s => s.run?.includes('build-mac-download')) < bundles.steps.indexOf(upload), 'the image is built before the upload');
  const pattern = release.jobs.publish.steps.find(s => s.uses?.startsWith('actions/download-artifact')).with.pattern;
  assert.equal(pattern, 'sidemates-desktop-*');
  const prefix = pattern.slice(0, -1);
  assert.ok(upload.with.name.startsWith(prefix), 'terminal bundles are merged into the same draft release');
  const installers = read('desktop').jobs.installer.steps.find(s => s.uses?.startsWith('actions/upload-artifact'));
  assert.ok(installers.with.name.startsWith(prefix), 'desktop installers are merged into the same draft release');
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
  assert.match(upload.if, /github\.event_name == 'workflow_call'/);
  assert.equal(read('desktop').on.workflow_dispatch.inputs.upload_artifacts.default, false);
  assert.match(upload.with.path, /desktop\/release\/\*\.dmg/);
  assert.doesNotMatch(JSON.stringify(job), /xcodebuild|desktop\/dist/);
  const desktop = JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'));
  assert.ok(desktop.homepage?.startsWith('https://'), 'Linux debs need a project homepage');
  assert.match(desktop.author?.email || '', /@/, 'Linux debs need an author email');
  for (const platform of ['mac', 'linux', 'win']) {
    for (const target of desktop.build[platform].target) {
      assert.equal(target.arch, undefined, `${platform}/${target.target} must inherit the matrix host architecture`);
    }
  }
});
