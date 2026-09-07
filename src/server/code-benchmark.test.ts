import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { OpenBotDatabase } from "./testing/database.js";
import { CodeProjectManager } from "./code-projects.js";
import { CodeCheckService } from "./code-checks.js";
import { CodeBenchmarkService } from "./code-benchmark.js";
import { compareBenchmark, renderCodeBenchmark } from "../shared/code-benchmark.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-experiment-")), source = path.join(root, "site"); mkdirSync(source);
  const git = (...args: string[]) => { const result = spawnSync("git", args, { cwd: source, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git("init", "-b", "main");
  writeFileSync(path.join(source, "implementation.cjs"), "module.exports = { correct: true, delay: 18 };\n");
  writeFileSync(path.join(source, "benchmark.cjs"), "const x = require('./implementation.cjs'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, x.delay);\n");
  writeFileSync(path.join(source, "regression.cjs"), "require('node:assert/strict').equal(require('./implementation.cjs').correct, true);\n");
  git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "Fixture");
  const db = new OpenBotDatabase(root), projects = new CodeProjectManager(db, root);
  const project = db.createCodeProject({ name: "Fixture", ...projects.inspectRoot(source), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }] });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Measure a bounded experiment" });
  projects.branch("nova", project.id, "openbot/experiment", run.id);
  const calls: string[] = [];
  const checks = new CodeCheckService(db, projects, { executeCodeProject: async (_bot, cwd, command) => {
    assert.ok(["node benchmark.cjs", "node regression.cjs"].includes(command)); calls.push(command);
    const result = spawnSync(process.execPath, [command.split(" ")[1]], { cwd, env: {}, encoding: "utf8", timeout: 3000 });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, runtimeIdentity: "fixture-host-node" };
  } });
  const service = new CodeBenchmarkService(db, projects, checks);
  const input = { projectId: project.id, command: "node benchmark.cjs", regressionCommands: ["node regression.cjs"], guardedFiles: ["benchmark.cjs", "regression.cjs"] };
  const change = (correct: boolean, delay: number) => { projects.write("nova", project.id, "implementation.cjs", `module.exports = { correct: ${correct}, delay: ${delay} };\n`, run.id); projects.commit("nova", project.id, "Candidate", ["implementation.cjs"], run.id); };
  return { root, source, db, projects, project, run, service, input, calls, change, measure: (phase: string) => service.measure("nova", run.id, { ...input, phase }), close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("project experiments execute repeatable checks on exact revisions and never alter the owner checkout", async () => {
  const f = fixture();
  try {
    const original = readFileSync(path.join(f.source, "implementation.cjs"), "utf8");
    const baseline = await f.measure("baseline");
    assert.equal(baseline.experiment.baseline.status, "complete"); assert.equal(baseline.experiment.baseline.samplesMs.length, 5); assert.equal(f.calls.length, 8);
    await assert.rejects(f.measure("baseline"), /already has a baseline/);
    f.change(true, 0);
    const candidate = await f.measure("candidate");
    assert.equal(candidate.experiment.candidates[0].status, "complete"); assert.equal(candidate.experiment.candidates[0].samplesMs.length, 5);
    assert.notEqual(candidate.experiment.baseline.headCommit, candidate.experiment.candidates[0].headCommit);
    assert.equal(readFileSync(path.join(f.source, "implementation.cjs"), "utf8"), original);
    assert.match(renderCodeBenchmark(candidate.experiment), /not a Lighthouse score/);
    const reopen = new OpenBotDatabase(f.root); try { assert.equal(new CodeBenchmarkService(reopen, f.projects, {} as CodeCheckService).get(f.run.id)?.baseline.status, "complete"); } finally { reopen.close(); }
  } finally { f.close(); }
});

test("a faster broken candidate cannot be a win; changed oracle files cannot be compared", async () => {
  const f = fixture();
  try {
    await f.measure("baseline"); f.change(false, 0);
    const candidate = await f.measure("candidate");
    assert.equal(candidate.comparison?.verdict, "unverified"); assert.equal(candidate.experiment.candidates[0].status, "failed");
    f.projects.write("nova", f.project.id, "regression.cjs", "// weakened test\n", f.run.id); f.projects.commit("nova", f.project.id, "Weak oracle", ["regression.cjs"], f.run.id);
    await assert.rejects(f.measure("candidate"), /guarded files/);
  } finally { f.close(); }
});

test("candidate budget, revoked access and cancellation are enforced", async () => {
  const f = fixture();
  try {
    await f.measure("baseline"); f.change(true, 1); await f.measure("candidate"); f.change(true, 2); await f.measure("candidate");
    await assert.rejects(f.measure("candidate"), /two candidate/);
    f.db.setCodeProjectAccess(f.project.id, "nova", { canRead: true, canWrite: true, canRun: false }); await assert.rejects(f.measure("candidate"), /run access/);
    f.db.cancelRun(f.run.id); await assert.rejects(f.measure("candidate"), /active isolated/);
  } finally { f.close(); }
});

test("the comparison rule rejects noise, invalid samples and runtime changes", () => {
  const phase = { headCommit: "a".repeat(40), samplesMs: [100, 101, 102, 103, 104], checkIds: [], status: "complete" as const, recordedAt: "2026-09-05", detail: "fixture", runtimeIdentity: "fixture" };
  assert.equal(compareBenchmark(phase, { ...phase, samplesMs: [70, 71, 72, 73, 74] }).verdict, "measured_reduction");
  assert.equal(compareBenchmark(phase, { ...phase, samplesMs: [90, 95, 100, 105, 110] }).verdict, "inconclusive");
  assert.equal(compareBenchmark(phase, { ...phase, samplesMs: [NaN, 0, 1, 2, 3] }).verdict, "unverified");
  assert.equal(compareBenchmark(phase, { ...phase, runtimeIdentity: "changed" }).verdict, "unverified");
});
