/** "Your week with your team": built only from tasks that really finished,
 * so it never flatters with work that didn't happen. */
export interface RecapRun { botId: string; botName: string; goal: string; finishedAt: string | null; activeDurationMs: number; status: string; parentRunId: string | null }

export interface WeeklyRecap {
  finished: number;
  workedMs: number;
  teammates: Array<{ botId: string; name: string; finished: number }>;
  highlights: string[];
  headline: string;
  detail: string;
}

const DAY = 86_400_000;

export function weeklyRecap(runs: RecapRun[], now = Date.now()): WeeklyRecap | null {
  const since = now - 7 * DAY;
  const done = runs.filter((run) => run.status === "completed" && !run.parentRunId && run.finishedAt && Date.parse(run.finishedAt) >= since && Date.parse(run.finishedAt) <= now)
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!));
  if (!done.length) return null;
  const byBot = new Map<string, { botId: string; name: string; finished: number }>();
  for (const run of done) {
    const entry = byBot.get(run.botId) || { botId: run.botId, name: run.botName, finished: 0 };
    entry.finished++;
    byBot.set(run.botId, entry);
  }
  const teammates = [...byBot.values()].sort((a, b) => b.finished - a.finished || a.name.localeCompare(b.name));
  const workedMs = done.reduce((sum, run) => sum + Math.max(0, run.activeDurationMs || 0), 0);
  // The biggest help first; greetings and one-liners aren't highlights.
  const highlights = [...new Set([...done].sort((a, b) => (b.activeDurationMs || 0) - (a.activeDurationMs || 0))
    .filter((run) => run.goal.trim().split(/\s+/).length >= 4 && !/^(?:hi|hello|hey|thanks|thank you|ok|okay|test)\b/i.test(run.goal.trim())).map((run) => tidyGoal(run.goal)).filter(Boolean))].slice(0, 3);
  const things = done.length === 1 ? "1 thing" : `${done.length} things`;
  const worked = workedMs >= 60_000 ? ` and worked ${duration(workedMs)} so you didn't have to` : "";
  const top = teammates[0]!;
  const detail = teammates.length > 1
    ? `${top.name} helped most, with ${top.finished} of them.`
    : `${top.name} took care of ${top.finished === 1 ? "it" : "all of them"}.`;
  return { finished: done.length, workedMs, teammates, highlights, headline: `Your team finished ${things} this week${worked}.`, detail };
}

export function duration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function tidyGoal(goal: string) {
  const line = goal.replace(/\s+/g, " ").trim();
  const short = line.length > 80 ? `${line.slice(0, 77).replace(/\s+\S*$/, "")}…` : line;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
