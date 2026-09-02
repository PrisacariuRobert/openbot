const teamworkReceipt = /\b(?:message_teammate|messageId|replyRunId|dedupeKey|expectsReply|confirmed sent)\b/i;
const receiptOutcome = /\b(?:signal|message)\s+(?:was\s+)?sent\s+to\s+([\p{L}\p{N}_ -]{1,40}?)(?=\s*(?:—|-|\(|\.|,|$))/iu;
const handoffOutcome = /\b(?:handed\s+off|handoff\s+request)\s+to\s+([\p{L}\p{N}_ -]{1,40}?)(?=\s*(?:—|-|\(|\.|,|$))/iu;
const macSetupNarration = /(?:\bnow has\b[\s\S]{0,100}\b(?:permission|capability)\b|\bcurrent OpenBot data\b|\bread-only live check\b|\bisolated-workspace refusal\b)/i;
const oldWorkspaceRefusal = /\b(?:isolated workspace|private workspace)\b[\s\S]{0,180}\b(?:can(?:not|'t) reach|cannot access)\b[\s\S]{0,80}\bdesktop\b/i;
const oldRoutineRefusal = /\bcan(?:not|'t)\s+(?:start|create|set up)\b[\s\S]{0,120}\brecurring\b[\s\S]{0,120}\bsensitive\b/i;

export function presentBotMessage(body: string, options: { macAccessEnabled?: boolean } = {}): string {
  if (oldRoutineRefusal.test(body)) {
    return "I can set up repeating work here now. Tell me what should happen and how often, or open Routines to choose a custom time.";
  }
  if (options.macAccessEnabled && oldWorkspaceRefusal.test(body)) {
    return "I can help with your Desktop. I’ll first look at what’s there, then show you a simple folder plan before anything moves.";
  }
  if (macSetupNarration.test(body)) {
    return "I can use your Mac files now. I’ll check the Desktop and come back with a simple, safe tidy-up plan.";
  }
  if (body.length <= 800 && /\b(?:dedupe\s+key|run\s+queued|handoff)\b/i.test(body)) {
    const teammate = body.match(handoffOutcome)?.[1]?.trim();
    if (teammate && /\b(?:passing|handed)\b/i.test(body)) return `I asked ${teammate} to handle that part. I’ll share the result here when it’s ready.`;
  }
  if (body.length > 600 || !teamworkReceipt.test(body) || !/\b(?:sent|queued|complete)\b/i.test(body)) return body;
  const teammate = body.match(receiptOutcome)?.[1]?.trim();
  return teammate
    ? `I asked ${teammate} to take a look. I’ll share what they find here.`
    : "I’ve passed this to the right teammate. I’ll share what they find here.";
}

export const signalKindLabels: Record<string, string> = {
  question: "asked",
  finding: "shared",
  handoff: "passed along",
  message: "updated",
};
