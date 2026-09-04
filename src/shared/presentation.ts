// Conversation history is evidence, not UI copy. Never turn a refusal, a
// queued action, or a one-way message into a promise or a successful outcome.
// Friendly progress belongs in structured activity labels, not rewritten text.
export function presentBotMessage(body: string, _options: { macAccessEnabled?: boolean } = {}): string {
  return body;
}

export const signalKindLabels: Record<string, string> = {
  question: "asked",
  finding: "shared",
  handoff: "passed along",
  message: "updated",
};
