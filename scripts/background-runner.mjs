import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.OPENBOT_PORT || 4311);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function existingStudio() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };
    const identity = process.env.OPENBOT_DESKTOP_INSTANCE_ID || "";
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/healthz", headers: identity ? { "x-openbot-desktop-identity": identity } : {} }, (response) => {
      response.resume();
      finish(identity && response.headers["x-openbot-desktop-match"] !== "1" ? "other" : "match");
    });
    request.on("error", () => finish("none"));
    request.setTimeout(2_000, () => { request.destroy(); finish("none"); });
  });
}

let missed = 0;
while (missed < 3) {
  const state = await existingStudio();
  if (state === "match") process.exit(0);
  if (state === "other") {
    console.error(`Another studio or service is using http://127.0.0.1:${port}. Choose a free OPENBOT_PORT.`);
    process.exit(2);
  }
  missed += 1;
  if (missed < 3) await wait(2_000);
}

const tsx = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const server = path.join(rootDir, "src", "server", "index.ts");
const child = spawn(process.execPath, [tsx, server], {
  cwd: rootDir,
  env: { ...process.env, PATH: [path.join(rootDir, "bin"), process.env.PATH || "/usr/bin:/bin"].join(path.delimiter), NODE_ENV: "production", OPENBOT_HOST: process.env.OPENBOT_HOST || "127.0.0.1", OPENBOT_PORT: String(port) },
  stdio: "inherit",
  detached: true,
});

let stopping = false;
function stopServerGroup(signal) {
  if (stopping) return;
  stopping = true;
  try { process.kill(-child.pid, signal); }
  catch { /* The child may already have finished. */ }
  const force = setTimeout(() => {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch { /* The complete process group is already gone. */ }
    process.exit(0);
  }, 4_000);
  force.unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stopServerGroup(signal));
child.on("exit", (code, signal) => process.exit(stopping ? 0 : signal ? 1 : code ?? 1));
