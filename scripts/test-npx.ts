// Task R4: `npx sidemates` from the package as it would be published. Packs the
// package, checks what's in it, unpacks it and starts the studio from there.
// Dependencies come from this checkout's node_modules, so no network is needed.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repo = path.resolve(import.meta.dirname, "..");
const root = mkdtempSync(path.join(tmpdir(), "openbot-npx-"));
try {
  assert.ok(existsSync(path.join(repo, "dist", "index.html")), "Build the studio first (npm run build).");
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: repo, encoding: "utf8" })) as Array<{ filename: string; files: Array<{ path: string }>; size: number }>;
  const files = packed[0]!.files.map((file) => file.path);
  for (const needed of ["bin/sidemates.mjs", "dist/index.html", "src/server/index.ts", "src/server/prompts/teammate.md", "src/server/claude-mcp.mjs", "src/shared/types.ts", "skills/bundled", "scripts/background-runner.mjs", "package.json", "LICENSE"]) {
    assert.ok(files.some((file) => file === needed || file.startsWith(`${needed}/`)), `the package has ${needed}`);
  }
  for (const banned of [/^marketing\//, /^research_notes\//, /^reports\//, /^verification\//, /^site\//, /^desktop\//, /\.test\.tsx?$/, /\.browser\.ts$/, /^src\/server\/testing\//, /(^|\/)\.env/, /^src\/studio\/(?!Character\.tsx$|mascot-catalog\.ts$|capability-navigation\.ts$)/]) {
    assert.ok(!files.some((file) => banned.test(file)), `the package leaves out ${banned}`);
  }
  console.log(`packed ${files.length} files, ${(packed[0]!.size / 1_048_576).toFixed(1)} MB`);

  execFileSync("tar", ["-xzf", path.join(root, packed[0]!.filename), "-C", root]);
  const unpacked = path.join(root, "package");
  symlinkSync(path.join(repo, "node_modules"), path.join(unpacked, "node_modules"), "dir");
  const cli = path.join(unpacked, "bin", "sidemates.mjs");
  assert.equal(spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }).status, 0);
  const bad = spawnSync(process.execPath, [cli, "--colour"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown option: --colour/);
  assert.equal(spawnSync(process.execPath, [cli, "--port", "99999"], { encoding: "utf8" }).status, 2);

  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const home = path.join(root, "home"), data = path.join(root, "data");
  mkdirSync(home, { recursive: true });
  const child = spawn(process.execPath, [cli, "--port", String(port), "--data-dir", data], { env: { PATH: process.env.PATH, HOME: home, TMPDIR: process.env.TMPDIR, OPENBOT_LOAD_ENV: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-4_000); });
  try {
    let ready = false;
    for (let n = 0; n < 150 && !ready; n++) { try { ready = (await fetch(`http://127.0.0.1:${port}/api/healthz`)).ok; } catch { await delay(200); } }
    assert.ok(ready, `the studio started from the package\n${output}`);
    assert.match(await (await fetch(`http://127.0.0.1:${port}/`)).text(), /<div id="root">/);
    assert.ok(existsSync(path.join(data, "openbot.sqlite")), "data goes where it was told, not into the package");
    assert.equal(existsSync(path.join(unpacked, ".openbot")), false);
  } finally {
    child.kill("SIGTERM");
    for (let n = 0; n < 50 && child.exitCode === null; n++) await delay(100);
  }
  console.log("PASS: the packed package has the studio and none of the private or test files; npx sidemates starts it from the unpacked tarball, with --help, option checks and its own data folder.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
