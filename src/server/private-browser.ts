import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** A browser for everyone: when the Mac has no Chrome, Edge or Brave, one tap
 * downloads a private Chromium (Chrome for Testing, about 150 MB) into
 * Sidemates' own data folder, used only by the teammates. */

export const privateBrowserDir = (dataDir: string) => path.join(dataDir, "browsers");

const EXECUTABLES: Record<string, string[]> = {
  darwin: ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"],
  linux: ["chrome-linux64/chrome", "chrome-linux/chrome"],
  win32: ["chrome-win64\\chrome.exe", "chrome-win\\chrome.exe"],
};

/** The downloaded browser, newest first, if there is one. */
export function privateBrowserPath(dataDir: string, platform: NodeJS.Platform = process.platform, exists: (file: string) => boolean = existsSync, list: (dir: string) => string[] = (dir) => readdirSync(dir)): string | undefined {
  const dir = privateBrowserDir(dataDir);
  let folders: string[];
  try { folders = list(dir).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])); } catch { return undefined; }
  for (const folder of folders) for (const executable of EXECUTABLES[platform] || []) {
    const candidate = path.join(dir, folder, executable);
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

export type InstallStatus = { state: "idle" | "downloading" | "done" | "failed"; detail: string };

export class PrivateBrowserInstall {
  private status: InstallStatus = { state: "idle", detail: "" };
  private child: ChildProcess | null = null;
  constructor(private readonly options: { dataDir: string; onDone: (executable: string | undefined) => void; spawnProcess?: typeof spawn }) {}

  current(): InstallStatus { return this.status; }

  start(): InstallStatus {
    if (this.status.state === "downloading") return this.status;
    const cli = path.join(path.dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "cli.js");
    this.status = { state: "downloading", detail: "Downloading a private browser (about 150 MB)…" };
    const child = (this.options.spawnProcess || spawn)(process.execPath, [cli, "install", "--no-shell", "chromium"], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: privateBrowserDir(this.options.dataDir) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    let tail = "";
    const keep = (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-2_000);
      const percent = /(\d{1,3})%/.exec(tail.split("\n").filter(Boolean).at(-1) || "")?.[1];
      if (percent) this.status = { state: "downloading", detail: `Downloading a private browser… ${percent}%` };
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.on("error", () => { this.status = { state: "failed", detail: "The browser download couldn't start. Check your internet connection and try again." }; });
    child.on("close", (code) => {
      this.child = null;
      const executable = code === 0 ? privateBrowserPath(this.options.dataDir) : undefined;
      this.status = executable
        ? { state: "done", detail: "Your teammates have their own browser now." }
        : { state: "failed", detail: "The browser download didn't finish. Check your internet connection and try again." };
      this.options.onDone(executable);
    });
    return this.status;
  }

  stop() { this.child?.kill("SIGTERM"); }
}
