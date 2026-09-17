import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, apiError, createSubmissionKeys, sendScopeFingerprint } from "./submission-keys.js";

function generator() {
  let next = 0;
  return () => `request-key-${++next}-00000000`;
}

const scope = {
  threadId: "team-room",
  body: "Hello team",
  targetBotIds: ["nova"],
  attachmentIds: [] as string[],
  replyToId: null,
};

test("retries reuse the key while anything new rotates it", () => {
  const keys = createSubmissionKeys(generator());
  const first = keys.keyFor(scope);
  assert.equal(keys.keyFor({ ...scope }), first, "identical retry keeps the key");
  assert.equal(keys.keyFor({ ...scope, targetBotIds: ["nova"] }), first);
  assert.notEqual(keys.keyFor({ ...scope, body: "Hello team!" }), first, "edited text is new work");
  const second = keys.keyFor({ ...scope, body: "Hello team!" });
  assert.equal(keys.keyFor({ ...scope, body: "Hello team!" }), second, "repeat of the new text stays stable");
  assert.notEqual(keys.keyFor({ ...scope, attachmentIds: ["file-1"] }), second, "added files are new work");
  assert.notEqual(keys.keyFor({ ...scope, threadId: "other" }), second, "another thread is new work");
  assert.notEqual(
    keys.keyFor({ ...scope, replyToId: "00000000-0000-4000-8000-000000000000" }),
    second,
    "a reply target is new work",
  );
});

test("target order is meaningless but attachment order is meaningful", () => {
  const keys = createSubmissionKeys(generator());
  const first = keys.keyFor({ ...scope, targetBotIds: ["a", "b"] });
  assert.equal(keys.keyFor({ ...scope, targetBotIds: ["b", "a"] }), first);
  const withFiles = keys.keyFor({ ...scope, attachmentIds: ["one", "two"] });
  assert.notEqual(withFiles, first);
  assert.notEqual(keys.keyFor({ ...scope, attachmentIds: ["two", "one"] }), withFiles);
  assert.equal(
    keys.keyFor({ ...scope, expectedWorkKind: "morning" }),
    keys.keyFor({ ...scope, expectedWorkKind: "morning" }),
  );
  assert.notEqual(
    keys.keyFor({ ...scope, expectedWorkKind: "morning" }),
    keys.keyFor({ ...scope, expectedWorkKind: "inbox" }),
  );
});

test("rotate makes even an identical retry new work", () => {
  const keys = createSubmissionKeys(generator());
  const first = keys.keyFor(scope);
  keys.rotate();
  const second = keys.keyFor(scope);
  assert.notEqual(second, first);
  assert.equal(keys.keyFor(scope), second);
});

test("keys are unique and satisfy the host minimum length", () => {
  const keys = createSubmissionKeys();
  const seen = new Set([keys.keyFor(scope)]);
  for (const body of ["one", "two", "three"]) {
    keys.rotate();
    seen.add(keys.keyFor({ ...scope, body }));
  }
  assert.equal(seen.size, 4);
  for (const key of seen) assert.ok(key.length >= 8, "host requestId minimum");
});

test("fingerprint is a stable string over the semantic scope", () => {
  assert.equal(sendScopeFingerprint(scope), sendScopeFingerprint({ ...scope }));
  assert.equal(typeof sendScopeFingerprint(scope), "string");
});

test("api errors keep status and server code with a safe fallback", () => {
  const conflict = apiError(409, { error: "Mismatch.", code: "request_conflict" }, "Fallback.");
  assert.ok(conflict instanceof ApiError);
  assert.ok(conflict instanceof Error);
  assert.equal(conflict.message, "Mismatch.");
  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, "request_conflict");
  const plain = apiError(500, { error: "Broken." }, "Fallback.");
  assert.equal(plain.code, undefined);
  assert.equal(apiError(500, null, "Fallback.").message, "Fallback.");
  assert.equal(apiError(500, "oops", "Fallback.").message, "Fallback.");
  assert.equal(apiError(500, {}, "Fallback.").message, "Fallback.");
});
