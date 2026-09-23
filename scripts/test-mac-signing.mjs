import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signedMacBuilderArgs } from './lib/mac-signing.mjs';
import { parse } from 'yaml';

const certificate = {
  CSC_LINK: 'fixture-p12',
  CSC_KEY_PASSWORD: 'fixture-password',
  CSC_NAME: 'Developer ID Application: Example Team (ABCDE12345)',
};
const notary = {
  APPLE_API_KEY: '/tmp/fixture-key.p8',
  APPLE_API_KEY_ID: 'KEY123',
  APPLE_API_ISSUER: 'fixture-issuer',
};

test('signed packaging refuses missing credentials and the wrong host before building', () => {
  assert.throws(() => signedMacBuilderArgs({}, 'darwin'), /CSC_LINK/);
  assert.throws(() => signedMacBuilderArgs({ ...certificate, ...notary }, 'linux'), /macOS/);
  assert.throws(() => signedMacBuilderArgs({ ...certificate, CSC_NAME: 'Mac App Distribution: Example', ...notary }, 'darwin'), /Developer ID Application/);
  assert.throws(() => signedMacBuilderArgs(certificate, 'darwin'), /notarization/);
  assert.throws(() => signedMacBuilderArgs({ ...certificate, APPLE_ID: 'example@invalid.test' }, 'darwin'), /notarization/);
});

test('signed packaging explicitly requires signing, hardened runtime and notarization', () => {
  const args = signedMacBuilderArgs({ ...certificate, ...notary }, 'darwin');
  assert.ok(args.some((arg) => arg.includes('mac.identity=Developer ID Application:')));
  for (const required of ['mac.forceCodeSigning=true', 'mac.hardenedRuntime=true', 'mac.notarize=true', 'mac.entitlements=build/entitlements.mac.plist']) {
    assert.ok(args.some((arg) => arg.endsWith(required)), required);
  }
  assert.doesNotMatch(args.join(' '), /fixture-password|fixture-p12|fixture-key/);
  const desktop = JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'));
  assert.equal(desktop.build.mac.identity, null, 'ordinary development packaging stays unsigned');
});

test('an Apple ID or keychain profile is a complete alternative notary method', () => {
  assert.doesNotThrow(() => signedMacBuilderArgs({ ...certificate, APPLE_ID: 'example@invalid.test', APPLE_APP_SPECIFIC_PASSWORD: 'fixture', APPLE_TEAM_ID: 'ABCDE12345' }, 'darwin'));
  assert.doesNotThrow(() => signedMacBuilderArgs({ ...certificate, APPLE_KEYCHAIN: '/tmp/fixture.keychain', APPLE_KEYCHAIN_PROFILE: 'notary-profile' }, 'darwin'));
});

test('signed candidate workflow is manual, credential-scoped and cannot publish', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/signed-mac-candidate.yml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.permissions.contents, 'read');
  const steps = workflow.jobs.candidate.steps;
  const build = steps.find((step) => step.run === 'npm run package:desktop:signed');
  assert.ok(build);
  assert.ok(build.env.CSC_LINK.includes('secrets.OPENBOT_MAC_CSC_LINK'));
  assert.ok(steps.some((step) => step.run?.includes('SHA256SUMS.txt')));
  assert.ok(steps.some((step) => step.uses?.startsWith('actions/upload-artifact')));
  assert.ok(!steps.some((step) => /gh release|--publish\s+always/.test(step.run || '')));
});
