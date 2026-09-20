/**
 * T02 — Outcome-specific verification + accountable consultation.
 *
 * Backend-only. No Codex UI/client changes (read-only hint:
 * src/studio/DeliveryReceipt.tsx presentation preserved).
 *
 * Tool success ≠ observation ≠ effect confirmation ≠ verified outcome.
 * A model DONE is a proposal, not automatic completion. Reviews bind to
 * exact source/version + minimal context; stale artifacts cannot certify
 * newer documents/commits.
 */

export type EvidenceType = "tool-return" | "observed-state" | "independent-readback" | "semantic-review";

export type OutcomePredicate = {
  predicateId: string;
  resourceId: string;
  account: string;
  expectedDigest: string;
  evidence: EvidenceType;
  checkedAt: string;
  passed: boolean;
  unresolved: string | null;
};

export function verifyOutcome(
  observed: { resourceId: string; account: string; digest: string },
  expected: { resourceId: string; account: string; digest: string },
  evidence: EvidenceType,
): OutcomePredicate {
  const passed =
    observed.resourceId === expected.resourceId && observed.account === expected.account && observed.digest === expected.digest;
  // Screenshot-only "verified" never covers unexamined data: tool-return and
  // observed-state alone cannot yield a verified outcome for content tasks.
  const sufficient = evidence === "independent-readback" || evidence === "semantic-review";
  return {
    predicateId: `pred_${Date.now().toString(36)}`,
    resourceId: expected.resourceId,
    account: expected.account,
    expectedDigest: expected.digest,
    evidence,
    checkedAt: new Date().toISOString(),
    passed: passed && sufficient,
    unresolved: passed ? (sufficient ? null : "evidence-insufficient: independent readback required") : "mismatch",
  };
}

/** Review binding: reject stale handoff artifacts + sibling-private access. */
export function reviewBindingValid(input: {
  artifactRevision: string;
  currentRevision: string;
  artifactThreadId: string;
  reviewerThreadId: string;
  siblingPrivate: boolean;
}): boolean {
  if (input.siblingPrivate) return false;
  if (input.artifactThreadId !== input.reviewerThreadId) return false;
  return input.artifactRevision === input.currentRevision;
}

/** One lead accountable; consultations earn their cost with findings + refs. */
export type Consultation = {
  leadRunId: string;
  specialistRunId: string;
  sourceRevision: string;
  findings: string;
  references: string[];
};

export function consultationAccountable(consultation: Consultation): boolean {
  return consultation.leadRunId !== consultation.specialistRunId && consultation.references.length > 0 && consultation.findings.length > 0;
}
