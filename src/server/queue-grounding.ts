import type { QueueProposal } from "./queue.js";

/** A teammate may only prepare a card about an email it actually read in this
 * task. Replies go only to that email's sender, and attachments must be ones
 * that email really has. This keeps a made-up address or file name from ever
 * reaching the list. (Slice 1 covers cards that start from an email.) */

type SeenMail = { from: string; subject: string; attachments: string[]; text: string };
type MailLike = { id: string; from: string; subject: string; snippet?: string; text?: string; attachments?: { name: string }[] };

const MAX_RUNS = 100;
const ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Every way an email might write an amount: 1240.50 may read 1,240.50, 1.240,50, 1 240,50 or 1240,5. */
export function amountAppearsIn(text: string, amount: string): boolean {
  const plain = amount.replace(",", "."), [whole = "", cents = ""] = plain.split(".");
  const groups = [whole, whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","), whole.replace(/\B(?=(\d{3})+(?!\d))/g, "."), whole.replace(/\B(?=(\d{3})+(?!\d))/g, " "), whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")];
  const decimals = cents ? [`.${cents}`, `,${cents}`] : [""];
  const haystack = text.replace(/\s+/g, " ");
  for (const group of groups) for (const decimal of decimals) {
    const needle = group + decimal;
    let from = 0;
    for (let at = haystack.indexOf(needle, from); at !== -1; at = haystack.indexOf(needle, from)) {
      const before = haystack[at - 1] ?? "", after = haystack[at + needle.length] ?? "";
      // The whole number, not the middle of a longer one (84.20 is not in 184.205).
      if (!/[\d.,]/.test(before) && !/\d/.test(after) && !(/[.,]/.test(after) && /\d/.test(haystack[at + needle.length + 1] ?? ""))) return true;
      from = at + 1;
    }
  }
  return false;
}

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
      const earlier = seen.get(String(message.id));
      // A full read has the whole text; a list or search only has a snippet, which must not replace it.
      seen.set(String(message.id), { from: message.from, subject: message.subject, attachments: (message.attachments ?? []).map((a) => a.name), text: (message.text ?? (earlier?.text || message.snippet) ?? "").slice(0, 60_000) });
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
    if (proposal.kind === "file_attachment" && proposal.receipt) {
      // The accountant's list must say what the email says. Anything the email does not show is left out, not guessed.
      const words = `${mail.subject} ${mail.from} ${mail.text}`;
      const { amount, vendor } = proposal.receipt;
      if (amount && !amountAppearsIn(words, amount)) return `The amount ${amount} is not written in the email you read. Leave out amount and currency instead of guessing, or give the amount exactly as the email states it.`;
      if (vendor && !words.toLowerCase().includes(vendor.toLowerCase())) return `The vendor “${vendor}” is not named in the email you read. Use the name as the email writes it, or leave it out.`;
    }
    return null;
  }
}
