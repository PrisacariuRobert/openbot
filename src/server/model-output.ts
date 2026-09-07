type Event = Record<string, unknown>;
function record(value: unknown): Event | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined;
}

export function eventText(event: Event): string | null {
  // Only assistant text is public progress. Reasoning/tool payloads are not.
  if (event.type === "text") {
    const part = record(event.part);
    if (typeof part?.text === "string") return part.text;
    if (typeof event.text === "string") return event.text;
    if (typeof event.content === "string") return event.content;
  }
  if (event.type === "assistant") {
    const content = record(event.message)?.content;
    if (Array.isArray(content)) {
      return content.map(record).filter((item) => item?.type === "text" && typeof item.text === "string")
        .map((item) => item!.text as string).join("\n\n") || null;
    }
  }
  if (event.type === "result" && typeof event.result === "string") return event.result;
  return null;
}

export function appendModelText(current: string, next: string): string {
  if (!current) return next;
  if (!next || /\s$/.test(current) || /^\s/.test(next)) return current + next;
  if (/[.!?:;”")\]]$/.test(current) && /^[A-Z0-9“"'(]/.test(next)) return `${current}\n\n${next}`;
  return current + next;
}

/** Separates assistant turns using provider events, never sentence heuristics.
 * OpenCode CLI emits completed text parts with message IDs; Claude emits
 * complete assistant messages and an authoritative final result. Older
 * unstructured text events remain lossless until an explicit turn boundary.
 */
export class ModelOutput {
  private group = "initial";
  private seenGroups = new Set<string>();
  private parts = new Map<string, string>();
  private sequence = 0;
  private archivedLength = 0;
  private pendingUpdates: string[] = [];
  private needsAnswer = false;
  private result: string | undefined;
  private failed = false;
  exceededLimit = false;
  currentText = "";

  constructor(private runtime: "opencode" | "claude", private maximumLength = 512_000) {}

  private replace(text: string) {
    if (this.archivedLength + text.length > this.maximumLength) { this.exceededLimit = true; return; }
    this.currentText = text;
  }

  private archive() {
    if (this.currentText.trim()) {
      this.pendingUpdates.push(this.currentText);
      this.archivedLength += this.currentText.length;
    }
    this.currentText = "";
    this.parts.clear();
  }

  private begin(key: string): boolean {
    if (key === this.group) return true;
    if (this.seenGroups.has(key)) return false; // A replay must not replace a newer answer.
    this.seenGroups.add(this.group);
    this.archive();
    this.group = key;
    return true;
  }

  add(event: Event) {
    if (this.exceededLimit || this.failed) return;
    if (event.type === "error" || (event.type === "result" && (event.is_error === true || (typeof event.subtype === "string" && event.subtype.startsWith("error"))))) {
      this.failed = true;
      return;
    }
    if (this.result !== undefined) return;
    const part = record(event.part), message = record(event.message);
    if (typeof part?.messageID === "string" && `message:${part.messageID}` !== this.group && this.seenGroups.has(`message:${part.messageID}`)) return;
    if (this.runtime === "claude" && event.type === "result") {
      const text = eventText(event);
      if (text?.trim()) {
        if (text.trim() !== this.currentText.trim()) this.archive();
        this.replace(text);
        this.result = this.currentText;
        this.needsAnswer = false;
      }
      return;
    }
    if (this.runtime === "opencode" && event.type === "step_start") {
      if (this.begin(typeof part?.messageID === "string" ? `message:${part.messageID}` : `step:${++this.sequence}`) && !this.currentText.trim()) this.needsAnswer = true;
      return;
    }
    const text = eventText(event);
    if (this.runtime === "claude" && event.type === "assistant") {
      if (!this.begin(typeof message?.id === "string" ? `message:${message.id}` : `assistant:${++this.sequence}`)) return;
      this.replace(text || ""); // Complete messages replace snapshots, not append them.
      this.needsAnswer = Array.isArray(message?.content) && message.content.some((item) => record(item)?.type === "tool_use");
      return;
    }
    if (event.type === "text" && text !== null) {
      if (typeof part?.messageID === "string" && !this.begin(`message:${part.messageID}`)) return;
      if (typeof part?.id === "string") {
        // Completed parts can be replayed or updated. Keep each identity once.
        if (text.length + this.archivedLength > this.maximumLength) { this.exceededLimit = true; return; }
        this.parts.set(part.id, text);
        this.replace([...this.parts.values()].join("\n\n"));
      } else this.replace(appendModelText(this.currentText, text));
      if (text.trim()) this.needsAnswer = false;
    }
    if (event.type === "tool_use" || part?.type === "tool" || (event.type === "step_finish" && part?.reason === "tool-calls")) this.needsAnswer = true;
  }

  drainProgress(): string[] { return this.pendingUpdates.splice(0); }
  get finalText(): string { return this.failed || this.needsAnswer || this.exceededLimit ? "" : (this.result ?? this.currentText).trim(); }
  get failure(): string | null {
    return this.failed ? "The AI runtime reported that it could not finish this task. Review its work before trying again."
      : this.needsAnswer ? "The teammate stopped after an intermediate step without returning a finished answer. Its progress has been kept."
      : null;
  }
}
