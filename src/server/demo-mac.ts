import path from "node:path";
import type { QueueExecutor } from "./queue.js";

/** "Sample Mac" mode, for demo studios, screenshots and recordings only: set SIDEMATES_DEMO_MAC=sample.
 * The queue, the checks and the trust rules all run for real; only the last step changes. Instead of
 * touching Reminders, Calendar, Mail or any file, each action answers as if it had worked. Nothing here
 * writes a file or runs a script, and the page says "Sample data" while it is on. */
export const demoMacEnabled = () => process.env.SIDEMATES_DEMO_MAC === "sample";

export function demoQueueExecutor(home: string): QueueExecutor {
  let counter = 0;
  const next = (prefix: string) => `${prefix}-sample-${++counter}`;
  return {
    async createReminder(input) { return { id: next("reminder"), list: input.list ?? "Reminders", title: input.title, due: input.due ?? null }; },
    async deleteReminder() { /* nothing was made */ },
    async createEvent(input) { return { id: next("event"), calendar: input.calendar ?? "Calendar", title: input.title }; },
    async deleteEvent() { /* nothing was made */ },
    async saveMailDraft(input) { return { saved: true as const, subject: input.subject, at: new Date().toISOString() }; },
    async deleteMailDraft() { /* nothing was made */ },
    async saveMailAttachment(input) { return { saved: path.join(home, input.folder, path.basename(input.attachment)), bytes: 52_000 }; },
    async trashFile() { /* nothing was made */ },
  };
}
