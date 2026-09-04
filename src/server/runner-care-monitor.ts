import type { RunnerCareSnapshot, RunnerHealthAlerts } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

const DEFAULT_INTERVAL_MS = 15 * 60_000;
const REPEAT_ALERT_MS = 24 * 60 * 60_000;

export class RunnerCareMonitor {
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    inspect: () => Promise<RunnerCareSnapshot>;
    canCheck?: () => boolean;
    destinationCount?: () => number;
    wakeNotifications?: () => void;
    now?: () => number;
    intervalMs?: number;
  }) {}

  start() {
    if (this.timer) return;
    const checkQuietly = () => void this.checkNow().catch(() => undefined);
    this.timer = setInterval(checkQuietly, this.options.intervalMs || DEFAULT_INTERVAL_MS);
    checkQuietly();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): RunnerHealthAlerts {
    const state = this.options.db.getRunnerHealthMonitorState();
    const destinationCount = Math.max(0, this.options.destinationCount?.() || 0);
    return {
      enabled: state.enabled,
      intervalMinutes: Math.round((this.options.intervalMs || DEFAULT_INTERVAL_MS) / 60_000),
      destinationCount,
      deliveryReady: destinationCount > 0,
      lastCheckedAt: state.lastCheckedAt,
      lastNotifiedAt: state.lastNotifiedAt,
      lastStatus: state.lastStatus,
    };
  }

  setEnabled(enabled: boolean): RunnerHealthAlerts {
    this.options.db.setRunnerHealthAlertsEnabled(enabled);
    return this.status();
  }

  async checkNow(): Promise<RunnerCareSnapshot | null> {
    if (this.checking || this.options.canCheck?.() === false || !this.status().enabled) return null;
    this.checking = true;
    try {
      const result = await this.options.inspect();
      const previous = this.options.db.getRunnerHealthMonitorState();
      const attention = result.checks.filter((check) => check.status === "attention");
      const signature = attention.map((check) => check.id).sort().join(",");
      const nowMs = this.options.now?.() ?? Date.now();
      const checkedAt = new Date(nowMs).toISOString();
      const lastNotifiedMs = previous.lastNotifiedAt ? Date.parse(previous.lastNotifiedAt) : 0;
      const shouldRepeat = !Number.isFinite(lastNotifiedMs) || nowMs - lastNotifiedMs >= REPEAT_ALERT_MS;
      let notifiedAt: string | undefined;

      if (attention.length > 0 && (previous.lastStatus !== "attention" || previous.lastSignature !== signature || shouldRepeat)) {
        const labels = attention.slice(0, 3).map((check) => check.label);
        const extra = attention.length > labels.length ? ` and ${attention.length - labels.length} more` : "";
        this.options.db.enqueueNotification({
          dedupeKey: `runner-health:${checkedAt}:${signature}`,
          kind: "runner_health_attention",
          title: "Your private home needs attention",
          body: `${labels.join(", ")}${extra} ${attention.length === 1 ? "needs" : "need"} a quick check.`,
          url: "/?panel=routines",
        });
        notifiedAt = checkedAt;
      } else if (attention.length === 0 && previous.lastStatus === "attention") {
        this.options.db.enqueueNotification({
          dedupeKey: `runner-health-recovered:${checkedAt}`,
          kind: "runner_health_recovered",
          title: "Your private home is healthy again",
          body: "Storage, backups, tools, browser, and bot computers are ready.",
          url: "/?panel=routines",
        });
        notifiedAt = checkedAt;
      }

      this.options.db.recordRunnerHealthMonitorResult({
        checkedAt,
        status: attention.length > 0 ? "attention" : "ready",
        signature,
        ...(notifiedAt ? { notifiedAt } : {}),
      });
      if (notifiedAt) this.options.wakeNotifications?.();
      return result;
    } finally {
      this.checking = false;
    }
  }
}
