import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { CodeProjectManager } from "./code-projects.js";
import { CodeCheckService } from "./code-checks.js";
import { AttachmentService } from "./attachments.js";
import { deliverCodeChange, type CodeDeliveryReceipt } from "./code-delivery.js";
import { GitHubWriteUncertainError, withPinnedGitHubWriteIdentity } from "./github-write-identity.js";

// Production Git workspaces, command receipts, publication review, pinned writer
// and action journal. Repairs are scripted; GitHub and model output are not real.
// The injected transport rejects every undeclared endpoint/command and never
// reads owner credentials or contacts a network service.
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-delivery-"));
  const source = path.join(root, "shop");
  mkdirSync(source);
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync("git", args, {
      cwd, encoding: "utf8", timeout: 10_000,
      env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const broken = "module.exports = items => items.reduce((sum, item) => sum + item.price, 0);\n";
  const fixed = broken.replace("sum + item.price", "sum + item.price * item.quantity");
  const oracle = "const assert = require('node:assert/strict'); const total = require('./total.cjs'); assert.equal(total([{price:12,quantity:3},{price:5,quantity:2}]),46); assert.equal(total([]),0);\n";
  writeFileSync(path.join(source, "total.cjs"), broken);
  writeFileSync(path.join(source, "total.test.cjs"), oracle);
  git(source, "init", "-b", "main");
  git(source, "config", "core.hooksPath", "/dev/null");
  git(source, "config", "commit.gpgsign", "false");
  git(source, "add", ".");
  git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "Reproduce quantity bug");
  git(source, "remote", "add", "origin", "https://github.com/fixture/shop.git");
  const initialCommit = git(source, "rev-parse", "HEAD");
  const db = new OpenBotDatabase(root);
  let accountLogin = "fixture-owner", remoteBase = initialCommit, remoteHead = "", failAfterPush = false;
  let remotePull: Record<string, unknown> | null = null;
  const writes: Array<{ kind: "push" | "pull"; target: string; body: unknown }> = [];
  const reads: string[] = [];
  const projects = new CodeProjectManager(db, root, {
    withGitHubIdentity: (expected, operation) => withPinnedGitHubWriteIdentity(expected, operation, {
      environment: { PATH: process.env.PATH, HOME: root, GH_TOKEN: "fixture-token-not-a-real-credential", GH_HOST: "github.com" },
      command: async (command, args, options) => {
        assert.equal(command, "git", "No account-discovery or arbitrary commands are allowed");
        if (args.includes("push")) {
          const target = args.at(-2)!, refspec = args.at(-1)!;
          assert.equal(target, "https://github.com/fixture/shop.git");
          assert.match(refspec, /^[a-f0-9]{40}:refs\/heads\/openbot\/fix-quantity$/);
          writes.push({ kind: "push", target, body: refspec });
          remoteHead = refspec.split(":")[0]!;
          if (failAfterPush) throw new Error("Fixture connection ended after branch upload");
          return { stdout: "" };
        }
        assert.ok(args[0] === "rev-parse" || (args[0] === "init" && args.includes("--bare")), "Unexpected publication command");
        const result = spawnSync(command, args, { ...options, encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        return { stdout: result.stdout };
      },
      fetch: (async (input, init) => {
        const url = new URL(String(input)), method = init?.method || "GET";
        assert.equal(url.origin, "https://api.github.com");
        assert.equal(init?.redirect, "manual");
        if (method === "GET") {
          reads.push(url.pathname);
          if (url.pathname === "/user") return Response.json({ login: accountLogin });
          if (url.pathname === "/repos/fixture/shop") return Response.json({ full_name: "fixture/shop", html_url: "https://github.com/fixture/shop", archived: false, disabled: false, permissions: { push: true } });
          if (url.pathname === "/repos/fixture/shop/git/ref/heads/main") return Response.json({ ref: "refs/heads/main", object: { type: "commit", sha: remoteBase } });
          if (url.pathname === "/repos/fixture/shop/git/ref/heads/openbot/fix-quantity") return Response.json({ ref: "refs/heads/openbot/fix-quantity", object: { type: "commit", sha: remoteHead } });
          if (url.pathname === "/repos/fixture/shop/pulls") return Response.json(remotePull ? [remotePull] : []);
          if (url.pathname === "/repos/fixture/shop/pulls/17" && remotePull) return Response.json(remotePull);
        }
        if (method === "POST" && url.pathname === "/repos/fixture/shop/pulls") {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          assert.ok(remoteHead, "A PR cannot be created before its checked commit is uploaded");
          assert.equal(body.head, "openbot/fix-quantity");
          assert.equal(body.base, "main");
          writes.push({ kind: "pull", target: url.pathname, body });
          remotePull = {
            ...body, number: 17, html_url: "https://github.com/fixture/shop/pull/17",
            head: { ref: body.head, sha: remoteHead, repo: { full_name: "fixture/shop" } },
            base: { ref: body.base, sha: remoteBase, repo: { full_name: "fixture/shop" } },
          };
          return Response.json(remotePull);
        }
        throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
      }) as typeof fetch,
    }),
  });
  const project = db.createCodeProject({ name: "Shop", ...projects.inspectRoot(source), access: [
    { botId: "nova", canRead: true, canWrite: true, canRun: true },
    { botId: "pixel", canRead: true, canWrite: false, canRun: false },
  ] });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Repair the quantity calculation and deliver a reviewed pull request." });
  projects.branch("nova", project.id, "openbot/fix-quantity", run.id);
  const workspace = db.getCodeTaskWorkspace(run.id)!.rootPath;
  const checks = new CodeCheckService(db, projects, { executeCodeProject: async (_bot, cwd, command) => {
    assert.equal(cwd, workspace);
    assert.equal(command, "node total.test.cjs");
    assert.equal(readFileSync(path.join(cwd, "total.test.cjs"), "utf8"), oracle, "The independent oracle may not be weakened");
    assert.ok([broken, fixed].includes(readFileSync(path.join(cwd, "total.cjs"), "utf8")), "Only fixed fixture programs may execute");
    const result = spawnSync(process.execPath, ["total.test.cjs"], { cwd, env: {}, encoding: "utf8", timeout: 5_000 });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, runtimeIdentity: "controlled-host-node-fixture" };
  } });
  const execute = () => checks.execute("nova", project.id, run.id, "node total.test.cjs");
  const input = { title: "Fix quantity totals", body: "The same independent quantity assertions failed before the repair and now pass. Review total.cjs; the original checkout and oracle are unchanged.", base: "main", draft: true };
  const identity = { host: "github.com", accountLogin: "fixture-owner" };
  const prepare = async () => {
    const failed = await execute();
    assert.equal(failed.check.status, "failed");
    assert.match(failed.stderr, /AssertionError/);
    projects.replace("nova", project.id, "total.cjs", "sum + item.price", "sum + item.price * item.quantity", 1, run.id);
    projects.commit("nova", project.id, "Respect item quantities", ["total.cjs"], run.id);
    const passed = await execute();
    assert.equal(passed.check.status, "passed");
    assert.notEqual(passed.check.headCommit, failed.check.headCommit);
    const independent = projects.prepareIndependentReview("nova", project.id, run.id);
    const reviewer = db.createRun({ botId: "pixel", threadId: run.threadId, parentRunId: run.id, status: "completed", prompt: "Inspect the supplied patch against the independent quantity assertions." });
    db.recordCodeTaskReview({ sourceRunId: run.id, reviewerRunId: reviewer.id, projectId: project.id, reviewerBotId: "pixel", verdict: "approved", summary: "The focused multiplication repair preserves the supplied assertions and handles empty input.", findings: [], headCommit: independent.headCommit });
    return projects.preparePublishReview("nova", project.id, input, run.id);
  };
  const publish = (review: ReturnType<typeof projects.preparePublishReview>) => projects.publishPullRequest("nova", project.id, { ...input, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: identity }, run.id);
  return {
    root, source, db, project, projects, run, workspace, initialCommit, broken, oracle, input, identity, writes, reads, execute, prepare, publish, git,
    changeAccount: () => { accountLogin = "different-owner"; },
    changeRemoteBase: () => { remoteBase = "a".repeat(40); },
    losePushConfirmation: () => { failAfterPush = true; },
    close: () => { db.close(); rmSync(root, { recursive: true, force: true }); },
  };
}

test("a repaired isolated project produces exact reviewed publication evidence and a durable delivery receipt", async () => {
  const f = fixture();
  try {
    const review = await f.prepare();
    assert.deepEqual(review.files, ["total.cjs"]);
    assert.match(review.diff, /\+module\.exports.*item\.price \* item\.quantity/);
    assert.equal(review.review.headCommit, review.headCommit);
    assert.equal(review.checks[0]?.headCommit, review.headCommit);
    assert.equal(review.checks[0]?.exitCode, 0);
    assert.equal(f.writes.length, 0, "Preparing a publication cannot publish it");
    const action = { type: "code_publish_pr", botId: "nova", args: { ...f.input, projectId: f.project.id, workspaceRunId: f.run.id, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: f.identity } };
    const approval = f.db.createApproval({ runId: f.run.id, botId: "nova", kind: "external", reason: "Review the entire outgoing patch", actionLabel: "Publish checked quantity fix", action });
    f.db.prepareApprovedAction({ approvalId: approval.id, runId: f.run.id, botId: "nova", actionType: action.type, action });
    assert.equal(f.db.claimApprovedAction(approval.id), null, "A prepared action is not user approval");
    f.db.decideApproval(approval.id, "approved");
    assert.ok(f.db.claimApprovedAction(approval.id));
    assert.equal(f.db.claimApprovedAction(approval.id), null, "Repeated decisions cannot claim a second execution");
    f.db.updateRun(f.run.id, { status: "running" });
    const published = await deliverCodeChange(f.db, f.projects, "nova", action.args);
    assert.equal(published.url, "https://github.com/fixture/shop/pull/17");
    const notification = f.db.extensionRecord<{ messageId: string }>("code-delivery-notification", f.run.id)!;
    const immediate = f.db.getMessage(notification.messageId)!;
    assert.equal(immediate.senderType, "system");
    assert.equal(immediate.runId, null, "The owner-visible receipt must not be hidden with private child/model runs");
    assert.ok(immediate.body.includes(published.url));
    assert.ok(immediate.body.includes(review.headCommit.slice(0, 12)));
    assert.equal(immediate.attachments.filter(artifact => artifact.name === "code-delivery.md").length, 1);
    f.db.completeApprovedAction(approval.id, `Delivered ${published.url} at ${published.headCommit}`);
    assert.deepEqual(f.writes.map(write => write.kind), ["push", "pull"]);
    assert.equal(f.writes[0]!.body, `${review.headCommit}:refs/heads/${review.branch}`);
    assert.deepEqual(f.writes[1]!.body, { title: f.input.title, body: f.input.body, head: review.branch, base: review.base, draft: true });
    assert.ok(f.reads.includes("/repos/fixture/shop/pulls/17"), "A create response must be followed by independent read-back");
    assert.equal(f.db.getCodeTaskWorkspace(f.run.id)?.status, "published");
    assert.equal(readFileSync(path.join(f.source, "total.cjs"), "utf8"), f.broken);
    assert.equal(readFileSync(path.join(f.workspace, "total.test.cjs"), "utf8"), f.oracle);
    assert.equal(f.git(f.source, "status", "--porcelain"), "");
    assert.equal(f.git(f.source, "rev-parse", "HEAD"), f.initialCommit);
    const reopened = new OpenBotDatabase(f.root);
    try {
      const receipt = reopened.getApprovedAction(approval.id)!;
      assert.equal(receipt.status, "completed");
      assert.equal(receipt.attemptCount, 1);
      assert.match(receipt.resultSummary!, /https:\/\/github\.com\/fixture\/shop\/pull\/17/);
      const delivery = reopened.extensionRecord<CodeDeliveryReceipt>("code-delivery", f.run.id)!;
      assert.deepEqual(delivery, published, "The production delivery wrapper, not fixture prose, persists the host receipt");
      assert.equal(delivery.headCommit, review.headCommit);
      assert.equal(delivery.accountLogin, f.identity.accountLogin);
      assert.equal(reopened.claimApprovedAction(approval.id), null);
      assert.equal(reopened.listCodeChecks(f.run.id).some(check => check.status === "failed" && check.headCommit === f.initialCommit), true);
      assert.equal(reopened.listCodeChecks(f.run.id).some(check => check.status === "passed" && check.headCommit === review.headCommit), true);
      const message = reopened.addMessage({ threadId: f.run.threadId, senderType: "bot", senderId: "nova", runId: f.run.id, body: "Fixture prose is not the proof of delivery." });
      const artifacts = await new AttachmentService(reopened).captureWorkReports(message);
      assert.ok(artifacts.some(artifact => artifact.name === "code-checks.md"));
      assert.equal(artifacts.some(artifact => artifact.name === "code-delivery.md"), false, "The model's later response does not get a duplicate delivery receipt");
      const deliveredArtifact = reopened.getMessage(notification.messageId)!.attachments.find(artifact => artifact.name === "code-delivery.md")!;
      assert.ok(deliveredArtifact);
      const artifactText = readFileSync(reopened.attachmentFile(deliveredArtifact.id)!.storagePath, "utf8");
      assert.ok(artifactText.includes(published.url));
      assert.ok(artifactText.includes(review.headCommit));
      assert.ok(artifactText.includes(f.identity.accountLogin));
      assert.match(artifactText, /not a merge or deployment/);
      assert.match(artifactText, /node total\.test\.cjs/);
      assert.match(artifactText, /total\.cjs/);
      const sameNotification = reopened.recordCodeDeliveryResult(delivery);
      assert.equal(sameNotification.message.id, notification.messageId);
      assert.equal(reopened.listMessages(f.run.threadId).filter(item => item.senderType === "system" && item.eventType !== "action_completed" && item.body.includes(published.url)).length, 1);
      assert.equal(reopened.listMessages(f.run.threadId).filter(item => item.eventType === "action_completed" && item.runId === f.run.id).length, 1, "The action has one immediate host acknowledgment, separate from the detailed delivery artifact");
      assert.equal(reopened.listMessages(f.run.threadId).flatMap(item => item.attachments).filter(artifact => artifact.name === "code-delivery.md").length, 1);
      const falseClaimRun = reopened.createRun({ botId: "nova", threadId: f.run.threadId, status: "completed", prompt: "Fixture without a delivery" });
      const falseClaim = reopened.addMessage({ threadId: f.run.threadId, senderType: "bot", senderId: "nova", runId: falseClaimRun.id, body: `Published successfully at ${published.url}. All done!` });
      const inventedArtifacts = await new AttachmentService(reopened).captureWorkReports(falseClaim);
      assert.equal(reopened.extensionRecord("code-delivery", falseClaimRun.id), null);
      assert.equal(inventedArtifacts.some(artifact => artifact.name === "code-delivery.md"), false, "Model-only delivery claims cannot create a host receipt or artifact");
    } finally { reopened.close(); }
  } finally { f.close(); }
});

test("commit, origin and push URL drift invalidate frozen publication before any remote write", async () => {
  for (const change of ["commit", "origin", "pushurl"] as const) {
    const f = fixture();
    try {
      const review = await f.prepare();
      if (change === "commit") {
        f.projects.write("nova", f.project.id, "notes.md", "An unreviewed later change.\n", f.run.id);
        f.projects.commit("nova", f.project.id, "Later change", ["notes.md"], f.run.id);
      } else if (change === "origin") f.git(f.workspace, "remote", "set-url", "origin", "https://github.com/other/destination.git");
      else f.git(f.workspace, "config", "remote.origin.pushurl", "https://github.com/other/destination.git");
      await assert.rejects(f.publish(review), /changed|checks|review|destination/i);
      assert.equal(f.writes.length, 0, change);
    } finally { f.close(); }
  }
});

test("failed reruns, weakened independent oracles and revoked review permissions cannot deliver code", async () => {
  for (const change of ["failed-check", "oracle", "reviewer-access"] as const) {
    const f = fixture();
    try {
      const review = await f.prepare();
      if (change === "failed-check") {
        const failure = new CodeCheckService(f.db, f.projects, { executeCodeProject: async () => ({ code: 1, stdout: "", stderr: "Fixture regression" }) });
        assert.equal((await failure.execute("nova", f.project.id, f.run.id, "node total.test.cjs")).check.status, "failed");
      } else if (change === "oracle") {
        f.projects.write("nova", f.project.id, "total.test.cjs", "// Deleted assertions are not a repair.\n", f.run.id);
        f.projects.commit("nova", f.project.id, "Weakened assertions", ["total.test.cjs"], f.run.id);
        await assert.rejects(f.execute(), /oracle may not be weakened/);
      } else f.db.setCodeProjectAccess(f.project.id, "pixel", { canRead: false, canWrite: false, canRun: false });
      await assert.rejects(f.publish(review), /failed|checks|review|access|changed/i);
      assert.equal(f.writes.length, 0, change);
    } finally { f.close(); }
  }
});

test("changed GitHub account or remote base cannot receive a previously reviewed publication", async () => {
  for (const change of ["account", "remote-base"] as const) {
    const f = fixture();
    try {
      const review = await f.prepare();
      if (change === "account") f.changeAccount(); else f.changeRemoteBase();
      await assert.rejects(f.publish(review), /account|credential|branch|base|changed/i);
      assert.equal(f.writes.length, 0, change);
    } finally { f.close(); }
  }
});

test("a lost publication confirmation remains durably uncertain and cannot be automatically replayed", async () => {
  const f = fixture();
  try {
    const review = await f.prepare();
    const action = { type: "code_publish_pr", botId: "nova", args: { ...f.input, publicationReview: review, publicationIdentity: f.identity } };
    const approval = f.db.createApproval({ runId: f.run.id, botId: "nova", kind: "external", reason: "Review fixture delivery", actionLabel: "Publish checked fix", action });
    f.db.prepareApprovedAction({ approvalId: approval.id, runId: f.run.id, botId: "nova", actionType: action.type, action });
    f.db.decideApproval(approval.id, "approved");
    assert.ok(f.db.claimApprovedAction(approval.id));
    f.db.updateRun(f.run.id, { status: "running" });
    f.losePushConfirmation();
    await assert.rejects(f.publish(review), (error: unknown) => {
      assert.ok(error instanceof GitHubWriteUncertainError);
      f.db.markApprovedActionUncertain(approval.id, error.message);
      return true;
    });
    assert.deepEqual(f.writes.map(write => write.kind), ["push"]);
    assert.equal(f.db.getCodeTaskWorkspace(f.run.id)?.status, "active");
    const reopened = new OpenBotDatabase(f.root);
    try {
      assert.equal(reopened.getApprovedAction(approval.id)?.status, "uncertain");
      assert.equal(reopened.getApprovedAction(approval.id)?.resultSummary, null);
      assert.equal(reopened.claimApprovedAction(approval.id), null);
      assert.deepEqual(reopened.listPreparedApprovedActions(), []);
      assert.equal(reopened.getApprovedAction(approval.id)?.attemptCount, 1);
    } finally { reopened.close(); }
    assert.equal(f.writes.length, 1);
  } finally { f.close(); }
});

test("malformed or mismatched publication results cannot create host delivery evidence and remain uncertain", async () => {
  for (const resultKind of ["malformed-url", "wrong-repository-url", "wrong-commit", "missing-account", "missing-result"] as const) {
    const f = fixture();
    try {
      const review = await f.prepare();
      const input = { ...f.input, projectId: f.project.id, workspaceRunId: f.run.id, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: f.identity };
      const publisher: Pick<CodeProjectManager, "publishPullRequest"> = {
        publishPullRequest: async (...args) => {
          const result = await f.projects.publishPullRequest(...args);
          if (resultKind === "malformed-url") return { ...result, url: "not a URL" };
          if (resultKind === "wrong-repository-url") return { ...result, url: "https://github.com/other/project/pull/17" };
          if (resultKind === "wrong-commit") return { ...result, headCommit: "0".repeat(40) };
          if (resultKind === "missing-account") return { ...result, accountLogin: null as unknown as string };
          return null as unknown as typeof result;
        },
      };
      await assert.rejects(deliverCodeChange(f.db, publisher, "nova", input), GitHubWriteUncertainError, resultKind);
      assert.deepEqual(f.writes.map(write => write.kind), ["push", "pull"], "Publication may have happened even though receipt validation failed");
      assert.equal(f.db.extensionRecord("code-delivery", f.run.id), null);
      const reopened = new OpenBotDatabase(f.root);
      try { assert.equal(reopened.extensionRecord("code-delivery", f.run.id), null); }
      finally { reopened.close(); }
    } finally { f.close(); }
  }
});

test("receipt storage failure after verified publication is uncertain, never ordinary retryable failure", async () => {
  const f = fixture();
  try {
    const review = await f.prepare();
    const input = { ...f.input, projectId: f.project.id, workspaceRunId: f.run.id, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: f.identity };
    const persist = f.db.saveExtensionRecord.bind(f.db);
    f.db.saveExtensionRecord = (kind, id, value) => {
      if (kind === "code-delivery") throw new Error("Synthetic disk write failure");
      persist(kind, id, value);
    };
    await assert.rejects(deliverCodeChange(f.db, f.projects, "nova", input), GitHubWriteUncertainError);
    assert.deepEqual(f.writes.map(write => write.kind), ["push", "pull"]);
    assert.equal(f.db.getCodeTaskWorkspace(f.run.id)?.status, "published");
    assert.equal(f.db.extensionRecord("code-delivery", f.run.id), null);
    const reopened = new OpenBotDatabase(f.root);
    try { assert.equal(reopened.extensionRecord("code-delivery", f.run.id), null); }
    finally { reopened.close(); }
  } finally { f.close(); }
});

test("verified code delivery stays visible if model continuation fails or the task is cancelled", async () => {
  for (const outcome of ["failed", "cancelled"] as const) {
    const f = fixture();
    try {
      const review = await f.prepare();
      const receipt = await deliverCodeChange(f.db, f.projects, "nova", { ...f.input, projectId: f.project.id, workspaceRunId: f.run.id, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: f.identity });
      const notification = f.db.extensionRecord<{ messageId: string }>("code-delivery-notification", f.run.id)!;
      if (outcome === "cancelled") f.db.cancelRun(f.run.id);
      else {
        f.db.updateRun(f.run.id, { status: "failed", error: "Fixture provider disconnected before final response", finishedAt: new Date().toISOString() });
        f.db.finishRunTask(f.run.id, "failed", "Fixture provider disconnected before final response");
      }
      const reopened = new OpenBotDatabase(f.root);
      try {
        assert.equal(reopened.getRun(f.run.id)?.status, outcome);
        const visible = reopened.listMessages(f.run.threadId).find(message => message.id === notification.messageId)!;
        assert.ok(visible, "The result is visible without a successful final model message");
        assert.equal(visible.senderType, "system");
        assert.ok(visible.body.includes(receipt.url));
        assert.ok(visible.body.includes(receipt.headCommit.slice(0, 12)));
        assert.match(visible.body, /OpenBot did not merge or deploy it; repository automations may run/);
        assert.equal(visible.attachments.filter(artifact => artifact.name === "code-delivery.md").length, 1);
        assert.deepEqual(reopened.extensionRecord("code-delivery", f.run.id), receipt);
      } finally { reopened.close(); }
    } finally { f.close(); }
  }
});

test("host-message persistence failure rolls back the receipt atomically after publication", async () => {
  const f = fixture();
  try {
    const review = await f.prepare();
    const messagesBefore = f.db.listMessages(f.run.threadId).map(message => message.id);
    const addMessage = f.db.addMessage.bind(f.db);
    f.db.addMessage = (input) => {
      if (input.senderType === "system") throw new Error("Synthetic message persistence failure");
      return addMessage(input);
    };
    await assert.rejects(deliverCodeChange(f.db, f.projects, "nova", { ...f.input, projectId: f.project.id, workspaceRunId: f.run.id, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: f.identity }), GitHubWriteUncertainError);
    assert.deepEqual(f.writes.map(write => write.kind), ["push", "pull"]);
    assert.equal(f.db.extensionRecord("code-delivery", f.run.id), null);
    assert.equal(f.db.extensionRecord("code-delivery-notification", f.run.id), null);
    assert.deepEqual(f.db.listMessages(f.run.threadId).map(message => message.id), messagesBefore);
    const reopened = new OpenBotDatabase(f.root);
    try {
      assert.equal(reopened.extensionRecord("code-delivery", f.run.id), null);
      assert.deepEqual(reopened.listMessages(f.run.threadId).map(message => message.id), messagesBefore);
    } finally { reopened.close(); }
  } finally { f.close(); }
});

test("attachment failure preserves the confirmed visible result and never requests another publish", async () => {
  const f = fixture();
  try {
    const review = await f.prepare();
    const input = { ...f.input, projectId: f.project.id, workspaceRunId: f.run.id, expectedHeadCommit: review.headCommit, publicationReview: review, publicationIdentity: f.identity };
    const createAttachment = f.db.createAttachment.bind(f.db);
    f.db.createAttachment = (attachment) => {
      if (attachment.name === "code-delivery.md") throw new Error("Synthetic attachment storage failure");
      return createAttachment(attachment);
    };
    const receipt = await deliverCodeChange(f.db, f.projects, "nova", input);
    const notification = f.db.extensionRecord<{ messageId: string }>("code-delivery-notification", f.run.id)!;
    assert.deepEqual(f.db.extensionRecord("code-delivery", f.run.id), receipt);
    assert.ok(f.db.getMessage(notification.messageId)!.body.includes(receipt.url));
    assert.equal(f.db.getMessage(notification.messageId)!.attachments.length, 0);
    await assert.rejects(deliverCodeChange(f.db, f.projects, "nova", input), /already has a recorded delivery/);
    assert.deepEqual(f.writes.map(write => write.kind), ["push", "pull"]);
    f.db.createAttachment = createAttachment;
    const attachments = new AttachmentService(f.db);
    await Promise.all([attachments.captureCodeDelivery(receipt), new AttachmentService(f.db).captureCodeDelivery(receipt)]);
    assert.equal(f.db.getMessage(notification.messageId)!.attachments.filter(attachment => attachment.name === "code-delivery.md").length, 1);
    assert.equal(f.db.listMessages(f.run.threadId).filter(message => message.id === notification.messageId).length, 1);
  } finally { f.close(); }
});
