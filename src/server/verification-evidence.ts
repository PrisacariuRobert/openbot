import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { TaskVerificationCheck } from "../shared/types.js";
import { readWorkspaceFile } from "./workspace-files.js";

export interface WorkspaceFileEvidence {
  kind: "workspace_file";
  path: string;
  minBytes?: number;
  contains?: string[];
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

export function verifyWorkspaceFileEvidence(root: string, label: string, evidence: WorkspaceFileEvidence): TaskVerificationCheck {
  const file = readWorkspaceFile(root, evidence.path, 500_000);
  if (!file.ok) {
    return {
      label,
      passed: false,
      source: "host",
      detail: file.reason === "too_large" ? "The file is too large for the bounded verifier." : "The file could not be reopened inside this teammate's workspace.",
    };
  }

  const bytes = Buffer.byteLength(file.content, "utf8");
  const missingContent = (evidence.contains || []).some((text) => !file.content.includes(text));
  const tooSmall = evidence.minBytes !== undefined && bytes < evidence.minBytes;
  const passed = !missingContent && !tooSmall;
  const digest = createHash("sha256").update(file.content).digest("hex").slice(0, 12);
  const reason = tooSmall
    ? `The file has ${bytes.toLocaleString()} bytes; at least ${evidence.minBytes!.toLocaleString()} were required.`
    : missingContent
      ? "The file reopened, but one or more required text markers were missing."
      : `${file.path} reopened successfully · ${bytes.toLocaleString()} bytes · SHA-256 ${digest}`;
  return { label, passed, source: "host", detail: reason };
}
