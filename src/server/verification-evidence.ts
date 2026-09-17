import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { TaskVerificationCheck } from "../shared/types.js";
import { readWorkspaceFile } from "./workspace-files.js";

export interface WorkspaceFileEvidence {
  kind: "workspace_file";
  path: string;
  minBytes?: number;
  contains?: string[];
  /** P06b: SHA-256 hex of the exact bytes the reporter claims to have
   * checked. When present the host fails the check if the bytes moved
   * instead of certifying a file it never saw in that state. */
  expectedDigest?: string;
}

export interface VerificationCheckInput {
  label: string;
  passed: boolean;
  evidence?: WorkspaceFileEvidence;
}

export function verifyTaskChecks(root: string, checks: VerificationCheckInput[]): TaskVerificationCheck[] {
  return checks.map(({ evidence, ...reported }) => evidence
    ? verifyWorkspaceFileEvidence(root, reported.label, evidence)
    : { ...reported, source: "teammate", detail: null });
}

const BINARY_MARKERS = ["\u0000", "\uFFFD"];

export function verifyWorkspaceFileEvidence(root: string, label: string, evidence: WorkspaceFileEvidence): TaskVerificationCheck {
  // A readable note is not proof of whatever claim the model attached to it.
  // Host check labels must describe the predicate actually evaluated here.
  label = `Text-file check: ${evidence.path}`;
  const observedAt = new Date().toISOString();
  const predicate = "utf8-text:readable,min-bytes,markers-present";
  const file = readWorkspaceFile(root, evidence.path, 500_000);
  if (!file.ok) {
    return {
      label,
      passed: false,
      source: "host",
      detail: file.reason === "too_large" ? "The file is too large for the bounded verifier." : "The file could not be reopened inside this teammate's workspace.",
      predicate,
      inputDigest: null,
      outputDigest: null,
      observedAt,
    };
  }

  if (BINARY_MARKERS.some((marker) => file.content.includes(marker))) {
    return { label, passed: false, source: "host", detail: "This verifier accepts UTF-8 text only. Use a format-aware inspector for binary files; their contents and byte identity were not checked.", predicate, inputDigest: null, outputDigest: null, observedAt };
  }

  const bytes = Buffer.byteLength(file.content, "utf8");
  const missingContent = (evidence.contains || []).some((text) => !file.content.includes(text));
  const tooSmall = evidence.minBytes !== undefined && bytes < evidence.minBytes;
  const fullDigest = createHash("sha256").update(file.content).digest("hex");
  // P06b: a claimed observation binds exact bytes. Moved bytes fail the
  // check with both digests recorded — never a pass on unseen content.
  if (typeof evidence.expectedDigest === "string" && evidence.expectedDigest.toLowerCase() !== fullDigest) {
    return {
      label, passed: false, source: "host",
      detail: `The file changed since the reported observation (expected SHA-256 ${evidence.expectedDigest.slice(0, 12)}, reopened SHA-256 ${fullDigest.slice(0, 12)}). Re-check the current bytes instead of trusting the earlier claim.`,
      predicate, inputDigest: fullDigest, outputDigest: fullDigest, observedAt,
    };
  }
  const passed = !missingContent && !tooSmall;
  const digest = fullDigest.slice(0, 12);
  const reason = tooSmall
    ? `The file has ${bytes.toLocaleString()} bytes; at least ${evidence.minBytes!.toLocaleString()} were required.`
    : missingContent
      ? "The file reopened, but one or more required text markers were missing."
      : `${file.path} reopened successfully · ${bytes.toLocaleString()} bytes · SHA-256 ${digest}. Checked readability${evidence.minBytes !== undefined ? `, minimum ${evidence.minBytes} bytes` : ""}${evidence.contains?.length ? `, ${evidence.contains.length} required text marker(s)` : ""} only; not the correctness of claims in this file or other files.`;
  // Digests are recorded even on failure: a failed check still proves exactly
  // which bytes were examined, so same-named different bytes stay distinct.
  return { label, passed, source: "host", detail: reason, predicate, inputDigest: fullDigest, outputDigest: fullDigest, observedAt };
}
