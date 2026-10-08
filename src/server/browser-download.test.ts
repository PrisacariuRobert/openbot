import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import express from "express";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { ManagedBrowser, managedBrowserExecutable, playwrightCli, registerBrowserDownloadRoutes, type DownloadSpawn } from "./browser-download.js";
import { chromePath } from "./runtime.js";

function fakeChild() {
  const child = new EventEmitter() as ChildProcess & { finish: (code: number, stderr?: string) => void };
  const stderr = new PassThrough();
  Object.assign(child, { stderr });
  child.finish = (code, text = "") => { if (text) stderr.write(text); setImmediate(() => child.emit("close", code)); };
  return child;
}

function placeBrowser(dir: string, revision = "1200") {
  const file = path.join(dir, `chromium-${revision}`, "chrome-linux64", "chrome");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "");
  return file;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the downloaded browser is found per platform, newest revision first", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-managed-browser-"));
  try {
    assert.equal(managedBrowserExecutable(path.join(dir, "missing"), "linux"), null, "No folder yet");
    assert.equal(managedBrowserExecutable(dir, "linux"), null, "An empty folder");
    placeBrowser(dir, "1190");
    const newest = placeBrowser(dir, "1200");
    mkdirSync(path.join(dir, "chromium_headless_shell-1200"), { recursive: true });
    assert.equal(managedBrowserExecutable(dir, "linux"), newest);
    const mac = path.join(dir, "chromium-1200", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    assert.equal(managedBrowserExecutable(dir, "darwin", (file) => file === mac), mac, "Chrome for Testing on Apple silicon");
    assert.equal(managedBrowserExecutable(dir, "darwin", () => false), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Playwright's installer is found in the installed package", () => {
  assert.match(playwrightCli(), /playwright-core[\\/]cli\.js$/);
});

test("an installed browser wins; the downloaded one is the fallback", () => {
  assert.equal(chromePath("linux", {}, (file) => file === "/usr/bin/chromium", () => "/data/browsers/chrome"), "/usr/bin/chromium");
  assert.equal(chromePath("linux", {}, () => false, () => "/data/browsers/chrome"), "/data/browsers/chrome");
  assert.equal(chromePath("linux", {}, () => false, () => null), undefined);
});

test("the download runs Playwright's installer into the data folder, once, without the development skip flag", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-managed-browser-"));
  const calls: Array<{ command: string; args: string[]; options: SpawnOptions }> = [];
  const child = fakeChild();
  const spawnProcess: DownloadSpawn = (command, args, options) => { calls.push({ command, args, options }); return child; };
  const previous = process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  try {
    const managed = new ManagedBrowser(dir, { spawnProcess, cliPath: "/fake/playwright-core/cli.js", platform: "linux" });
    assert.deepEqual(managed.status(false), { systemBrowser: false, downloaded: false, state: "idle", error: null });
    assert.equal(managed.start(), "downloading");
    assert.equal(managed.start(), "downloading", "A second click while it runs");
    assert.equal(calls.length, 1, "One download");
    assert.equal(calls[0]!.command, process.execPath);
    assert.deepEqual(calls[0]!.args, ["/fake/playwright-core/cli.js", "install", "--no-shell", "chromium"]);
    assert.equal(calls[0]!.options.env?.PLAYWRIGHT_BROWSERS_PATH, dir);
    assert.equal(calls[0]!.options.env?.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, undefined);
    assert.equal(calls[0]!.options.env?.OPENBOT_DATA_DIR, undefined, "Nothing else from the server's environment");
    const file = placeBrowser(dir);
    child.finish(0);
    await settle(); await settle();
    assert.deepEqual(managed.status(false), { systemBrowser: false, downloaded: true, state: "ready", error: null });
    assert.equal(managed.executable(), file);
    assert.equal(managed.start(), "ready", "Nothing to do once it's there");
    assert.equal(calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD; else process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed download says why in plain words and can be tried again", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-managed-browser-"));
  try {
    const children: Array<ReturnType<typeof fakeChild>> = [];
    const managed = new ManagedBrowser(dir, { spawnProcess: () => { const child = fakeChild(); children.push(child); return child; }, cliPath: "/fake/cli.js", platform: "linux" });
    managed.start();
    children[0]!.finish(1, "Error: getaddrinfo ENOTFOUND cdn.playwright.dev");
    await settle(); await settle();
    assert.equal(managed.status(false).state, "failed");
    assert.match(managed.status(false).error!, /couldn't reach the download server/);
    managed.start();
    children[1]!.finish(1, "ENOSPC: no space left on device");
    await settle(); await settle();
    assert.match(managed.status(false).error!, /enough free disk space/);
    managed.start();
    children[2]!.finish(0);
    await settle(); await settle();
    assert.equal(managed.status(false).state, "failed", "A clean exit without a browser is not success");
    assert.match(managed.status(false).error!, /didn't finish/);
    const broken = new ManagedBrowser(dir, { spawnProcess: () => { throw new Error("spawn EACCES"); }, cliPath: "/fake/cli.js", platform: "linux" });
    assert.equal(broken.start(), "failed");
    assert.match(broken.status(false).error!, /couldn't start/);
    const erroring = new ManagedBrowser(dir, { spawnProcess: () => { const child = fakeChild(); setImmediate(() => child.emit("error", new Error("ENOENT"))); return child; }, cliPath: "/fake/cli.js", platform: "linux" });
    erroring.start();
    await settle();
    assert.equal(erroring.status(false).state, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the routes report status and refuse a download when a browser is installed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-managed-browser-"));
  let starts = 0, installed = true;
  const managed = new ManagedBrowser(dir, { spawnProcess: () => { starts++; return fakeChild(); }, cliPath: "/fake/cli.js", platform: "linux" });
  const app = express();
  registerBrowserDownloadRoutes(app, managed, () => installed);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/browser/download`;
  try {
    const status = await fetch(base);
    assert.equal(status.headers.get("cache-control"), "no-store");
    assert.deepEqual(await status.json(), { systemBrowser: true, downloaded: false, state: "idle", error: null });
    const refused = await fetch(base, { method: "POST" });
    assert.equal(refused.status, 409);
    assert.equal(starts, 0, "Nothing downloaded when it isn't needed");
    installed = false;
    const started = await fetch(base, { method: "POST" });
    assert.equal(started.status, 202);
    assert.equal(((await started.json()) as { state: string }).state, "downloading");
    assert.equal(starts, 1);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
