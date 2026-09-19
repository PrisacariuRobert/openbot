// Package the existing shared client and host as one Electron desktop app.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const platform = `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;
if (!['darwin-arm64', 'darwin-x64', 'linux-x64', 'win-x64'].includes(platform)) throw new Error(`Unsupported packaging host: ${platform}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, shell: process.platform === 'win32' && command === npm });
  if (result.status !== 0) throw new Error(`Packaging failed: ${command} (exit ${result.status})`);
}
run(npm, ['run', 'build']);
run(process.execPath, ['scripts/package-runtime-bundle.mjs', '--platform', platform, '--node', process.env.OPENBOT_NODE_VERSION || '22.21.0', '--opencode', process.env.OPENBOT_OPENCODE_VERSION || '1.18.31', '--stage-only', '--out', 'dist-release']);
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = path.join(root, 'dist-release', `openbot-${version}-${platform}`);
if (!existsSync(path.join(source, 'runtime-manifest.json'))) throw new Error('Runtime manifest is missing.');
mkdirSync(path.join(root, 'desktop/runtime'), { recursive: true });
// Copy to fresh staging before replacing generated packaging input.
const runtime = path.join(root, 'desktop/runtime/openbot');
const { rmSync, renameSync } = await import('node:fs');
const pending = `${runtime}.pending-${process.pid}`;
cpSync(source, pending, { recursive: true, verbatimSymlinks: true });
if (existsSync(runtime)) rmSync(runtime, { recursive: true });
renameSync(pending, runtime);
run(npm, ['ci'], path.join(root, 'desktop'));
run(npm, ['run', 'dist', '--', ...(process.argv.includes('--dir') ? ['--dir'] : []), `--${process.arch}`, '--publish', 'never'], path.join(root, 'desktop'));
