/** Conversation starters that fit what a teammate is for. They fill the
 * message box without sending, so a blank page never has to be solved alone. */
export interface Starter { label: string; hint: string; text: string }

const GENERAL: Starter[] = [
  { label: "Plan my week", hint: "Three things that matter most", text: "Help me plan my week: ask what's on my plate, then pick the three things that matter most." },
  { label: "Make sense of something", hint: "A document, notes or a long message", text: "Summarize this and tell me what I need to do: " },
  { label: "Look something up", hint: "With sources you can check", text: "Research this and bring back a short answer with sources: " },
];

/** With Files & apps on, lead with what only a team on your own Mac can do. */
const MAC: Starter[] = [
  { label: "What's on my plate?", hint: "Your reminders, calendar and notes", text: "What's on my plate today? Check my reminders, calendar and notes, and tell me the three things that matter most." },
  { label: "Remind me", hint: "Added to Reminders after your okay", text: "Remind me to " },
  { label: "Find that note", hint: "Searches your Apple Notes", text: "Find my note about " },
];

/** Checked in order; the first job that matches wins. */
const BY_JOB: Array<{ match: RegExp; starters: Starter[] }> = [
  { match: /\b(inbox|e-?mails?|mail|repl(y|ies))\b/i, starters: [
    { label: "What needs a reply?", hint: "From your recent mail", text: "Which emails from the last few days need a reply from me? List them, most urgent first." },
    { label: "Draft a reply", hint: "Saved as a draft, never sent", text: "Draft a reply to " },
    { label: "Tidy my inbox", hint: "Newsletters and old threads", text: "Which newsletters and old threads in my inbox can I archive?" },
  ] },
  { match: /\b(invoices?|receipts?|accounting|accountant|bills?|expenses?|money|bookkeep\w*)\b/i, starters: [
    { label: "File my receipts", hint: "From your mail, this month", text: "Find my receipts from this month in my mail and file them." },
    { label: "What did I spend?", hint: "A short summary by vendor", text: "What did I spend this month? Summarize by vendor." },
    { label: "Invoices to chase", hint: "Unpaid and overdue", text: "Which of my invoices are unpaid or overdue?" },
  ] },
  { match: /\b(check\w*|review\w*|proof\w*|verif\w*|fact)\b/i, starters: [
    { label: "Check this", hint: "Facts, tone and mistakes", text: "Check this for mistakes and anything that isn't true: " },
    { label: "Is this true?", hint: "With sources", text: "Is this true? Check it with sources: " },
    { label: "Proofread", hint: "Spelling and clarity", text: "Proofread this: " },
  ] },
  { match: /\b(writ\w*|drafts?|posts?|copy|blog|edit\w*)\b/i, starters: [
    { label: "Draft something", hint: "Ready for you to edit", text: "Draft this for me: " },
    { label: "Make it better", hint: "Clearer and shorter", text: "Make this clearer and shorter: " },
    { label: "Ideas for a post", hint: "Three angles to pick from", text: "Give me three ideas for a post about " },
  ] },
  { match: /\b(research\w*|finds?|news|look\w*|search\w*|compare|market)\b/i, starters: [
    { label: "Look something up", hint: "With sources you can check", text: "Research this and bring back a short answer with sources: " },
    { label: "What's new?", hint: "From the last few days", text: "What's new about this in the last few days? Keep it short, with sources: " },
    { label: "Compare options", hint: "Side by side", text: "Compare these options for me, with sources: " },
  ] },
  { match: /\b(calendar|meetings?|schedul\w*|week|plan\w*)\b/i, starters: MAC },
];

/** Starters for the teammates in this conversation, judged by their jobs. */
export function startersFor(jobs: string[], mac: boolean): Starter[] {
  const text = jobs.join(" ");
  const found = BY_JOB.find((entry) => entry.match.test(text));
  if (found && (found.starters !== MAC || mac)) return found.starters;
  return mac ? MAC : GENERAL;
}
