import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { OpenCodeRunner } from "./opencode.js";
import { AttachmentService } from "./attachments.js";
import {
  DEFAULT_EXECUTION_LIMITS,
  type ExecutionLimits,
} from "./execution-policy.js";

// Real OS processes, no model credentials or external requests. A child fixture
// can deliberately hang, ignore TERM, stream malformed output or report usage.
function fixture(script: string, limits: Partial<ExecutionLimits> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-execution-test-"));
  const db = new OpenBotDatabase(root);
  let child: ChildProcess;
  const runner = new OpenCodeRunner({
    db,
    internalToken: "fixture",
    internalUrl: "http://127.0.0.1:1",
    onChange: () => {},
    attachments: new AttachmentService(db),
    limits: { ...DEFAULT_EXECUTION_LIMITS, terminationGraceMs: 50, ...limits },
    spawnProcess: (_command, _args, options) => {
      child = spawn(process.execPath, ["--input-type=module", "-e", script], {
        ...options,
        env: {},
      });
      return child;
    },
  });
  const run = db.createRun({
    threadId: "bot-nova",
    botId: "nova",
    prompt: "Fixture task",
    status: "queued",
  });
  const start = async () => {
    runner["executeRun"](db.getRun(run.id)!);
    await once(child!, "close");
    return db.getRun(run.id)!;
  };
  const close = async () => {
    await runner.stop();
    db.close();
    rmSync(root, { recursive: true, force: true });
  };
  return { db, runner, run, start, close, child: () => child! };
}

test(
  "stalled worker is force-stopped, preserving prior progress and its real failure reason",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'process.on("SIGTERM", () => {}); console.log(JSON.stringify({type:"text",text:"Partial work"})); setInterval(()=>{},1000)',
      { maxIdleMs: 100 },
    );
    try {
      const run = await f.start();
      assert.equal(run.status, "failed");
      assert.match(run.error || "", /stopped making progress/);
      assert.equal(run.partialText, "Partial work");
      assert.equal(f.child().signalCode, "SIGKILL");
      assert.ok(run.activeDurationMs >= 100);
      assert.equal(
        f.db
          .getState(run.threadId)
          .messages.some((message) => message.runId === run.id),
        false,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "weekly usage is persisted before process exit and is not counted twice",
  { timeout: 5000 },
  async () => {
    const event = {
      type: "step_finish",
      part: { id: "one", tokens: { input: 40, output: 10 }, cost: 0.02 },
    };
    const f = fixture(
      `console.log(${JSON.stringify(JSON.stringify(event))});setTimeout(()=>console.log(JSON.stringify({type:"text",text:"done"})),500);`,
    );
    try {
      f.db.updateRun(f.run.id, {
        inputTokens: 7,
        outputTokens: 3,
        modelSteps: 2,
        activeDurationMs: 50,
      });
      const done = f.start();
      await once(f.child().stdout!, "data");
      assert.equal(f.db.getRun(f.run.id)?.inputTokens, 47);
      assert.equal(f.db.getBot("nova")?.tokensUsedThisWeek, 60);
      const result = await done;
      assert.equal(result.status, "completed");
      assert.equal(result.inputTokens, 47);
      assert.equal(result.outputTokens, 13);
      assert.equal(result.cost, 0.02);
      assert.equal(result.modelSteps, 3);
    } finally {
      await f.close();
    }
  },
);

test(
  "a reported weekly budget overrun stops without posting a false success",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'console.log(JSON.stringify({type:"step_finish",part:{id:"a",tokens:{input:110,output:5}}}));setInterval(()=>{},1000)',
    );
    try {
      f.db.updateBot("nova", { weeklyTokenBudget: 100 });
      const result = await f.start();
      assert.equal(result.status, "failed");
      assert.match(result.error || "", /weekly token limit/);
      assert.equal(result.inputTokens, 110);
      assert.equal(f.db.getBot("nova")?.tokensUsedThisWeek, 115);
    } finally {
      await f.close();
    }
  },
);

test(
  "output without newlines is bounded and plain runtime logs are not published as answers",
  { timeout: 5000 },
  async () => {
    const flood = fixture(
      'process.stdout.write("x".repeat(5000));setInterval(()=>{},1000)',
      { maxOutputBytes: 1000 },
    );
    try {
      assert.match((await flood.start()).error || "", /too much output/);
    } finally {
      await flood.close();
    }
    const log = fixture(
      'console.log("Provider disconnected: reconnect needed")',
    );
    try {
      const result = await log.start();
      assert.equal(result.status, "failed");
      assert.equal(
        log.db
          .getState(result.threadId)
          .messages.some((message) => message.runId === result.id),
        false,
      );
    } finally {
      await log.close();
    }
  },
);

test("a stopped run cannot reset its persisted step allowance by resuming", async () => {
  const f = fixture('throw new Error("must not spawn")', { maxSteps: 2 });
  try {
    f.db.updateRun(f.run.id, { modelSteps: 2 });
    f.runner["executeRun"](f.db.getRun(f.run.id)!);
    assert.equal(f.db.getRun(f.run.id)?.status, "failed");
    assert.match(f.db.getRun(f.run.id)?.error || "", /step limit/);
    assert.equal(f.child(), undefined);
  } finally {
    await f.close();
  }
});

test(
  "active-time limit stops even a worker that keeps emitting progress",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'setInterval(()=>console.log(JSON.stringify({type:"text",text:"still working "})),20)',
      { maxActiveMs: 150, maxIdleMs: 500 },
    );
    try {
      assert.match((await f.start()).error || "", /time limit/);
    } finally {
      await f.close();
    }
  },
);

test(
  "per-task token limits stop a worker below its larger weekly allowance",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'console.log(JSON.stringify({type:"step_finish",part:{id:"a",tokens:{input:55,output:5}}}));setInterval(()=>{},1000)',
      { maxTokens: 50 },
    );
    try {
      const result = await f.start();
      assert.match(result.error || "", /task reached its token limit/);
      assert.equal(result.inputTokens, 55);
      const reopened = new OpenBotDatabase(f.db.rootDir);
      try {
        assert.equal(reopened.getRun(result.id)?.modelSteps, 1);
        assert.equal(reopened.getRun(result.id)?.inputTokens, 55);
        assert.equal(
          reopened.getRun(result.id)?.activeDurationMs,
          result.activeDurationMs,
        );
      } finally {
        reopened.close();
      }
    } finally {
      await f.close();
    }
  },
);

test(
  "stopping a coordinator also cancels nested work and pending approvals",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'process.on("SIGTERM",()=>{});console.log(JSON.stringify({type:"text",text:"Starting"}));setInterval(()=>{},1000)',
    );
    try {
      const done = f.start();
      await once(f.child().stdout!, "data");
      const child = f.db.createRun({
        threadId: f.run.threadId,
        botId: "pixel",
        parentRunId: f.run.id,
        prompt: "Consult",
        status: "queued",
      });
      const nested = f.db.createRun({
        threadId: f.run.threadId,
        botId: "scout",
        parentRunId: child.id,
        prompt: "Check",
        status: "running",
      });
      f.db.createApproval({
        runId: nested.id,
        botId: "scout",
        kind: "external",
        reason: "Review",
        actionLabel: "Fixture",
        action: {},
      });
      assert.equal(f.runner.cancelTask(f.run.id), true);
      const result = await done;
      assert.equal(result.status, "cancelled");
      assert.equal(f.db.getRun(child.id)?.status, "cancelled");
      assert.equal(f.db.getRun(nested.id)?.status, "cancelled");
      assert.equal(f.db.listApprovals().length, 0);
    } finally {
      await f.close();
    }
  },
);

test(
  "stopping for an approval preserves the decision and recorded usage",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'process.on("SIGTERM",()=>{});console.log(JSON.stringify({type:"step_finish",part:{id:"a",tokens:{input:10,output:2}}}));setInterval(()=>{},1000)',
    );
    try {
      const done = f.start();
      await once(f.child().stdout!, "data");
      const approval = f.db.createApproval({
        runId: f.run.id,
        botId: "nova",
        kind: "external",
        reason: "Review email",
        actionLabel: "Send fixture",
        action: {},
      });
      f.runner.cancel(f.run.id);
      const result = await done;
      assert.equal(result.status, "awaiting_approval");
      assert.equal(result.inputTokens, 10);
      assert.equal(f.db.listApprovals()[0]?.id, approval.id);
      assert.equal(f.db.listApprovals()[0]?.status, "pending");
    } finally {
      await f.close();
    }
  },
);

test(
  "shutdown waits for an uncooperative worker before requeuing its saved work",
  { timeout: 5000 },
  async () => {
    const f = fixture(
      'process.on("SIGTERM",()=>{});console.log(JSON.stringify({type:"text",text:"Saved partial answer"}));console.log(JSON.stringify({type:"step_finish",part:{id:"a",tokens:{input:10,output:2}}}));setInterval(()=>{},1000)',
    );
    try {
      f.db.claimNextQueuedRun([], f.runner.instanceId);
      const done = f.start();
      await once(f.child().stdout!, "data");
      const stopped = f.runner.stop();
      assert.equal(f.db.getRun(f.run.id)?.status, "running");
      await stopped;
      await done;
      const resumed = f.db.getRun(f.run.id)!;
      assert.equal(f.child().signalCode, "SIGKILL");
      assert.equal(resumed.status, "queued");
      assert.equal(resumed.partialText, "Saved partial answer");
      assert.equal(resumed.inputTokens, 10);
      assert.equal(resumed.modelSteps, 1);
    } finally {
      await f.close();
    }
  },
);
