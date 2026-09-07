import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApprovedConnectorDispatch, ApprovedConnectorOutcomeUncertainError, ApprovalReviewChangedError, approvalReviewFingerprint, sameReviewFingerprint } from "./approval-review-binding.js";

test("opaque review binding changes with account, authorization, content, grant or process key", () => {
  const binding = { action: { type: "notion_update", args: { content: "Private note" } }, connector: { account: "first", version: 1, canSend: true } };
  const fingerprint = approvalReviewFingerprint("private-process-key", binding);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(fingerprint.includes("Private"), false);
  assert.equal(fingerprint, approvalReviewFingerprint("private-process-key", { connector: binding.connector, action: binding.action }));
  for (const updated of [
    { ...binding, connector: { ...binding.connector, account: "second" } },
    { ...binding, connector: { ...binding.connector, version: 2 } },
    { ...binding, connector: { ...binding.connector, canSend: false } },
    { ...binding, action: { ...binding.action, args: { content: "Different note" } } },
  ]) assert.equal(sameReviewFingerprint(fingerprint, approvalReviewFingerprint("private-process-key", updated)), false);
  assert.equal(sameReviewFingerprint(fingerprint, approvalReviewFingerprint("new-process-key", binding)), false);
  assert.equal(sameReviewFingerprint(undefined, fingerprint), false);
  assert.equal(sameReviewFingerprint(fingerprint, ""), false);
  assert.equal(sameReviewFingerprint(fingerprint, fingerprint), true);
});

test("approved outbound dispatch rechecks account after async setup before a request", async () => {
  let current = true, requests = 0;
  const dispatcher = new ApprovedConnectorDispatch(async () => { requests++; return new Response("{}"); });
  await assert.rejects(dispatcher.run(() => current, async () => {
    await Promise.resolve(); current = false;
    return dispatcher.fetch("https://fixture.invalid/write", { method: "POST" });
  }), (error: unknown) => error instanceof ApprovalReviewChangedError && !error.mutationAttempted);
  assert.equal(requests, 0);
});

test("account change after mutation starts becomes uncertain and is never retried", async () => {
  let current = true, requests = 0;
  const dispatcher = new ApprovedConnectorDispatch(async () => { requests++; await Promise.resolve(); current = false; return new Response("{}", { status: 401 }); });
  await assert.rejects(dispatcher.run(() => current, () => dispatcher.fetch("https://fixture.invalid/write", { method: "POST" })), (error: unknown) => error instanceof ApprovalReviewChangedError && error.mutationAttempted);
  assert.equal(requests, 1);
});

test("unchanged requests pass and unrelated reads do not inherit an approval guard", async () => {
  let requests = 0;
  const dispatcher = new ApprovedConnectorDispatch(async () => { requests++; return new Response("{}"); });
  await dispatcher.run(() => true, () => dispatcher.fetch("https://fixture.invalid/write", { method: "PATCH" }));
  await assert.rejects(dispatcher.run(() => false, () => dispatcher.fetch("https://fixture.invalid/write", { method: "POST" })), ApprovalReviewChangedError);
  await dispatcher.fetch("https://fixture.invalid/read");
  assert.equal(requests, 2);
});

test("rejected mutation transport is uncertain, sanitized and never retried", async () => {
  for (const switched of [false, true]) {
    let current = true, requests = 0;
    const dispatcher = new ApprovedConnectorDispatch(async () => { requests++; current = !switched; throw new Error("credential-do-not-expose"); });
    await assert.rejects(dispatcher.run(() => current, () => dispatcher.fetch("https://fixture.invalid/write", { method: "POST" })), (error: unknown) => error instanceof ApprovedConnectorOutcomeUncertainError && !error.message.includes("credential-do-not-expose"));
    assert.equal(requests, 1);
  }
});

test("revoking a GitHub grant during account verification prevents the subsequent POST", async () => {
  let canSend = true;
  const requests: string[] = [];
  const dispatcher = new ApprovedConnectorDispatch(async (input, init) => {
    const url = new URL(String(input)); requests.push(`${init?.method || "GET"} ${url.pathname}`);
    assert.equal(url.pathname, "/user");
    await Promise.resolve(); canSend = false;
    return Response.json({ login: "fixture-owner" });
  });
  await assert.rejects(dispatcher.run(() => canSend, async () => {
    await dispatcher.fetch("https://api.github.com/user");
    return dispatcher.fetch("https://api.github.com/repos/fixture/project/issues", { method: "POST", body: JSON.stringify({ title: "Approved issue" }) });
  }), (error: unknown) => error instanceof ApprovalReviewChangedError && !error.mutationAttempted);
  assert.deepEqual(requests, ["GET /user"]);
});

test("bookkeeping failure after confirmed POST is uncertain and does not repeat the mutation", async () => {
  let requests = 0;
  const dispatcher = new ApprovedConnectorDispatch(async () => { requests++; return Response.json({ id: 42 }, { status: 201 }); });
  await assert.rejects(dispatcher.run(() => true, async () => {
    const response = await dispatcher.fetch("https://fixture.invalid/issues", { method: "POST" });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).id, 42);
    throw new Error("Journal unavailable; private-db-path-and-secret");
  }), (error: unknown) => error instanceof ApprovedConnectorOutcomeUncertainError && !error.message.includes("private-db-path-and-secret"));
  assert.equal(requests, 1);
});

test("dispatch preserves typed uncertainty and safely upgrades review changes after a write", async () => {
  const dispatcher = new ApprovedConnectorDispatch(async () => Response.json({ ok: true }));
  for (const original of [new ApprovedConnectorOutcomeUncertainError(), new ApprovalReviewChangedError(true)]) {
    await assert.rejects(dispatcher.run(() => true, async () => {
      await dispatcher.fetch("https://fixture.invalid/write", { method: "PATCH" });
      throw original;
    }), (error: unknown) => error === original);
  }
  await assert.rejects(dispatcher.run(() => true, async () => {
    await dispatcher.fetch("https://fixture.invalid/write", { method: "PATCH" });
    throw new ApprovalReviewChangedError(false);
  }), (error: unknown) => error instanceof ApprovalReviewChangedError && error.mutationAttempted);
});

test("bookkeeping failure after read-only work keeps its original non-mutation classification", async () => {
  const original = new Error("Read result could not be cached");
  const dispatcher = new ApprovedConnectorDispatch(async () => Response.json({ login: "fixture-owner" }));
  await assert.rejects(dispatcher.run(() => true, async () => {
    await dispatcher.fetch("https://fixture.invalid/user");
    throw original;
  }), (error: unknown) => error === original);
});

test("server wires GitHub publication through guarded dispatch and keeps post-write bookkeeping guarded", () => {
  // Wiring contract only; executable transport/permission tests above exercise
  // the guard without a live account or starting the user's application server.
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /new GitHubConnector\(\{\s*fetch:\s*approvedConnectorDispatch\.fetch\s*\}\)/);
  const manager = source.slice(source.indexOf("const codeProjects ="), source.indexOf("const codeChecks ="));
  assert.match(manager, /withGitHubIdentity:\s*\(identity, operation\)\s*=>\s*withPinnedGitHubWriteIdentity\(identity, operation,\s*\{\s*fetch:\s*approvedConnectorDispatch\.fetch\s*\}\)/);
  const execute = source.slice(source.indexOf("async function executeApprovedAction"), source.indexOf("function currentApprovalReview"));
  const guarded = execute.slice(execute.indexOf("await approvedConnectorDispatch.run("), execute.indexOf("} catch (error)"));
  assert.match(guarded, /const result = await performApprovedAction\(action, approvalId\);\s*actionCompleted = true;\s*if \(!db\.completeApprovedAction\(approvalId, result\)\)/);
  assert.match(guarded, /db\.setRunPrompt\(/);
  assert.match(guarded, /db\.addActivity\(/);
  assert.match(execute, /if \(actionCompleted \|\|[\s\S]*?db\.markApprovedActionUncertain/);
  const cancellation = execute.indexOf('status === "cancelled"');
  assert(cancellation >= 0 && cancellation < execute.lastIndexOf('status: "queued"'), "A cancelled task must not be queued after its action finishes");
});
