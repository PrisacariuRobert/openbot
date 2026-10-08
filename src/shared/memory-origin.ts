/** Task T5: where a memory came from, in the owner's words. */
export type MemoryOrigin = "you" | "conversation" | "email" | "web" | "file" | "message" | "calendar" | "app";
export const MEMORY_ORIGIN_TEXT: Record<MemoryOrigin, string> = {
  you: "From you", conversation: "From your conversation", email: "From an email", web: "From a web page",
  file: "From a file", message: "From a message", calendar: "From your calendar", app: "From an app",
};
/** Facts learned after reading these wait for the owner before they become memories. */
export const UNTRUSTED_ORIGINS: readonly MemoryOrigin[] = ["email", "web", "file", "message", "calendar", "app"];
export interface MemoryReviewItem {
  /** The task that learned it; null for memories brought in from an export (F8). */
  id: string; botId: string; runId: string | null; key: string; content: string;
  /** The first kind of outside content the task read; `origins` lists them all. */
  origin: MemoryOrigin; origins: MemoryOrigin[]; at: string; expiresAt: string | null;
  /** Where an imported memory came from, in words ("your ChatGPT export"). */
  from?: string;
}
