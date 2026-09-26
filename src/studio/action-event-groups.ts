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

/** A routine's machine reply (ROUTINE_HEARTBEAT_OK) — a status code, not conversation. */
export function isRoutineMarker(message: Message): boolean {
  return message.senderType !== "user" && /^\s*ROUTINE_[A-Z0-9_]+\s*$/.test(message.body || "");
}

/** Repeated runs of one routine (a heartbeat every few minutes) collapse
 *  into one quiet line. Each run's machine reply travels with its start
 *  notice. A run waiting for approval never folds: it needs the owner, so
 *  it stays visible on its own. Groups hold start notices and replies. */
export function groupConsecutiveRoutineRuns(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  let current: Message[] = [];
  const starts = () => current.filter((item) => item.eventType === "routine_run").length;
  const flush = () => { if (starts() > 1) groups.push(current); current = []; };
  for (const message of messages) {
    const data = message.eventData || {};
    const eligible = message.kind === "event" && message.eventType === "routine_run" && data.waiting !== "true" && Boolean(data.name);
    if (current.length > 0 && isRoutineMarker(message) && message.runId && current.some((item) => item.runId === message.runId)) { current.push(message); continue; }
    const joins = eligible && current.length > 0 && current[0]?.eventData?.name === data.name;
    if (joins) current.push(message);
    else { flush(); current = eligible ? [message] : []; }
  }
  flush();
  return groups;
}
