import { HERO_JOB_IDS, type HeroJobId } from "./hero-jobs.js";

/** Results of hero-job runs and the public scoreboard built from them (task J2). */

export interface HeroRun {
  job: HeroJobId;
  attempt: number;
  pass: boolean;
  problems: string[];
  seconds: number;
  steps: number;
  contextTokens: number;
  reply: string;
}

export interface HeroSummary { job: HeroJobId; runs: number; passed: number; medianSeconds: number; medianContextTokens: number }

export interface HeroResults {
  label: string;
  model: string;
  /** False for the scripted model, which checks the plumbing, not a model. */
  live: boolean;
  at: string;
  repeat: number;
  prompts: string[];
  runs: HeroRun[];
  summary: HeroSummary[];
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 10) / 10;
};

export function summarize(runs: HeroRun[]): HeroSummary[] {
  return HERO_JOB_IDS.filter((job) => runs.some((run) => run.job === job)).map((job) => {
    const mine = runs.filter((run) => run.job === job);
    return { job, runs: mine.length, passed: mine.filter((run) => run.pass).length, medianSeconds: median(mine.map((run) => run.seconds)), medianContextTokens: median(mine.map((run) => run.contextTokens)) };
  });
}

const JOB_NAMES: Record<HeroJobId, string> = { "morning-brief": "Morning brief", "waiting-on-me": "What's waiting on me", "meeting-prep": "Meeting prep" };

/** docs/RELIABILITY.md from saved live results only. Scripted runs never appear on it. */
export function scoreboard(results: HeroResults[]): string {
  const live = results.filter((result) => result.live).sort((a, b) => b.at.localeCompare(a.at));
  const lines = [
    "# Reliability",
    "",
    "How often Sidemates gets the [hero jobs](../qa/hero-jobs/README.md) right, by model. Every run uses the same synthetic Mac data, so nothing personal is involved, and is checked by the same rules: the right facts, nothing that doesn't belong, sources named, nothing sent, and drafts only for people still waiting. The bar before a release ships is 9 of 10 runs for each job on each kind of AI.",
    "",
    "Live runs use the owner's own model access and are started by hand (`scripts/hero-jobs.ts --model …`). CI runs the same jobs against a scripted model on every push; that checks Sidemates' plumbing, not any model, so it isn't listed here.",
    "",
  ];
  if (!live.length) {
    lines.push("**No live runs yet.** This page fills in when the owner runs the jobs against real models; until then, Sidemates makes no claim about how often they succeed.", "");
    return `${lines.join("\n")}\n`;
  }
  lines.push("| Model | Job | Passed | Median time | Median context | Run on |", "| :--- | :--- | :--- | :--- | :--- | :--- |");
  for (const result of live) {
    for (const line of result.summary) lines.push(`| \`${result.model}\` | ${JOB_NAMES[line.job]} | ${line.passed} of ${line.runs} | ${line.medianSeconds} s | ${line.medianContextTokens.toLocaleString("en-US")} tokens | ${result.at.slice(0, 10)} |`);
  }
  lines.push("", "## What went wrong", "");
  for (const result of live) {
    const failed = result.runs.filter((run) => !run.pass);
    if (!failed.length) continue;
    lines.push(`**\`${result.model}\`** (${result.at.slice(0, 10)}, prompts ${result.prompts.join(", ")}):`, "");
    const counts = new Map<string, number>();
    for (const run of failed) for (const problem of run.problems) { const key = `${JOB_NAMES[run.job]}: ${problem}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
    for (const [problem, count] of [...counts].sort((a, b) => b[1] - a[1])) lines.push(`- ${problem}${count > 1 ? ` (${count} runs)` : ""}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
