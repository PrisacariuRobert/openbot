import { routineScheduleLabel } from "./routines.js";

export interface RoutineIntent {
  intervalMinutes: number;
  name: string;
  prompt: string;
  confirmation: string;
}

const unitMinutes: Record<string, number> = {
  min: 1, mins: 1, minute: 1, minutes: 1,
  hr: 60, hrs: 60, hour: 60, hours: 60,
  day: 1440, days: 1440,
};

export function parseRoutineIntent(input: string): RoutineIntent | null {
  const text = input.trim();
  const match = /\b(?:every\s+(?:(\d+)\s*)?(min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks)|hourly|daily|weekly)\b/i.exec(text);
  if (!match || match.index === undefined) return null;
  const before = text.slice(0, match.index).trim();
  const explicitCommand = match.index === 0 || /\b(set|create|schedule|run|do|remind|text|message|post|check)\b/i.test(before);
  if (!explicitCommand) return null;
  const keyword = match[0].toLowerCase();
  const intervalMinutes = keyword === "hourly" ? 60 : keyword === "daily" ? 1440 : keyword === "weekly" ? 10_080 : Number(match[1] || 1) * (match[2]!.toLowerCase().startsWith("week") ? 10_080 : unitMinutes[match[2]!.toLowerCase()]!);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43_200) return null;

  let task = `${before} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  task = task.replace(/^(please\s+)?(set|create|schedule|run|do)\s+/i, "").trim();
  let prompt: string;
  let friendlyTask: string;
  const localText = /^(?:text|message)\s+(?:me|my)\s+(.+)$/i.exec(task);
  const reminder = /^remind\s+me\s+(?:to\s+)?(.+)$/i.exec(task);
  if (localText) {
    friendlyTask = localText[1]!.trim();
    prompt = `Post this exact update in the current OpenBot conversation: ${friendlyTask}`;
  } else if (reminder) {
    friendlyTask = reminder[1]!.trim();
    prompt = `Post a short reminder in the current OpenBot conversation: ${friendlyTask}`;
  } else {
    friendlyTask = task.replace(/^to\s+/i, "").trim();
    if (!friendlyTask) return null;
    prompt = friendlyTask;
  }
  const shortTask = friendlyTask.replace(/[.!?]+$/g, "").slice(0, 44);
  const schedule = routineScheduleLabel(intervalMinutes);
  return {
    intervalMinutes,
    name: `${shortTask.charAt(0).toUpperCase()}${shortTask.slice(1)}`,
    prompt,
    confirmation: `I’ll ${localText ? `post “${shortTask}” here` : friendlyTask} ${schedule.toLowerCase()}. You can test, pause or change it anytime in Automations.`,
  };
}
