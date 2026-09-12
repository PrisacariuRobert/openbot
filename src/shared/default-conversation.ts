import type { Thread } from "./types";

/** Explicit links win; otherwise start with an available direct conversation. */
export function defaultConversation(threads: Thread[], requested?: string): string {
  if (requested && threads.some((thread) => thread.id === requested)) return requested;
  const visible = threads.filter((thread) => !thread.hidden);
  return visible.find((thread) => thread.kind === "direct")?.id
    || visible[0]?.id || threads[0]?.id || "team-room";
}
