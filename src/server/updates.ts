import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Once a day, ask GitHub for the newest release. Installed copies (from the
 * one-line installer) update in one tap: the installer runs again in the
 * background, verifies the download, switches versions and restarts
 * Sidemates. Source checkouts are only told that a new version exists. */

const REPO = "PrisacariuRobert/sidemates";
const DAY = 24 * 60 * 60_000;

export interface UpdateStatus {
  current: string;
  latest: string | null;
  available: boolean;
  notesUrl: string | null;
  canInstall: boolean;
  installing: boolean;
  checkedAt: string | null;
}

/** 0.37.0-beta.1 < 0.37.0 < 0.38.0-beta.1 */
export function newerVersion(latest: string, current: string): boolean {
  const parse = (value: string) => {
    const [core, pre = ""] = value.replace(/^v/, "").split("-", 2) as [string, string?];
    const numbers = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
    const preNumber = pre ? Number.parseInt(pre.replace(/\D+/g, ""), 10) || 0 : Infinity;
    return { numbers, pre, preNumber };
  };
  const a = parse(latest), b = parse(current);
  for (let i = 0; i < 3; i++) if ((a.numbers[i] || 0) !== (b.numbers[i] || 0)) return (a.numbers[i] || 0) > (b.numbers[i] || 0);
  if (!a.pre && b.pre) return true;
  if (a.pre && !b.pre) return false;
  return a.preNumber > b.preNumber;
}

/** True when this process runs from the installer's versions folder. The old
 * "OpenBot" folder counts too, for a copy that has not been moved yet. */
export function installedCopy(cwd = process.cwd(), home = homedir()): boolean {
  return ["Sidemates", "OpenBot"].some((name) => {
    const current = path.join(home, "Library", "Application Support", name, "current");
    try { return existsSync(current) && realpathSync(cwd).startsWith(realpathSync(current)); } catch { return false; }
  });
}

export class UpdateChecker {
  private latest: string | null = null;
  private notesUrl: string | null = null;
  private checkedAt: number | null = null;
  private installing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: { current: string; fetchImpl?: typeof fetch; installed?: () => boolean; now?: () => number }) {}

  private now() { return (this.options.now || Date.now)(); }

  status(): UpdateStatus {
    const available = Boolean(this.latest && newerVersion(this.latest, this.options.current));
    return {
      current: this.options.current,
      latest: this.latest,
      available,
      notesUrl: this.notesUrl,
      canInstall: available && (this.options.installed || installedCopy)(),
      installing: this.installing,
      checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
    };
  }

  async check(): Promise<UpdateStatus> {
    try {
      const response = await (this.options.fetchImpl || fetch)(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "Sidemates" }, signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const release = await response.json() as { tag_name?: string; html_url?: string; draft?: boolean };
        if (release.tag_name && !release.draft) { this.latest = release.tag_name.replace(/^v/, ""); this.notesUrl = release.html_url || null; }
      }
      this.checkedAt = this.now();
    } catch { /* Offline: try again tomorrow. */ }
    return this.status();
  }

  start() {
    if (this.timer || process.env.OPENBOT_UPDATE_CHECK === "0") return;
    void this.check();
    this.timer = setInterval(() => void this.check(), DAY);
    this.timer.unref();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Runs the installer detached, in its own process group, so it survives
   * the restart it causes. */
  install(spawnImpl: typeof spawn = spawn): UpdateStatus {
    const status = this.status();
    if (!status.canInstall) throw new Error(status.available ? "This copy runs from source. Update it with git pull." : "Sidemates is already up to date.");
    if (this.installing) return status;
    this.installing = true;
    const child = spawnImpl("/bin/sh", ["-c", "curl -fsSL https://sidemates.app/install.sh | sh"], {
      detached: true, stdio: "ignore",
      env: { ...process.env, OPENBOT_INSTALL_NO_OPEN: "1", OPENBOT_INSTALL_NO_DOCK: "1" },
    });
    child.on("exit", () => { this.installing = false; });
    child.unref();
    return this.status();
  }
}
