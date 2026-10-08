import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import path from "node:path";
import test from "node:test";
import type { ChildProcess, spawn } from "node:child_process";
import { privateBrowserDir, privateBrowserPath, PrivateBrowserInstall } from "./private-browser.js";
import { chromeCandidates } from "./runtime.js";

test("the downloaded browser is found, newest first, and only used when the Mac has none", () => {
  const dataDir = "/data";
  const files = new Set([path.join(privateBrowserDir(dataDir), "chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"), path.join(privateBrowserDir(dataDir), "chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")]);
  const found = privateBrowserPath(dataDir, "darwin", (file) => files.has(file), () => ["chromium-1228", "chromium-1234", "ffmpeg-1011"]);
  assert.match(found || "", /chromium-1234/);
  assert.equal(privateBrowserPath(dataDir, "darwin", () => false, () => { throw new Error("missing"); }), undefined);
  const candidates = chromeCandidates("darwin", { OPENBOT_PRIVATE_BROWSER: found });
  assert.equal(candidates.at(-1), found, "the owner's own browser always wins");
  assert.equal(candidates[0], "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
});

test("one tap downloads Chromium into Sidemates' own folder and reports when it's ready", async () => {
  let spawned: { args: string[]; env: NodeJS.ProcessEnv } | null = null;
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true }) as unknown as ChildProcess;
  let done: string | undefined | null = null;
  const install = new PrivateBrowserInstall({
    dataDir: "/nowhere", onDone: (executable) => { done = executable; },
    spawnProcess: ((_command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => { spawned = { args, env: options.env }; return child; }) as unknown as typeof spawn,
  });
  assert.equal(install.start().state, "downloading");
  assert.deepEqual(spawned!.args.slice(1), ["install", "--no-shell", "chromium"], "the browser only, not the extra headless copy");
  assert.equal(spawned!.env.PLAYWRIGHT_BROWSERS_PATH, path.join("/nowhere", "browsers"));
  child.stdout!.emit("data", Buffer.from("Downloading Chrome for Testing 151 |■■■■     | 42% of 150 MiB\n"));
  assert.match(install.current().detail, /42%/);
  assert.equal(install.start().state, "downloading", "a second tap doesn't start a second download");
  child.emit("close", 1);
  assert.equal(install.current().state, "failed");
  assert.equal(done, undefined);
});
