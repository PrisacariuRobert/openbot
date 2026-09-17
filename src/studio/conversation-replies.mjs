/** Reply targets are scoped to the conversation, never to the visible component.
 * A late send acknowledgement cannot clear a newer choice, even the same message.
 */
export class ConversationReplies {
  #items = new Map();
  #revision = 0;
  view(threadId) { return this.#items.get(threadId) ?? null; }
  choose(threadId, message) {
    if (!threadId || message.threadId !== threadId || message.kind === 'event') return false;
    this.#items.set(threadId, Object.freeze({
      threadId, revision: ++this.#revision, id: message.id,
      senderName: message.senderName,
      body: message.body.slice(0, 500),
    }));
    return true;
  }
  clear(threadId) { this.#items.delete(threadId); }
  capture(threadId) { return this.view(threadId); }
  clearSent(capture) {
    if (capture && this.view(capture.threadId)?.revision === capture.revision) {
      this.#items.delete(capture.threadId);
    }
  }
}
