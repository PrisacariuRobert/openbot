import { spawn, type ChildProcess } from "node:child_process";
import type { OpenBotDatabase } from "./database.js";

const LEAD_MS = 3 * 60_000;
const OVERDUE_GRACE_MS = 10 * 60_000;

/** Keeps a Mac from idle-sleeping while teammates have work: a task is
 * active, or a clock routine is due within a few minutes. It holds the
 * standard `caffeinate -i` assertion (what downloads and calls use), tied
 * to this process so it can never outlive OpenBot, and releases it when
 * idle. It changes no system setting; closing the lid still sleeps the Mac.
 * Set OPENBOT_KEEP_AWAKE=0 to turn it off. */
export class AwakeGuard {
  private child: ChildProcess | null = null;
  private timer: NodeJS.Timeout | null = null;
  private reason: string | null = null;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    platform?: NodeJS.Platform;
    spawnImpl?: typeof spawn;
    now?: () => number;
    enabled?: () => boolean;
  }) {}

  private get enabled() {
    return (this.options.platform || process.platform) === "darwin" && process.env.OPENBOT_KEEP_AWAKE !== "0" && (this.options.enabled?.() ?? true);
  }

  /** Why the Mac is being kept awake right now, or null. */
  status() { return { holding: Boolean(this.child), reason: this.reason }; }

  tick() {
    const wanted = this.enabled ? this.wantedReason() : null;
    this.reason = wanted;
    if (wanted && !this.child) {
      const child = (this.options.spawnImpl || spawn)("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
      child.on("exit", () => { if (this.child === child) this.child = null; });
      child.on("error", () => { if (this.child === child) this.child = null; });
      this.child = child;
    } else if (!wanted && this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  private wantedReason(): string | null {
    if (this.options.db.hasActiveWork()) return "A teammate is working.";
    const next = this.options.db.nextScheduledRoutineAt();
    const now = (this.options.now || Date.now)();
    const at = next ? Date.parse(next) : NaN;
    if (Number.isFinite(at) && at <= now + LEAD_MS && at >= now - OVERDUE_GRACE_MS) return "An automation is about to run.";
    return null;
  }

  start(intervalMs = 15_000) {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.child?.kill();
    this.child = null;
    this.reason = null;
  }
}
