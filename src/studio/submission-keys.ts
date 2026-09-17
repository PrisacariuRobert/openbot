/** Client-side submission keys for POST /api/messages (P01c).
 *
 * The host keeps a durable receipt per requestId (P01a): an exact retry with
 * the same key replays the original result instead of duplicating the
 * message, while the same key with a changed payload is a 409 conflict that
 * changes nothing. This store gives each send attempt the right key:
 * - retries of the same unsent content reuse the key (safe duplicate taps,
 *   lost responses, offline edges);
 * - anything deliberately new (edited text, different files, targets, thread,
 *   or a completed send) gets a fresh key;
 * - a 409 conflict rotates the key so the owner is never stuck behind a key
 *   that no longer matches their draft.
 *
 * The server digest remains the source of truth; this fingerprint only keeps
 * the key stable. Volatile fields (time zone) are deliberately excluded: if
 * they changed mid-retry the server answers 409 and the draft is kept.
 */
export type MessageSendScope = {
  threadId: string;
  body: string;
  targetBotIds: string[];
  attachmentIds: string[];
  replyToId: string | null;
  expectedWorkKind?: string;
};

export function sendScopeFingerprint(scope: MessageSendScope): string {
  return JSON.stringify({
    threadId: scope.threadId,
    body: scope.body,
    targetBotIds: [...scope.targetBotIds].sort(),
    attachmentIds: [...scope.attachmentIds],
    replyToId: scope.replyToId,
    expectedWorkKind: scope.expectedWorkKind ?? null,
  });
}

export function createSubmissionKeys(generate: () => string = () => crypto.randomUUID()) {
  let fingerprint = "";
  let key = generate();
  return {
    /** Stable key for this exact unsent content; fresh key for anything new. */
    keyFor(scope: MessageSendScope): string {
      const next = sendScopeFingerprint(scope);
      if (next !== fingerprint) {
        fingerprint = next;
        key = generate();
      }
      return key;
    },
    /** Call after a send resolves (delivered or replayed) or conflicts, so
     * the next deliberate send is new work instead of a replay. */
    rotate(): void {
      fingerprint = "";
      key = generate();
    },
  };
}

/** HTTP failures keep their server code, so the composer can tell a
 * request conflict (keep the draft, explain, rotate the key) apart from an
 * ordinary failure (keep the draft, offer a retry with the same key). */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function apiError(status: number, result: unknown, fallback: string): ApiError {
  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const message = typeof record.error === "string" && record.error ? record.error : fallback;
  const code = typeof record.code === "string" && record.code ? record.code : undefined;
  return new ApiError(message, status, code);
}
