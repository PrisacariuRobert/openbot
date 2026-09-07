export interface CodeCheckReceipt {
  id: string;
  runId: string;
  projectId: string;
  command: string;
  headCommit: string;
  status: "running" | "passed" | "failed" | "changed" | "error";
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  detail: string;
  durationMs?: number;
  runtimeIdentity?: string;
}

export function passingCodeChecks(receipts: CodeCheckReceipt[], headCommit: string): CodeCheckReceipt[] {
  // Input is newest first. A later failing rerun invalidates an earlier success.
  const latest = new Map<string, CodeCheckReceipt>();
  for (const receipt of receipts) if (receipt.headCommit === headCommit && !latest.has(receipt.command)) latest.set(receipt.command, receipt);
  const checks = [...latest.values()];
  if (!checks.length) throw new Error("Run project checks after committing this exact change. A teammate’s reported checkboxes are not execution evidence.");
  if (checks.some((receipt) => receipt.status !== "passed")) throw new Error("Some checks for this commit failed, were interrupted, or changed the code. Rerun them successfully before review or publishing.");
  return checks;
}
