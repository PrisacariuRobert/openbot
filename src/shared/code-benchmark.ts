export interface CodeBenchmarkPhase {
  headCommit: string;
  samplesMs: number[];
  checkIds: string[];
  status: "running" | "complete" | "failed";
  recordedAt: string;
  detail: string;
  runtimeIdentity?: string;
}
export interface CodeBenchmark {
  runId: string;
  projectId: string;
  command: string;
  regressionCommands: string[];
  guardedFiles: Record<string, string>;
  environment: string;
  baseline: CodeBenchmarkPhase;
  candidates: CodeBenchmarkPhase[];
}
export function compareBenchmark(baseline: CodeBenchmarkPhase, candidate: CodeBenchmarkPhase) {
  const valid = (phase: CodeBenchmarkPhase) => phase.status === "complete" && phase.samplesMs.length === 5 && phase.samplesMs.every((ms) => Number.isFinite(ms) && ms > 0);
  if (!valid(baseline) || !valid(candidate) || !baseline.runtimeIdentity || baseline.runtimeIdentity !== candidate.runtimeIdentity) return { verdict: "unverified" as const, improvementPercent: null, reason: "Both phases need five valid measurements, the same recorded runtime and passing regression checks." };
  const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[2];
  const before = median(baseline.samplesMs), after = median(candidate.samplesMs), improvementPercent = (before - after) / before * 100;
  const separated = Math.max(...candidate.samplesMs) < Math.min(...baseline.samplesMs);
  return { verdict: separated && improvementPercent >= 10 ? "measured_reduction" as const : "inconclusive" as const, improvementPercent, reason: separated && improvementPercent >= 10 ? "The command’s median wall-clock duration fell by at least 10% and all five candidate samples were faster than all baseline samples. This is not proof of website performance or complete correctness." : "The observed difference is small or the sample ranges overlap. No reliable improvement is claimed." };
}

export function renderCodeBenchmark(value: CodeBenchmark) {
  const code = (text: string) => text.replace(/[\r\n]/g, " ");
  const phase = (label: string, value: CodeBenchmarkPhase) => `## ${label} — ${value.status}\n\nCommit: ${value.headCommit}\n\nSamples (ms): ${value.samplesMs.map((ms) => ms.toFixed(2)).join(", ") || "Not available"}\n\n${value.detail}\n\nRecorded checks: ${value.checkIds.join(", ")}`;
  return ["# Measured project experiment", "Host-recorded wall-clock time for a command in an isolated check view, including container preparation and process startup. This is not a Lighthouse score, Core Web Vitals measurement, statistical proof or a complete accessibility audit. Review the selected benchmark and regression tests for meaningful coverage. No change was applied to the owner’s checkout or published by this measurement tool.", `Benchmark command:\n\n    ${code(value.command)}`, `Regression commands:\n\n${value.regressionCommands.map((command) => `    ${code(command)}`).join("\n")}`, `Environment: ${value.environment}`, "Guarded test/input files (SHA-256):", ...Object.entries(value.guardedFiles).map(([file, digest]) => `    ${code(file)}  ${digest}`), phase("Baseline", value.baseline), ...value.candidates.flatMap((candidate, i) => [phase(`Candidate ${i + 1}`, candidate), `Comparison: ${compareBenchmark(value.baseline, candidate).reason}`])].join("\n\n") + "\n";
}
