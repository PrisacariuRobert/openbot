/** The reply as it is being written, from either runtime's streaming
 * events. Display only: the finished answer still comes from the runtime's
 * authoritative output (ModelOutput), never from this. */
export class LiveText {
  private parts = new Map<string, { messageId: string; text: string }>();
  private textParts = new Set<string>();
  private otherParts = new Set<string>();
  private pending = new Map<string, string>();
  private latestMessage = "";
  private claude = "";

  /** OpenCode server events (`/event` stream): part updates and text deltas. */
  addOpenCode(event: { type?: string; properties?: Record<string, unknown> }) {
    const props = event.properties || {};
    if (event.type === "message.part.updated") {
      const part = props.part as { id?: string; messageID?: string; type?: string; text?: string } | undefined;
      if (!part?.id || !part.messageID) return;
      if (part.type !== "text") { this.otherParts.add(part.id); this.pending.delete(part.id); return; }
      this.textParts.add(part.id);
      const current = this.parts.get(part.id)?.text || "";
      const pending = this.pending.get(part.id) || "";
      this.pending.delete(part.id);
      // A full snapshot wins when it is at least as long as what streamed.
      const text = typeof part.text === "string" && part.text.length >= current.length + pending.length ? part.text : current + pending;
      this.parts.set(part.id, { messageId: part.messageID, text });
      this.latestMessage = part.messageID;
      return;
    }
    if (event.type === "message.part.delta") {
      const partId = String(props.partID || ""), delta = typeof props.delta === "string" ? props.delta : "";
      if (!partId || !delta || (props.field && props.field !== "text") || this.otherParts.has(partId)) return;
      const known = this.parts.get(partId);
      if (known && this.textParts.has(partId)) { known.text += delta; this.latestMessage = known.messageId; }
      else this.pending.set(partId, (this.pending.get(partId) || "") + delta);
    }
  }

  /** Claude Code `--include-partial-messages` stream events. */
  addClaude(event: { type?: string; event?: { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string } } }) {
    if (event.type !== "stream_event" || !event.event) return;
    const inner = event.event;
    if (inner.type === "message_start") this.claude = "";
    else if (inner.type === "content_block_start" && inner.content_block?.type === "text" && this.claude && !this.claude.endsWith("\n")) this.claude += "\n\n";
    else if (inner.type === "content_block_delta" && inner.delta?.type === "text_delta" && inner.delta.text) this.claude += inner.delta.text;
  }

  get text() {
    if (this.claude) return this.claude;
    return [...this.parts.values()].filter((part) => part.messageId === this.latestMessage).map((part) => part.text).join("\n\n").trim();
  }
}
