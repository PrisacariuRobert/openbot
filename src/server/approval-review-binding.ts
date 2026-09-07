import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function approvalReviewFingerprint(secret: string, binding: unknown): string {
  return createHmac("sha256", secret).update(JSON.stringify(canonical(binding))).digest("hex");
}

export function sameReviewFingerprint(provided: unknown, expected: string): boolean {
  return typeof provided === "string" && /^[a-f0-9]{64}$/.test(provided) && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export class ApprovalReviewChangedError extends Error {
  constructor(readonly mutationAttempted = false) {
    super(mutationAttempted
      ? "The reviewed connection changed after a request began. Check the original destination before preparing another action; its outcome is uncertain."
      : "The reviewed action or connected account changed. Refresh and review a new proposal before continuing.");
  }
}

export class ApprovedConnectorOutcomeUncertainError extends Error {
  constructor() {
    super("The approved request may have completed, but OpenBot could not confirm or record the full result. Its outcome is uncertain. Check the destination before preparing another action.");
  }
}

/** Scope checks to the approved operation, not unrelated concurrent reads.
 * Recheck immediately before fetch, including refresh/retry requests. No
 * credentials or action content are stored in this async context. */
export class ApprovedConnectorDispatch {
  private readonly context = new AsyncLocalStorage<{ unchanged: () => boolean; mutationAttempted: boolean }>();
  constructor(private readonly transport: typeof fetch = fetch) {}

  readonly fetch: typeof fetch = async (input, init) => {
    const active = this.context.getStore();
    if (active && !active.unchanged()) throw new ApprovalReviewChangedError(active.mutationAttempted);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    // Conservatively count any non-read request, including token exchange, as
    // a dispatch attempt; never turn uncertainty into an automatic resend.
    if (active && !["GET", "HEAD", "OPTIONS"].includes(method)) active.mutationAttempted = true;
    let response: Response;
    try {
      response = await this.transport(input, init);
    } catch (error) {
      if (active?.mutationAttempted) throw new ApprovedConnectorOutcomeUncertainError();
      throw error;
    }
    if (active && !active.unchanged()) throw new ApprovalReviewChangedError(active.mutationAttempted);
    return response;
  };

  run<T>(unchanged: () => boolean, operation: () => Promise<T>): Promise<T> {
    const active = { unchanged, mutationAttempted: false };
    return this.context.run(active, async () => {
      if (!unchanged()) throw new ApprovalReviewChangedError();
      try { return await operation(); }
      catch (error) {
        // A confirmed service response can still be followed by a failed local
        // activity log, receipt write or prompt update. Never turn that into a
        // safe-to-repeat failure merely because fetch itself succeeded.
        if (active.mutationAttempted) {
          if (error instanceof ApprovalReviewChangedError) throw error.mutationAttempted ? error : new ApprovalReviewChangedError(true);
          if (error instanceof ApprovedConnectorOutcomeUncertainError) throw error;
          throw new ApprovedConnectorOutcomeUncertainError();
        }
        throw error;
      }
    });
  }
}
