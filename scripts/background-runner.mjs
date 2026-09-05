import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.OPENBOT_PORT || 4311);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function serverIsAwake() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const deadline = setTimeout(() => finish(false), 2_000);
    const finish = (awake) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(awake);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

let missed = 0;
while (missed < 3) {
  if (await serverIsAwake()) missed = 0;
  else missed += 1;
  if (missed < 3) await wait(2_000);
}

const tsx = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const server = path.join(rootDir, "src", "server", "index.ts");
const child = spawn(process.execPath, [tsx, server], {
  cwd: rootDir,
  env: { ...process.env, NODE_ENV: "production", OPENBOT_BACKGROUND_SERVICE: "1", OPENBOT_HOST: "0.0.0.0", OPENBOT_PORT: String(port) },
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
