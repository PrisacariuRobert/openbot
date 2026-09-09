import { createHash } from "node:crypto";
import { emailMessageIdSchema, gmailReplyReviewSchema, type GmailReplyReview } from "../shared/gmail-reply.js";

export type ReplyMessage = {
  id?: string; threadId?: string; internalDate?: string; labelIds?: string[];
  payload?: { mimeType?: string; headers?: Array<{ name?: string; value?: string }>; body?: { data?: string }; parts?: ReplyMessage["payload"][] };
};
export function replyHeader(message: ReplyMessage, name: string): string {
  const values = message.payload?.headers?.filter(header => header.name?.toLowerCase() === name.toLowerCase()) || [];
  if (values.length > 1) throw new Error("This message has ambiguous headers. Reply in Gmail instead.");
  return values[0]?.value || "";
}
function address(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("This message has an unsafe reply address. Reply in Gmail instead.");
  const matched = value.trim().match(/^(?:[^<>]*<([^<>\s,;]+)>|([^<>\s,;]+))$/);
  const result = (matched?.[1] || matched?.[2] || "").toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result)) throw new Error("This message needs a manual recipient choice. Reply in Gmail instead.");
  return result;
}
function plainBody(payload: ReplyMessage["payload"]): string | null {
  if (payload?.mimeType === "text/plain" && typeof payload.body?.data === "string") return Buffer.from(payload.body.data, "base64url").toString("utf8");
  for (const part of payload?.parts || []) { const text = plainBody(part); if (text !== null) return text; }
  return null;
}
const normalizedBody = (value: string) => value.replace(/\r\n?/g, "\n").trim();

export function prepareGmailReply(message: ReplyMessage, threadMessages: ReplyMessage[], body: string, account: string): GmailReplyReview {
  if (!message.id || !message.threadId || !threadMessages.length || threadMessages.length > 500) throw new Error("The conversation could not be checked completely. Open it in Gmail.");
  if (threadMessages.some(item => !item.id || item.threadId !== message.threadId || !Number.isFinite(Number(item.internalDate)) || Number(item.internalDate) <= 0 || !Array.isArray(item.labelIds) || item.labelIds.some(label => ["DRAFT", "TRASH", "SPAM"].includes(label)))) throw new Error("This conversation has a draft, unavailable message or uncertain order. Review it in Gmail before replying.");
  const sorted = [...threadMessages].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const latest = sorted.at(-1)!;
  if (latest.id !== message.id || latest.labelIds?.includes("SENT") || message.labelIds?.some(label => ["SENT", "DRAFT", "TRASH", "SPAM"].includes(label)) || (sorted.length > 1 && Number(sorted.at(-2)!.internalDate) === Number(latest.internalDate))) throw new Error("This is no longer the latest received message. Read the conversation again before preparing a reply.");
  const from = replyHeader(message, "From"), to = address(replyHeader(message, "Reply-To") || from);
  if (address(from) === account.toLowerCase() || to === account.toLowerCase()) throw new Error("This would reply to your own account. Choose the message in Gmail instead.");
  const inReplyTo = emailMessageIdSchema.parse(replyHeader(message, "Message-ID").trim());
  const referenceText = replyHeader(message, "References").trim();
  const existing = referenceText ? referenceText.split(/\s+/).map(value => emailMessageIdSchema.parse(value)) : [];
  const references = [...new Set([...existing, inReplyTo])].slice(-20);
  // Opening mail changes UNREAD, not the reviewed conversation's content/order.
  const threadRevision = createHash("sha256").update(JSON.stringify(sorted.map(item => [item.id, item.internalDate, item.labelIds?.filter(label => ["SENT", "DRAFT", "TRASH", "SPAM"].includes(label)).sort(), ["Message-ID", "From", "Reply-To", "Subject", "References"].map(name => replyHeader(item, name))]))).digest("hex");
  return gmailReplyReviewSchema.parse({ messageId: message.id, threadId: message.threadId, account: account.toLowerCase(), from, to, subject: replyHeader(message, "Subject"), body, inReplyTo, references, threadRevision, sourcePreview: (plainBody(message.payload) || "Plain-text preview unavailable; read the original in Gmail.").slice(0, 800) });
}

export function replyDeliveryId(approvalId: string): string {
  if (!approvalId) throw new Error("A reply needs an approval identity.");
  return `<openbot.${createHash("sha256").update(approvalId).digest("hex")}@openbot.invalid>`;
}

export function rawReply(rawEmail: string, review: GmailReplyReview, messageId: string): string {
  emailMessageIdSchema.parse(messageId); gmailReplyReviewSchema.parse(review);
  const headers = [`Message-ID: ${messageId}`, `In-Reply-To: ${review.inReplyTo}`, `References: ${review.references.join("\r\n ")}`].join("\r\n");
  return Buffer.from(`${headers}\r\n${Buffer.from(rawEmail, "base64url").toString("utf8")}`, "utf8").toString("base64url");
}

/** A service ID alone is not proof of the approved recipient, body or thread. */
export function gmailReplyMatches(review: GmailReplyReview, messageId: string, message: ReplyMessage | null): boolean {
  try {
    if (!message?.id || message.threadId !== review.threadId || !message.labelIds?.includes("SENT")) return false;
    const text = plainBody(message.payload);
    return replyHeader(message, "Message-ID").trim() === messageId
      && replyHeader(message, "In-Reply-To").trim() === review.inReplyTo
      && address(replyHeader(message, "To")) === review.to
      && address(replyHeader(message, "From")) === review.account
      && !replyHeader(message, "Cc") && !replyHeader(message, "Bcc")
      && replyHeader(message, "Subject") === review.subject
      && text !== null && normalizedBody(text) === normalizedBody(review.body);
  } catch { return false; }
}
