import { isLocalModelUrl } from "./provider-config.js";
import type { ProviderInstance } from "./types.js";

/** The setup timeline: how a new owner's first days went. It is kept on the
 * owner's Mac and shown in Settings → Your setup; nothing here is sent. */
export const SETUP_MILESTONES = [
  { name: "installed", label: "Sidemates started for the first time" },
  { name: "studio_opened", label: "Opened the studio" },
  { name: "ai_connected", label: "Connected an AI" },
  { name: "first_teammate", label: "Made the first teammate" },
  { name: "first_answer", label: "Got the first answer" },
  { name: "first_job", label: "A teammate finished a job" },
  { name: "returned_next_day", label: "Came back the next day" },
  { name: "returned_within_week", label: "Came back within a week" },
] as const;

export type SetupMilestoneName = typeof SETUP_MILESTONES[number]["name"];

/** Milestones seen only as they happen (no record proves them later), so a studio older than the timeline can't know them. */
export const OBSERVED_MILESTONES: ReadonlyArray<SetupMilestoneName> = ["studio_opened", "ai_connected", "returned_next_day", "returned_within_week"];

/** The kind of AI, never the account, key or model. */
export const SETUP_AI_KINDS = {
  gemini: "Gemini",
  chatgpt: "ChatGPT",
  claude: "Claude",
  copilot: "GitHub Copilot",
  grok: "Grok",
  gitlab: "GitLab Duo",
  opencode: "OpenCode",
  nous: "Nous Portal",
  local: "A model on this Mac",
  api: "Another API",
} as const;

export type SetupAiKind = keyof typeof SETUP_AI_KINDS;

/** How Sidemates was installed (task A8), shown on "Installed". */
export const INSTALL_METHODS = { terminal: "with the one-line install", "disk-image": "from the disk image" } as const;
export type InstallMethod = keyof typeof INSTALL_METHODS;
export const installMethod = (value: string | undefined): InstallMethod | null => value && Object.hasOwn(INSTALL_METHODS, value) ? value as InstallMethod : null;

export function setupAiKind(connection: Pick<ProviderInstance, "id" | "provider" | "apiConfig">): SetupAiKind {
  switch (connection.provider) {
    case "google": return "gemini";
    case "openai": return "chatgpt";
    case "claude": return "claude";
    case "github-copilot": return "copilot";
    case "xai": return "grok";
    case "gitlab": return "gitlab";
    case "opencode": return "opencode";
    default:
      if (connection.id === "nous-portal") return "nous";
      return connection.apiConfig && isLocalModelUrl(connection.apiConfig.baseUrl) ? "local" : "api";
  }
}

export interface SetupMilestoneEntry {
  name: SetupMilestoneName;
  label: string;
  /** When it first happened, or null if it hasn't (or wasn't recorded). */
  at: string | null;
  /** For "Connected an AI": the kind of AI; for "Installed": how. As a label. */
  detail: string | null;
}

export interface SetupTimelineView {
  milestones: SetupMilestoneEntry[];
  /** When this studio started keeping the timeline. */
  startedAt: string;
  /** True for a studio that existed before the timeline: visits and its first AI connection are unknown. */
  olderThanTimeline: boolean;
  sharing: {
    /** False until the owner decides to collect counts; then a switch can appear. */
    available: boolean;
    enabled: boolean;
  };
}

/** What "Share anonymous setup counts" would send, if it is ever turned on:
 * milestone names and seconds since the first start, the app and macOS
 * versions, the kind of AI, how it was installed and a random ID. No content,
 * names or addresses. */
export interface SetupCountsPayload {
  id: string;
  appVersion: string;
  macosMajor: number | null;
  aiKind: SetupAiKind | null;
  installMethod: InstallMethod | null;
  milestones: Array<{ name: SetupMilestoneName; seconds: number }>;
}

export function setupCountsPayload(input: {
  id: string;
  appVersion: string;
  macosMajor: number | null;
  milestones: Partial<Record<SetupMilestoneName, { at: string; kind?: SetupAiKind; method?: InstallMethod }>>;
}): SetupCountsPayload {
  const start = Date.parse(input.milestones.installed?.at ?? "");
  const kind = input.milestones.ai_connected?.kind;
  return {
    id: input.id,
    appVersion: input.appVersion,
    macosMajor: input.macosMajor,
    aiKind: kind && Object.hasOwn(SETUP_AI_KINDS, kind) ? kind : null,
    installMethod: installMethod(input.milestones.installed?.method),
    milestones: Number.isFinite(start)
      ? SETUP_MILESTONES.flatMap(({ name }) => {
        const at = Date.parse(input.milestones[name]?.at ?? "");
        return Number.isFinite(at) ? [{ name, seconds: Math.max(0, Math.round((at - start) / 1000)) }] : [];
      })
      : [],
  };
}

/** "12 s", "4 min", "1 h 5 min", "3 days": time since the first start, for the timeline. */
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** The timeline as plain text, to paste into a note or a bug report. */
export function setupTimelineText(view: SetupTimelineView, formatDate: (iso: string) => string): string {
  const start = Date.parse(view.milestones.find((entry) => entry.name === "installed")?.at ?? "");
  const lines = view.milestones.map((entry) => {
    const title = entry.detail ? `${entry.label} (${entry.detail})` : entry.label;
    if (!entry.at) return `${title}: ${view.olderThanTimeline && OBSERVED_MILESTONES.includes(entry.name) ? "not recorded" : "not yet"}`;
    const at = Date.parse(entry.at);
    const after = entry.name !== "installed" && Number.isFinite(start) ? `, ${formatElapsed(at - start)} after the first start` : "";
    return `${title}: ${formatDate(entry.at)}${after}`;
  });
  return ["Sidemates setup timeline (kept on this Mac)", ...lines].join("\n");
}

/** Local calendar days between two times, on the clock of the Mac that runs Sidemates. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
  return day(to) - day(from);
}
