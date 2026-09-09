import { botReplyMentions, replyEscalatesToOwner } from "../shared/routing.js";
import type { Message, Run } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

/** Group-chat discipline. A teammate reply may pull in the teammates it
 * @names, but a turn can never fold in on itself: at most three rounds of
 * teammate replies after the owner's message, at most ten teammate replies
 * per turn, and a reply that names nobody settles the room (nothing fires).
 * @user/@owner never starts runs — it raises the thread's Needs-you state.
 * Every decision is visible: refusals post one system note per turn. */
export const GROUP_ROUND_LIMIT = 3;
export const GROUP_TURN_MESSAGE_LIMIT = 10;

export type GroupRefusal = "round" | "messages";

export function routeBotReply(db: OpenBotDatabase, run: Run, message: Message): { routed: string[]; refusal: GroupRefusal | null } {
  const thread = db.getThread(run.threadId);
  if (!thread || thread.kind !== "room") return { routed: [], refusal: null };
  if (replyEscalatesToOwner(message.body)) return { routed: [], refusal: null };
  const author = db.getBot(run.botId);
  if (!author) return { routed: [], refusal: null };
  const members = db.getThreadBots(thread.id);
  const targets = [...new Set(botReplyMentions(message.body, members))].filter((botId) => botId !== author.id);
  if (!targets.length) return { routed: [], refusal: null };

  const turn = db.groupTurnState(thread.id);
  if (turn.botMessages >= GROUP_TURN_MESSAGE_LIMIT) return postRefusal(db, thread.id, "messages");
  if (db.replyChainDepth(message.id) + 1 > GROUP_ROUND_LIMIT) return postRefusal(db, thread.id, "round");

  const quote = message.body.replace(/\s+/g, " ").trim().slice(0, 1_200);
  const routed: string[] = [];
  for (const botId of targets) {
    const target = members.find((bot) => bot.id === botId);
    if (!target) continue;
    db.createRun({
      threadId: thread.id,
      botId: target.id,
      status: "queued",
      triggerMessageId: message.id,
      prompt: `${author.name} brought you into the group chat “${thread.title}” by mentioning you in their reply:\n\n"""\n${quote}\n"""\n\nAdd your part briefly and stay on what was asked. Do not repeat their work or re-answer the whole task. If nothing needs you, reply exactly “Nothing to add from me.” Mention another teammate only when the owner genuinely needs them.`,
    });
    routed.push(target.id);
  }
  return { routed, refusal: null };
}

function postRefusal(db: OpenBotDatabase, threadId: string, refusal: GroupRefusal): { routed: string[]; refusal: GroupRefusal } {
  const turn = db.groupTurnState(threadId);
  if (!turn.capNotePosted) {
    db.addMessage({
      threadId, senderType: "system", senderId: null, kind: "event", eventType: "group-cap",
      body: refusal === "messages"
        ? "This group turn reached its reply limit. Ask the team directly to keep going."
        : "This discussion is three teammate rounds deep. Mention a teammate yourself if you want it to continue.",
    });
  }
  return { routed: [], refusal };
}
