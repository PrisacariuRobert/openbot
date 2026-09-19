/**
 * Q01 — Telemetry: separate clocks for admission/observation/decision/
 * gating/approval/input/settling/verification/total. Includes failed
 * attempts + modality. Provider-reported tokens/cost separate from estimates.
 * Active intervention time only where observable, else unknown (null).
 */

export type AttemptTelemetry = {
  attemptId: string;
  runId: string;
  modality: "semantic" | "visual" | "native" | "takeover";
  admissionMs: number;
  observationMs: number;
  decisionMs: number;
  gatingMs: number;
  approvalWaitMs: number;
  inputMs: number;
  settleMs: number;
  verificationMs: number;
  totalMs: number;
  succeeded: boolean;
  routeChanges: number;
  observations: number;
  imagesSent: number;
  modelCalls: number;
  toolCalls: number;
  staleRejections: number;
  retries: number;
};

export type CostTelemetry = {
  provider: string;
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
  reportedImageTokens: number | null;
  reportedCost: number | null;
  estimatedCost: number | null;
};

export function summarizeAttempts(attempts: AttemptTelemetry[]): {
  count: number;
  succeeded: number;
  medianTotalMs: number;
  p95TotalMs: number;
  totalImages: number;
  totalToolCalls: number;
} {
  const totals = attempts.map((attempt) => attempt.totalMs).sort((a, b) => a - b);
  const median = totals.length ? totals[Math.floor(totals.length / 2)]! : 0;
  const p95 = totals.length ? totals[Math.min(totals.length - 1, Math.floor(totals.length * 0.95))]! : 0;
  return {
    count: attempts.length,
    succeeded: attempts.filter((attempt) => attempt.succeeded).length,
    medianTotalMs: median,
    p95TotalMs: p95,
    totalImages: attempts.reduce((sum, attempt) => sum + attempt.imagesSent, 0),
    totalToolCalls: attempts.reduce((sum, attempt) => sum + attempt.toolCalls, 0),
  };
}

/** Active owner time: wall-clock approval waiting is NOT human labour.
 * Only explicitly observed interaction counts; otherwise null. */
export function activeOwnerTimeMs(input: { observedInteractionMs: number | null }): number | null {
  return input.observedInteractionMs;
}
