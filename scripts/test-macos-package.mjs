import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

// Exercises the actual packaged launch helper with disposable studio data.
// Does not launch models, use connector accounts, or change login services.
const app = path.resolve(process.argv[2] || "");
assert.ok(process.argv[2] && app.endsWith(".app"), "Pass the packaged OpenBot.app path.");
const signature = spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
assert.equal(signature.status, 0, signature.stderr || "The copied app's resource seal is invalid.");
const runtime = path.join(app, "Contents/Resources/OpenBotRuntime");
const manifest = JSON.parse(readFileSync(path.join(runtime, "runtime-manifest.json"), "utf8"));
const appVersion = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(app, "Contents/Info.plist")], { encoding: "utf8" });
assert.equal(appVersion.status, 0); assert.equal(manifest.version, appVersion.stdout.trim(), "The native app and its embedded server must have the same version.");
assert.equal(JSON.parse(readFileSync(path.join(runtime, "package.json"), "utf8")).version, manifest.version);
assert.equal(manifest.architecture, process.arch);
assert.ok(existsSync(path.join(runtime, "licenses/OpenCode-LICENSE.txt")));
assert.ok(existsSync(path.join(runtime, "licenses/Node-LICENSE.txt")));
assert.match(readFileSync(path.join(runtime, "LICENSE"), "utf8"), /^MIT License/);
assert.match(readFileSync(path.join(runtime, "THIRD_PARTY_NOTICES.md"), "utf8"), /^# Third-party notices/);
assert.match(readFileSync(path.join(runtime, "skills/bundled/LICENSE"), "utf8"), /MIT License/);
assert.match(readFileSync(path.join(runtime, "skills/bundled/licenses/SECURITY-GUIDANCE-APACHE-2.0.txt"), "utf8"), /Apache License/);
assert.ok(readFileSync(path.join(runtime, "skills/bundled/licenses/SECURITY-GUIDANCE-NOTICE.txt"), "utf8").trim().length > 100, "The security-guidance adaptation notice must ship with its license.");
assert.equal(createHash("sha256").update(readFileSync(path.join(runtime, "package-lock.json"))).digest("hex"), manifest.packageLockSHA256);
for (const resource of ["", "bin", "bin/node", "bin/opencode", "licenses", "licenses/Node-LICENSE.txt", "runtime-manifest.json"]) {
  const mode = statSync(path.join(runtime, resource)).mode;
  assert.ok(mode & 0o004, `Packaged code must be readable by another Mac account: ${resource}`);
  if (resource === "" || resource === "bin" || resource === "licenses" || resource.startsWith("bin/")) assert.ok(mode & 0o001, `Packaged directories and executables must be traversable by another Mac account: ${resource}`);
}
assert.ok(!existsSync(path.join(runtime, ".env")));
assert.ok(!existsSync(path.join(runtime, ".openbot")));
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const data = mkdtempSync(path.join(tmpdir(), "openbot-packaged-test-"));
const fixtureHome = path.join(data, "fixture-home");
mkdirSync(fixtureHome);
const environment = {
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  HOME: fixtureHome,
  XDG_CONFIG_HOME: path.join(fixtureHome, ".config"),
  XDG_DATA_HOME: path.join(fixtureHome, ".local/share"),
  XDG_CACHE_HOME: path.join(fixtureHome, ".cache"),
  TMPDIR: tmpdir(),
  OPENBOT_LOAD_ENV: "0",
  OPENBOT_DATA_DIR: data,
  OPENBOT_PORT: String(port),
  OPENBOT_HOST: "127.0.0.1",
};
const base = `http://127.0.0.1:${port}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child;
let closed;
let eventReader;
try {
  const modelRuntime = spawnSync(path.join(runtime, "bin/opencode"), ["--version"], { env: environment, encoding: "utf8", timeout: 10_000 });
  assert.equal(modelRuntime.status, 0);
  assert.equal(modelRuntime.stdout.trim(), manifest.openCodeVersion);
  child = spawn(path.join(runtime, "bin/node"), [path.join(runtime, "scripts/background-runner.mjs")], {
    cwd: runtime,
    env: environment,
    stdio: "ignore",
  });
  closed = once(child, "close");
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(child.exitCode, null, "The packaged runner exited before becoming ready.");
    try {
      const response = await fetch(`${base}/api/healthz`, { signal: AbortSignal.timeout(500) });
      const health = await response.json();
      if (response.ok) assert.equal(health.version, manifest.version);
      healthy = response.ok && health.ok && health.runner === "online";
      if (healthy) break;
    } catch { /* Starting up. */ }
    await pause(500);
  }
  assert.ok(healthy, "The bundled launcher must start a healthy runner without shell Node or tsx.");
  const initial = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(initial.bots, [], "A first install must not fabricate teammates or select a provider.");
  assert.deepEqual(initial.studioRuns, [], "A first install must not start model work.");
  const fixture = spawnSync(path.join(runtime, "bin/node"), ["--import", "tsx", "--input-type=module", "--eval", `
    import { OpenBotDatabase } from './src/server/database.ts';
    const db = new OpenBotDatabase(process.cwd());
    try {
      const bot = db.createBot({ name: 'Package fixture', role: 'Test only', instructions: 'Synthetic test only', emoji: '●', color: '#6757d9', browserEnabled: false, computerEnabled: false });
      process.stdout.write(JSON.stringify({ id: bot.id, threadId: bot.threadId }));
    } finally { db.close(); }
  `], { cwd: runtime, env: environment, encoding: "utf8", timeout: 10_000 });
  assert.equal(fixture.status, 0, fixture.stderr);
  const fixtureBot = JSON.parse(fixture.stdout);
  const beforeChoice = await fetch(`${base}/api/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: fixtureBot.threadId, body: "Synthetic check: do not run a model" }) });
  assert.equal(beforeChoice.status, 409, "The packaged host must require an explicit provider before a first model run.");
  assert.equal((await beforeChoice.json()).code, "provider_choice_required");
  const fixtureState = await (await fetch(`${base}/api/state`)).json();
  assert.equal(fixtureState.bots[0].providerInstanceId, null);
  assert.equal(fixtureState.bots[0].model, "");
  assert.equal(fixtureState.studioRuns.length, 0);
  const recipes = await (await fetch(`${base}/api/recipes?botId=${fixtureBot.id}`)).json();
  assert.equal(recipes.recipes.length, 6, "The packaged host must include the shared recipe catalog.");
  const note = await fetch(`${base}/api/extensions/memory/${fixtureBot.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "Package fixture", content: "Synthetic note only", expiresAt: null }) });
  assert.equal(note.status, 200);
  const notes = await (await fetch(`${base}/api/extensions/memory/${fixtureBot.id}`)).json();
  assert.equal(notes[0].source, "owner"); assert.ok(notes[0].revision);
  const stale = await fetch(`${base}/api/extensions/memory/${fixtureBot.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "Package fixture", content: "No revision" }) });
  assert.equal(stale.status, 400, "The packaged API must protect notes from stale clients.");
  assert.ok(existsSync(path.join(data, "openbot.sqlite")));
  assert.ok(existsSync(path.join(data, "access.token")));
  const page = await fetch(base);
  assert.ok(page.ok && (await page.text()).includes('<div id="root">'), "The packaged production UI must be served.");
  const studio = await fetch(`${base}/studio.html`);
  assert.ok(studio.ok && (await studio.text()).includes('<div id="root">'), "The conversation-first studio must ship in the app too.");
  const extensions = await fetch(`${base}/api/extensions`);
  assert.match(extensions.headers.get("content-type"), /application\/json/);
  const library = await extensions.json();
  assert.deepEqual(library.connections, []);
  assert.equal(library.skills.length, 7);
  assert.ok(library.skills.every((skill) => skill.bundled && skill.botIds.includes(fixtureBot.id)));
  const missing = await fetch(`${base}/api/no-such-openbot-endpoint`);
  assert.equal(missing.status, 404); assert.ok((await missing.json()).error);
  assert.ok(existsSync(path.join(runtime, "src/server/extension-schema-worker.mjs")));
  const events = await fetch(`${base}/api/events`);
  eventReader = events.body.getReader();
  assert.match(new TextDecoder().decode((await eventReader.read()).value), /connected/);
  console.log(`PASS: OpenBot ${manifest.version} ${manifest.architecture} packaged runner started with isolated home/data and a system-only PATH; empty first launch, explicit provider gate, both production UIs, recipes, protected memory, extensions API and JSON 404 verified. No model request, owner account or login-service change.`);
} finally {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  if (closed) await Promise.race([closed, pause(6000).then(() => { if (child.exitCode === null) throw new Error("Packaged runner did not shut down; temporary data retained."); })]);
  let online = false;
  try { online = (await fetch(`${base}/api/healthz`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Expected after shutdown. */ }
  assert.ok(!online, "Packaged child server survived shutdown; temporary data retained.");
  if (eventReader) {
    await Promise.race([(async () => { while (!(await eventReader.read()).done) { /* Drain final status events. */ } })(), pause(1000).then(() => { throw new Error("Live event connection survived shutdown."); })]);
    console.log("PASS: packaged runner exits cleanly with a live event connection still open.");
  }
  rmSync(data, { recursive: true, force: true });
}
