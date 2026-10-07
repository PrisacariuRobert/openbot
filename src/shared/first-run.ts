import { defaultModelChoice, isBlockedFreeTierModel, trainsOnPrompts } from "./provider-config.js";

/** The guided first run: one teammate on the AI the owner picks, three first
 * things to try, and specialists the owner adds later when a job needs one. */

/** "How should your team think?", in the developer plan's order. */
export const FIRST_RUN_AI_ORDER = ["apple-intelligence", "chatgpt", "gemini", "claude", "ollama", "other"] as const;
export type FirstRunAIOption = typeof FIRST_RUN_AI_ORDER[number];

/** Apple's on-device model arrives with task A4; until then its slot stays hidden. */
export const APPLE_INTELLIGENCE_AVAILABLE = false;

export function firstRunAIOptions(appleIntelligence = APPLE_INTELLIGENCE_AVAILABLE): FirstRunAIOption[] {
  return FIRST_RUN_AI_ORDER.filter((option) => option !== "apple-intelligence" || appleIntelligence);
}

/** Member keys of the "starter-team" template: the first teammate, then specialists added later. */
export type StarterMemberKey = "chief" | "researcher" | "writer";
export const FIRST_TEAMMATE: StarterMemberKey = "chief";
export const SPECIALISTS: ReadonlyArray<StarterMemberKey> = ["researcher", "writer"];

/** The first teammate plans, drafts and reads Calendar, Reminders and mail: personal data. */
export const FIRST_TEAMMATE_READS_PERSONAL_DATA = true;

/** What a suggestion needs. Automation is asked per app, the first time it's needed. */
export type FirstRunNeed = "mac-apps" | "automation:Calendar" | "automation:Reminders" | "full-disk-access" | "web";

export interface FirstRunSuggestion {
  key: string;
  label: string;
  /** What it uses, in plain words, shown on the card. */
  hint: string;
  text: string;
  needs: ReadonlyArray<FirstRunNeed>;
  /** The reliability scoreboard (task J2) will record which AIs it works on. Until then, no claim. */
  evidence: null;
}

const suggestion = (value: Omit<FirstRunSuggestion, "evidence">): FirstRunSuggestion => ({ ...value, evidence: null });

export const FIRST_RUN_SUGGESTIONS: ReadonlyArray<FirstRunSuggestion> = [
  suggestion({ key: "invite", label: "Draft a short email", hint: "Needs nothing else", text: "Write a short, friendly email inviting my neighbour for coffee on Saturday morning. Keep it under 100 words.", needs: [] }),
  suggestion({ key: "compare", label: "Compare three apps", hint: "Searches the web", text: "Compare three popular note-taking apps for Mac on price, sync and privacy. Keep it short and link your sources.", needs: ["web"] }),
  suggestion({ key: "week", label: "Plan my week", hint: "Needs nothing else", text: "Help me plan my week: ask what's on my plate, then pick the three things that matter most.", needs: [] }),
  suggestion({ key: "plate", label: "What's on my plate today?", hint: "Uses Calendar and Reminders", text: "What's on my plate today? Check my calendar and reminders, then tell me the three things that matter most.", needs: ["mac-apps", "automation:Calendar", "automation:Reminders"] }),
];

/** Three suggestions for the first teammate: the first needs nothing, a web one only if its web switch is on,
 * and the Calendar one only on a Mac. */
export function firstRunSuggestions(teammate: { browserEnabled: boolean }, options: { mac: boolean }): FirstRunSuggestion[] {
  const byKey = (key: string) => FIRST_RUN_SUGGESTIONS.find((item) => item.key === key)!;
  return [
    byKey("invite"),
    teammate.browserEnabled ? byKey("compare") : byKey("week"),
    options.mac ? byKey("plate") : teammate.browserEnabled ? byKey("week") : null,
  ].filter((item): item is FirstRunSuggestion => item !== null);
}

export interface MacStepRow {
  need: Exclude<FirstRunNeed, "web">;
  title: string;
  why: string;
}

const MAC_ROWS: ReadonlyArray<MacStepRow> = [
  { need: "mac-apps", title: "Files & apps on this Mac", why: "Lets your whole team read your Calendar, Reminders, Notes and Mail. Adding or changing anything still asks you first." },
  { need: "automation:Calendar", title: "Calendar", why: "So your teammate can see today's events. macOS asks once." },
  { need: "automation:Reminders", title: "Reminders", why: "So your teammate can see what's due. macOS asks once." },
  { need: "full-disk-access", title: "Full Disk Access", why: "So your teammate can find the mail and messages waiting on you. You switch it on in System Settings." },
];

/** The "Set up your Mac" rows for what a suggestion needs; empty means there is nothing to set up. Never Accessibility. */
export function macStepRows(needs: ReadonlyArray<FirstRunNeed>): MacStepRow[] {
  return MAC_ROWS.filter((row) => needs.includes(row.need));
}

/** The model the guided run preselects for a connection. The owner confirms or changes it. */
export function firstRunModel(connection: { models?: ReadonlyArray<string>; defaultModel?: string }, options: { readsPersonalData: boolean }): string {
  const allowed = (connection.models ?? []).filter((model) => !isBlockedFreeTierModel(model) && !(options.readsPersonalData && trainsOnPrompts(model)));
  const recommended = defaultModelChoice(allowed);
  if (recommended) return recommended;
  return connection.defaultModel && allowed.includes(connection.defaultModel) ? connection.defaultModel : "";
}
