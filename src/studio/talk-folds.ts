import type { Message } from "../shared/types";

export interface TalkFold {
  first: Message;
  items: Message[];
}

const TALK_TYPES = new Set(["handoff", "teammate_message"]);

/** Fold consecutive talking pills between the same pair — Apple groups
 * repeated system lines instead of stacking five identical pills.
 * Direction is ignored: Scout ⇄ Pixel reads the same either way. */
export function foldTalkingPills(messages: Message[]): {
  firstOf: Map<string, Message>;
  folds: Map<string, TalkFold>;
} {
  const firstOf = new Map<string, Message>();
  const folds = new Map<string, TalkFold>();
  let run: { key: string; first: Message; items: Message[] } | null = null;
  const flush = () => {
    if (run && run.items.length > 1) {
      folds.set(run.first.id, run);
      for (const item of run.items) firstOf.set(item.id, run.first);
    }
    run = null;
  };
  for (const item of messages) {
    if (item.kind === "event" && TALK_TYPES.has(item.eventType || "")) {
      const data = item.eventData || {};
      const pair = [String(data.fromName || ""), String(data.toName || "")]
        .sort()
        .join("|");
      const key = `${item.eventType}|${pair}`;
      if (run && run.key === key) {
        run.items.push(item);
        continue;
      }
      flush();
      run = { key, first: item, items: [item] };
    } else {
      flush();
    }
  }
  flush();
  return { firstOf, folds };
}
