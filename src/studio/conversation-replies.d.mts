export interface ReplyCapture {
  readonly threadId: string;
  readonly revision: number;
  readonly id: string;
  readonly senderName: string;
  readonly body: string;
}
export class ConversationReplies {
  view(threadId: string): ReplyCapture | null;
  choose(threadId: string, message: { threadId: string; id: string; senderName: string; body: string; kind: string }): boolean;
  clear(threadId: string): void;
  capture(threadId: string): ReplyCapture | null;
  clearSent(capture: ReplyCapture | null): void;
}
