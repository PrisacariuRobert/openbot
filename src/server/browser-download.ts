import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Express } from "express";

/** A private browser for teammates when this computer has no Chrome, Edge or
 * Brave: Playwright's Chrome for Testing, downloaded into Sidemates' data folder
 * on the owner's click. Nothing is downloaded otherwise. */

export type BrowserDownloadState = "idle" | "downloading" | "ready" | "failed";

/** Where Chrome for Testing puts its program inside a `chromium-<revision>` folder, per platform. */
const EXECUTABLES: Record<string, string[]> = {
  darwin: [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: ["chrome-linux64/chrome", "chrome-linux/chrome"],
  win32: ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"],
};

/** The downloaded browser's program, newest revision first, or null. */
export function managedBrowserExecutable(dir: string, platform: NodeJS.Platform = process.platform, exists: (file: string) => boolean = existsSync): string | null {
  let folders: string[];
  try { folders = readdirSync(dir).filter((name) => /^chromium-\d+$/.test(name)); } catch { return null; }
  folders.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const folder of folders) {
    for (const relative of EXECUTABLES[platform] ?? []) {
      const candidate = path.join(dir, folder, relative);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/** Playwright's installer, next to its package.json (cli.js isn't in the package's exports, so it can't be resolved directly). */
export function playwrightCli(): string {
  const cli = path.join(path.dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "cli.js");
  if (!existsSync(cli)) throw new Error("Playwright's installer is missing.");
  return cli;
}

export type DownloadSpawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export class ManagedBrowser {
  private state: BrowserDownloadState = "idle";
  private error: string | null = null;
  private child: ChildProcess | null = null;

  constructor(
    readonly dir: string,
    private readonly options: { spawnProcess?: DownloadSpawn; cliPath?: string; platform?: NodeJS.Platform; exists?: (file: string) => boolean } = {},
  ) {}

  executable(): string | null {
    return managedBrowserExecutable(this.dir, this.options.platform, this.options.exists);
  }

  status(systemBrowser: boolean) {
    const ready = Boolean(this.executable());
    return { systemBrowser, downloaded: ready, state: ready ? "ready" as const : this.state, error: this.error };
  }

  /** Starts the download once; a second call while it runs does nothing. */
  start(): BrowserDownloadState {
    if (this.executable()) return (this.state = "ready");
    if (this.state === "downloading") return this.state;
    this.state = "downloading";
    this.error = null;
    let cli: string;
    try { cli = this.options.cliPath ?? playwrightCli(); } catch { return this.fail("The browser download couldn't start."); }
    // Only what the download needs; the skip flag set for development installs must not stop the owner's own request.
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY, NO_PROXY: process.env.NO_PROXY, NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS, PLAYWRIGHT_BROWSERS_PATH: this.dir };
    for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
    let stderr = "";
    try {
      this.child = (this.options.spawnProcess ?? spawn)(process.execPath, [cli, "install", "--no-shell", "chromium"], { env, stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      return this.fail("The browser download couldn't start.");
    }
    this.child.stderr?.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-2_000); });
    this.child.on("error", () => this.fail("The browser download couldn't start."));
    this.child.on("close", (code) => {
      this.child = null;
      if (code === 0 && this.executable()) { this.state = "ready"; return; }
      this.fail(/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|socket|proxy/i.test(stderr)
        ? "The browser couldn't be downloaded: this computer couldn't reach the download server. Check the internet connection and try again."
        : /ENOSPC|no space/i.test(stderr) ? "The browser couldn't be downloaded: there isn't enough free disk space." : "The browser download didn't finish. Try again.");
    });
    return this.state;
  }

  private fail(message: string): BrowserDownloadState {
    this.state = "failed";
    this.error = message;
    return this.state;
  }
}

export function registerBrowserDownloadRoutes(app: Express, managed: ManagedBrowser, systemBrowser: () => boolean) {
  app.get("/api/browser/download", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(managed.status(systemBrowser()));
  });
  app.post("/api/browser/download", (_request, response) => {
    if (systemBrowser()) return response.status(409).json({ error: "This computer already has a browser your teammates can use." });
    managed.start();
    response.status(202).json(managed.status(false));
  });
}
