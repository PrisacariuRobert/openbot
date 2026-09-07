import { randomUUID } from "node:crypto";
import type { CodeCheckReceipt } from "../shared/code-checks.js";
import type { OpenBotDatabase } from "./database.js";
import type { CodeProjectManager } from "./code-projects.js";
import type { ComputerManager } from "./runtime.js";

export class CodeCheckService {
  private readonly pending = new Set<string>();
  constructor(private readonly db: OpenBotDatabase, private readonly projects: CodeProjectManager, private readonly computer: Pick<ComputerManager, "executeCodeProject">) {}

  async execute(botId: string, projectId: string, runId: string, command: string) {
    const run = this.db.getRun(runId), workspace = this.db.getCodeTaskWorkspace(runId);
    if (!run || run.botId !== botId || !["running", "awaiting_approval"].includes(run.status) || workspace?.projectId !== projectId) throw new Error("Run checks from an active isolated coding task.");
    if (this.pending.has(runId)) throw new Error("A check is still running in this task. Wait for it to finish before starting another.");
    if (this.db.listCodeChecks(runId).length >= 100) throw new Error("This task has reached its limit of 100 check attempts.");
    const project = this.projects.forRun(botId, projectId, runId);
    const access = project.access.find((item) => item.botId === botId)!;
    const before = this.projects.checkIdentity(botId, projectId, runId), cleanBefore = before.clean;
    const receipt: CodeCheckReceipt = { id: randomUUID(), runId, projectId, command, headCommit: before.headCommit, status: "running", exitCode: null, startedAt: new Date().toISOString(), finishedAt: null, detail: "Command is running. No successful result has been recorded." };
    this.pending.add(runId);
    this.db.saveCodeCheck(receipt);
    const started = performance.now();
    try {
      const result = await this.computer.executeCodeProject(botId, project.rootPath, command, access.canWrite);
      receipt.durationMs = Math.max(0, performance.now() - started);
      if (result.runtimeIdentity) receipt.runtimeIdentity = result.runtimeIdentity;
      const current = this.db.getRun(runId);
      const active = current && ["running", "awaiting_approval"].includes(current.status);
      this.projects.forRun(botId, projectId, runId); // Recheck permission after execution too.
      const after = this.projects.checkIdentity(botId, projectId, runId), cleanAfter = after.clean;
      const sameCommit = after.headCommit === receipt.headCommit && !result.sourceChanged;
      receipt.exitCode = result.code;
      receipt.status = !active ? "error" : !cleanBefore || !cleanAfter || !sameCommit ? "changed" : result.code === 0 ? "passed" : "failed";
      receipt.detail = !active ? "The task stopped before the check finished. Rerun it in an active task." : receipt.status === "changed" ? "This command was not run against one unchanged, clean commit. Commit the intended files and rerun the check." : `Command exited ${result.code}. Exit status is execution evidence, not proof that the chosen test covers the bug.`;
      return { ...result, check: { ...receipt, finishedAt: new Date().toISOString() } };
    } catch (error) {
      receipt.status = "error";
      receipt.detail = "The check could not finish. No successful execution was recorded.";
      throw error;
    } finally {
      receipt.finishedAt = new Date().toISOString();
      this.db.saveCodeCheck(receipt);
      this.pending.delete(runId);
      this.db.addActivity({ runId, botId, kind: receipt.status === "passed" ? "tool" : "error", label: receipt.status === "passed" ? "Project check passed" : "Project check needs attention", detail: `${command.slice(0, 180)} · ${receipt.headCommit.slice(0, 8)} · ${receipt.detail}`.slice(0, 400) });
    }
  }
}
