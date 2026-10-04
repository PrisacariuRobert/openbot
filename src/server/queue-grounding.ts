import type { QueueProposal } from "./queue.js";

/** A teammate may only prepare a card about an email it actually read in this
 * task. Replies go only to that email's sender, and attachments must be ones
 * that email really has. This keeps a made-up address or file name from ever
 * reaching the list. (Slice 1 covers cards that start from an email.) */

type SeenMail = { from: string; subject: string; attachments: string[] };
type MailLike = { id: string; from: string; subject: string; attachments?: { name: string }[] };

const MAX_RUNS = 100;
const ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function emailAddresses(from: string): string[] {
  return [...from.matchAll(ADDRESS)].map((match) => match[0].toLowerCase());
}

export class MailSeen {
  private readonly runs = new Map<string, Map<string, SeenMail>>();

  /** Called whenever a teammate lists, searches or reads mail. */
  remember(runId: string, messages: MailLike[]) {
    let seen = this.runs.get(runId);
    if (!seen) {
      seen = new Map();
      this.runs.set(runId, seen);
      // Keep memory bounded: forget the oldest runs.
      while (this.runs.size > MAX_RUNS) this.runs.delete(this.runs.keys().next().value as string);
    }
    for (const message of messages) {
      seen.set(String(message.id), { from: message.from, subject: message.subject, attachments: (message.attachments ?? []).map((a) => a.name) });
    }
  }

  forget(runId: string) { this.runs.delete(runId); }

  private idOf(proposal: QueueProposal): string | undefined {
    return proposal.kind === "file_attachment" ? proposal.action.id : /^mail:(\d{1,15})(?::.*)?$/.exec(proposal.sourceKey)?.[1];
  }

  /** The "From" line of the email a card came from, as read in this run. */
  sender(proposal: QueueProposal, runId: string): string | null {
    const id = this.idOf(proposal);
    return id ? this.runs.get(runId)?.get(id)?.from ?? null : null;
  }

  /** null when the card is grounded; otherwise a plain reason the teammate can act on. */
  check(proposal: QueueProposal, runId: string): string | null {
    const id = this.idOf(proposal);
    if (!id) return "A card must start from an email you read. Use a sourceKey like mail:<id> with the id from the mail tools.";
    const mail = this.runs.get(runId)?.get(id);
    if (!mail) return "You have not read that email in this task. Read it first with the mail tools, then propose the card.";
    if (proposal.kind === "reply_draft") {
      const allowed = emailAddresses(mail.from);
      if (proposal.action.cc.length) return "Replies in this list go only to the sender. Leave cc empty.";
      const stranger = proposal.action.to.find((address) => !allowed.includes(address.toLowerCase()));
      if (stranger) return `A reply can only go to the sender of the email you read (${allowed.join(", ") || "no address found"}), not to ${stranger}.`;
    }
    if (proposal.kind === "file_attachment" && !mail.attachments.includes(proposal.action.attachment)) {
      return `That email has no attachment called “${proposal.action.attachment}”. Its attachments: ${mail.attachments.join(", ") || "none"}.`;
    }
    return null;
  }
}
