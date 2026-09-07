import { createHash } from "node:crypto";
import { hostname, platform, arch, release } from "node:os";
import { z } from "zod";
import type { CodeBenchmark, CodeBenchmarkPhase } from "../shared/code-benchmark.js";
import { compareBenchmark } from "../shared/code-benchmark.js";
import type { OpenBotDatabase } from "./database.js";
import type { CodeProjectManager } from "./code-projects.js";
import type { CodeCheckService } from "./code-checks.js";
import { commandApprovalReason } from "./safety.js";

export const benchmarkInput = z.object({
  projectId: z.string().uuid(), phase: z.enum(["baseline", "candidate"]),
  command: z.string().trim().min(1).max(1000),
  regressionCommands: z.array(z.string().trim().min(1).max(1000)).min(1).max(3),
  guardedFiles: z.array(z.string().trim().min(1).max(240)).min(2).max(12),
}).strict();
const KIND = "code-benchmark";
export class CodeBenchmarkService {
  private readonly pending = new Set<string>();
  constructor(private readonly db: OpenBotDatabase, private readonly projects: CodeProjectManager, private readonly checks: Pick<CodeCheckService, "execute">) {}
  get(runId: string) { return this.db.extensionRecord<CodeBenchmark>(KIND, runId); }
  async measure(botId: string, runId: string, raw: unknown) {
    const input = benchmarkInput.parse(raw), run = this.db.getRun(runId);
    if (!run || run.botId !== botId || run.status !== "running") throw new Error("Measure from an active isolated coding task.");
    if (this.pending.has(runId)) throw new Error("An experiment is already running. Wait for its receipt.");
    this.projects.forRun(botId, input.projectId, runId);
    const identity = this.projects.checkIdentity(botId, input.projectId, runId);
    if (!identity.clean) throw new Error("Commit the intended files before measuring an exact revision.");
    for (const command of [input.command, ...input.regressionCommands]) if (commandApprovalReason(command)) throw new Error("This experiment only accepts bounded check commands that do not need additional approval. Use ordinary code_run with review for sensitive commands.");
    if (input.regressionCommands.includes(input.command) || new Set(input.regressionCommands).size !== input.regressionCommands.length || new Set(input.guardedFiles).size !== input.guardedFiles.length) throw new Error("Choose separate benchmark and regression commands, with unique guarded input files.");
    const fingerprints = () => Object.fromEntries([...input.guardedFiles].sort().map((file) => {
      const value = this.projects.read(botId, input.projectId, file, runId);
      return [value.path, createHash("sha256").update(value.content).digest("hex")];
    }));
    const guardedFiles = fingerprints();
    const environment = createHash("sha256").update(JSON.stringify([hostname(), platform(), arch(), release(), process.version, process.env.OPENBOT_COMPUTER_IMAGE || "openbot-runtime"])).digest("hex");
    const prior = this.get(runId);
    if (input.phase === "baseline" && prior) throw new Error("This task already has a baseline. Keep it unchanged; start a new task for a different experiment.");
    if (input.phase === "candidate" && (!prior || prior.baseline.status !== "complete")) throw new Error("Finish a passing baseline before comparing a candidate.");
    if (input.phase === "candidate" && prior) {
      if (prior.candidates.length >= 2) throw new Error("This task has used its two candidate experiments. Review the evidence before starting another task.");
      if (prior.projectId !== input.projectId || prior.command !== input.command || JSON.stringify(prior.regressionCommands) !== JSON.stringify(input.regressionCommands) || JSON.stringify(prior.guardedFiles) !== JSON.stringify(guardedFiles) || prior.environment !== environment) throw new Error("The benchmark, regression tests, guarded files or host environment changed. These measurements would not be comparable.");
      if (prior.baseline.headCommit === identity.headCommit) throw new Error("Commit a candidate change before comparing it with the baseline.");
    }
    const phase: CodeBenchmarkPhase = { headCommit: identity.headCommit, samplesMs: [], checkIds: [], status: "running", recordedAt: new Date().toISOString(), detail: "Measurement started; no outcome is established." };
    const experiment: CodeBenchmark = prior || { runId, projectId: input.projectId, command: input.command, regressionCommands: input.regressionCommands, guardedFiles, environment, baseline: phase, candidates: [] };
    if (input.phase === "candidate") experiment.candidates.push(phase);
    this.pending.add(runId); this.db.saveExtensionRecord(KIND, runId, experiment);
    const guard = () => {
      const current = this.db.getRun(runId);
      this.projects.forRun(botId, input.projectId, runId);
      const currentIdentity = this.projects.checkIdentity(botId, input.projectId, runId);
      if (current?.status !== "running" || !currentIdentity.clean || currentIdentity.headCommit !== phase.headCommit || JSON.stringify(fingerprints()) !== JSON.stringify(guardedFiles)) throw new Error("The task, code or test inputs changed during measurement.");
    };
    const execute = async (command: string) => {
      guard(); const result = await this.checks.execute(botId, input.projectId, runId, command); phase.checkIds.push(result.check.id); guard();
      if (result.check.status !== "passed") throw new Error("A benchmark or regression check failed. No improvement is verified.");
      if (!result.check.runtimeIdentity) throw new Error("The check runtime identity was not recorded. These measurements cannot be compared.");
      if ((phase.runtimeIdentity && phase.runtimeIdentity !== result.check.runtimeIdentity) || (input.phase === "candidate" && experiment.baseline.runtimeIdentity !== result.check.runtimeIdentity)) throw new Error("The check runtime changed during the experiment. No comparable improvement is established.");
      phase.runtimeIdentity = result.check.runtimeIdentity;
      return result.check.durationMs;
    };
    try {
      for (const command of input.regressionCommands) await execute(command);
      await execute(input.command); // Declared warm-up, excluded from samples.
      for (let index = 0; index < 5; index++) {
        const elapsed = await execute(input.command);
        if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed <= 0) throw new Error("The host did not record a usable duration.");
        phase.samplesMs.push(elapsed); this.db.saveExtensionRecord(KIND, runId, experiment);
      }
      for (const command of input.regressionCommands) await execute(command);
      phase.status = "complete"; phase.detail = "One warm-up excluded; five samples recorded. Selected regression commands passed before and after measurement, on the same clean commit. Guarded test inputs were unchanged.";
    } catch (error) {
      phase.status = "failed"; phase.detail = error instanceof Error ? error.message : "Measurement failed; no successful outcome was recorded.";
    } finally { this.db.saveExtensionRecord(KIND, runId, experiment); this.pending.delete(runId); }
    return { experiment, comparison: input.phase === "candidate" ? compareBenchmark(experiment.baseline, phase) : null };
  }
}
