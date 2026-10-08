import type { Bot, Thread } from "../shared/types";

/** Conversation-list search (U02a). A chat is findable by what the list
 * itself shows: its title, its latest snippet, and its teammates' names
 * and roles — including the direct-chat teammate, who has no membership
 * row. Case-insensitive substring; an empty query matches everything.
 * Pinned/hidden partitioning stays in the component, not here. */
export function conversationMatches(thread: Thread, bots: Bot[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystacks: string[] = [thread.title, thread.lastMessage || ""];
  const seen = new Set<string>();
  const members = (thread.botIds || [])
    .map((id) => bots.find((bot) => bot.id === id))
    .filter((bot): bot is Bot => Boolean(bot));
  const direct = bots.find((bot) => bot.threadId === thread.id);
  for (const member of [...members, ...(direct ? [direct] : [])]) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    haystacks.push(member.name, member.role);
  }
  return haystacks.some((field) => field.toLowerCase().includes(needle));
}

/** The faces at the top of Conversations: the teammates you talked to most
 * recently (a new teammate counts from when it was made), not always the
 * first three ever created. */
export function recentTeammates(bots: Bot[], threads: Thread[], count = 3): Bot[] {
  const lastActive = (bot: Bot) => threads.find((thread) => thread.id === bot.threadId)?.updatedAt || "";
  return [...bots].filter((bot) => !bot.retiredAt).sort((a, b) => lastActive(b).localeCompare(lastActive(a))).slice(0, count);
}
