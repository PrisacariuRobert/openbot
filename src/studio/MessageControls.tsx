import { useState } from "react";
import { Check, Copy, MessageCircleReply, SmilePlus, X } from "lucide-react";

/** Per-message contextual actions (U02c): reply, copy and the five
 * host-supported reactions. No message delete exists on this path by
 * design, so none is offered. Everything here maps to a real handler;
 * failures stay visible on the row instead of pretending success. */

export const MESSAGE_EMOJIS = ["👍", "❤️", "✅", "👀", "🎉"] as const;
export type MessageEmoji = (typeof MESSAGE_EMOJIS)[number];

export function MessageControls({ messageId, reactions, onReply, onReacted }: {
  messageId: string;
  reactions: Array<{ emoji: string; count: number; reactedByYou: boolean }>;
  onReply: () => void;
  onReacted: () => void;
}) {
  const [reacting, setReacting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    setError("");
    const text = document.getElementById(`message-text-${messageId}`)?.innerText || "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy needs clipboard permission in this browser.");
    }
  }
  async function react(emoji: MessageEmoji) {
    setError("");
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error("That reaction didn’t land. Try again.");
      setReacting(false);
      onReacted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That reaction didn’t land. Try again.");
    }
  }
  return (
    <span className="message-controls">
      <button type="button" className="message-control" aria-label="Reply to this message" title="Reply" onClick={onReply}>
        <MessageCircleReply size={15} />
      </button>
      <button type="button" className="message-control" aria-label={copied ? "Copied" : "Copy message text"} title={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <button type="button" className="message-control" aria-label="React to this message" title="React" aria-expanded={reacting} onClick={() => { setReacting((open) => !open); setError(""); }}>
        {reacting ? <X size={15} /> : <SmilePlus size={15} />}
      </button>
      {reacting && (
        <span className="message-reactions" role="group" aria-label="Choose a reaction">
          {MESSAGE_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="message-reaction" aria-label={`React ${emoji}`} onClick={() => void react(emoji)}>
              {emoji}
            </button>
          ))}
        </span>
      )}
      {reactions.length > 0 && (
        <span className="message-reaction-list" aria-label="Reactions">
          {reactions.map((reaction) => (
            <span key={reaction.emoji} className={`message-reaction-chip${reaction.reactedByYou ? " reacted" : ""}`} title={reaction.reactedByYou ? "You reacted" : undefined}>
              {reaction.emoji} {reaction.count}
            </span>
          ))}
        </span>
      )}
      {error && <span className="message-control-error" role="alert">{error}</span>}
    </span>
  );
}
