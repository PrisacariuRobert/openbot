import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Boot only the server from the exact runtime embedded in a native package.
// This intentionally uses no fixture bot, provider, connector, browser, or model action.
const runtimeArg = process.argv[2] === "--runtime" ? process.argv[3] : null;
if (!runtimeArg || process.argv.length !== 4 || !path.isAbsolute(runtimeArg)) {
  throw new Error("Usage: node scripts/smoke-packaged-runtime.mjs --runtime /absolute/path/Contents/Resources/OpenBotRuntime");
}
const runtime = path.resolve(runtimeArg);
const node = path.join(runtime, "bin", "node");
const tsx = path.join(runtime, "node_modules", "tsx");
assert.ok(existsSync(node), `Packaged runtime is missing bundled bin/node: ${node}`);
assert.ok(existsSync(tsx), `Packaged runtime is missing node_modules/tsx: ${tsx}`);
assert.ok(existsSync(path.join(runtime, "src", "server", "index.ts")), "Packaged runtime is missing the server entrypoint.");
const manifestPath = path.join(runtime, "runtime-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;

const listener = createServer();
await new Promise((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const address = listener.address();
assert.ok(address && typeof address === "object");
const port = address.port;
await new Promise((resolve) => listener.close(resolve));

const dataDir = mkdtempSync(path.join(tmpdir(), "openbot-packaged-runtime-smoke-"));
// Drop inherited OpenBot configuration so this check cannot attach to live data or a relay.
// HOME is deliberately inherited; this test uses OPENBOT_DATA_DIR for all studio state.
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("OPENBOT_") && key !== "NODE_OPTIONS" && key !== "NODE_PATH"));
Object.assign(environment, {
  OPENBOT_LOAD_ENV: "0",
  OPENBOT_SEED_STARTER_BOTS: "0",
  OPENBOT_DATA_DIR: dataDir,
  OPENBOT_PORT: String(port),
  OPENBOT_HOST: "127.0.0.1",
  NODE_ENV: "production",
});
const base = `http://127.0.0.1:${port}`;
const child = spawn(node, ["--import", "tsx", "src/server/index.ts"], {
  cwd: runtime,
  env: environment,
  stdio: ["ignore", "ignore", "pipe"],
});
let stderr = "";
let spawnError;
child.once("error", (error) => { spawnError = error; });
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8_000); });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = async (pathname) => fetch(`${base}${pathname}`, { signal: AbortSignal.timeout(750) });
try {
  let health;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    assert.equal(spawnError, undefined, `Could not spawn packaged server: ${spawnError?.message}`);
    assert.equal(child.exitCode, null, `Packaged server exited before readiness.\n${stderr}`);
    try {
      const response = await request("/api/healthz");
      if (response.ok) { health = await response.json(); break; }
    } catch { /* Server is still starting. */ }
    await pause(250);
  }
  assert.ok(health?.ok, `Packaged server did not become healthy.\n${stderr}`);
  assert.equal(health.runner, "online");
  const stateResponse = await request("/api/state");
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  for (const field of ["bots", "runs", "studioRuns", "routines", "messages"]) {
    assert.ok(Array.isArray(state[field]), `Packaged state must expose state.${field}.`);
    assert.deepEqual(state[field], [], `First launch state.${field} must be empty.`);
  }
  assert.ok(state.settings && typeof state.settings === "object", "Packaged state must expose settings.");
  assert.equal(state.settings.yoloMode, false, "YOLO mode must default off.");
  assert.equal(state.settings.macAccessEnabled, false, "Mac access must default off.");
  const rootResponse = await request("/");
  assert.equal(rootResponse.status, 200);
  const root = await rootResponse.text();
  assert.match(root, /<div id=["']root["']>/, "Packaged root must serve the built app shell.");
  const asset = root.match(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/)?.[1];
  assert.ok(asset, "Packaged root must reference real built assets.");
  const assetResponse = await request(asset);
  assert.equal(assetResponse.status, 200, `Built asset ${asset} must be served by the packaged runtime.`);
  assert.ok((await assetResponse.arrayBuffer()).byteLength > 0, `Built asset ${asset} must not be empty.`);
  console.log(`PASS: packaged runtime${manifest?.version ? ` ${manifest.version}` : ""} booted with isolated data; health, empty state, safe gates, and built root verified.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${message}${stderr ? `\nPackaged server stderr:\n${stderr}` : ""}`);
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("close", resolve)), pause(5_000)]);
  }
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("close", resolve));
  }
  rmSync(dataDir, { recursive: true, force: true });
}
