import type { Message } from "../shared/types";

/** Finds only contiguous successful action notices for one run. */
export function groupConsecutiveActionEvents(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  let current: Message[] = [];
  const flush = () => { if (current.length > 1) groups.push(current); current = []; };
  for (const message of messages) {
    const eligible = message.kind === "event" && message.eventType === "action_completed" && message.runId;
    const joins = eligible && current.length > 0
      && current[0]?.runId === message.runId;
    if (joins) current.push(message);
    else { flush(); current = eligible ? [message] : []; }
  }
  flush();
  return groups;
}
