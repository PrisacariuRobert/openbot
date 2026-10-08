#!/usr/bin/env node
// Task R4: `npx sidemates` runs the studio without the app wrapper (Node 22.13 or later).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const help = `Usage: npx sidemates [--port 4311] [--data-dir <folder>]

Runs the Sidemates studio on this computer at http://127.0.0.1:<port>.
  --port       the port (default 4311, or OPENBOT_PORT)
  --data-dir   where teammates, chats and files live (default ~/.openbot, or OPENBOT_DATA_DIR;
               the Mac app uses the same folder, so run one or the other)
It listens on this computer only. Press Control+C to stop it.`;

function fail(message, code = 2) { console.error(message); process.exit(code); }
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) fail(`Sidemates needs Node 22.13 or later; this is Node ${process.versions.node}.`, 1);

const options = {};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") { console.log(help); process.exit(0); }
  if (arg === "--port" || arg === "--data-dir") {
    const next = args[index + 1];
    if (!next || next.startsWith("-")) fail(`${arg} needs a value.\n\n${help}`);
    options[arg] = next; index += 1; continue;
  }
  fail(`Unknown option: ${arg}\n\n${help}`);
}
const port = options["--port"] ?? process.env.OPENBOT_PORT ?? "4311";
if (!/^\d{2,5}$/.test(port) || Number(port) > 65_535) fail("Choose a port number between 10 and 65535.");
if (!existsSync(path.join(root, "dist", "index.html"))) fail("This copy of Sidemates has no built studio (dist/). Run npm run build first.", 1);

// Without a data folder the server would keep everything inside this package, which npx may delete.
const dataDir = options["--data-dir"] ? path.resolve(options["--data-dir"]) : process.env.OPENBOT_DATA_DIR || path.join(os.homedir(), ".openbot");
const env = { ...process.env, NODE_ENV: "production", OPENBOT_PORT: port, OPENBOT_HOST: process.env.OPENBOT_HOST || "127.0.0.1", OPENBOT_DATA_DIR: dataDir };
// The server runs from its TypeScript source through tsx, as the app does.
const child = spawn(process.execPath, ["--import", "tsx", path.join(root, "src", "server", "index.ts")], { cwd: root, env, stdio: "inherit" });
console.log(`Sidemates is starting at http://127.0.0.1:${port} …`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
