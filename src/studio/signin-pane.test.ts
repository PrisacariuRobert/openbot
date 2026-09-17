import test from "node:test";
import assert from "node:assert/strict";
import type { Approval } from "../shared/types.js";
import { selectPendingSignIn } from "./signin-pane.js";

type ApprovalRef = Pick<Approval, "id" | "kind" | "requiresSignIn" | "status" | "runId">;
const run = (overrides: Partial<{ id: string; threadId: string }> = {}) => ({ id: "run-1", threadId: "bot-nova", ...overrides });
const approval = (overrides: Partial<ApprovalRef> = {}): ApprovalRef => ({
  id: "approval-1",
  kind: "browser",
  requiresSignIn: true,
  status: "pending",
  runId: "run-1",
  ...overrides,
});

test("selects the waiting sign-in handoff of this conversation", () => {
  assert.equal(selectPendingSignIn([approval()], [run()], "bot-nova"), "approval-1");
  assert.equal(selectPendingSignIn([], [run()], "bot-nova"), null, "nothing waiting");
  assert.equal(
    selectPendingSignIn([approval({ status: "approved" })], [run()], "bot-nova"),
    null,
    "decided handoffs never reopen",
  );
  assert.equal(
    selectPendingSignIn([approval({ kind: "external" })], [run()], "bot-nova"),
    null,
    "only browser sign-in handoffs",
  );
  assert.equal(
    selectPendingSignIn([approval({ requiresSignIn: false })], [run()], "bot-nova"),
    null,
    "browser approvals without sign-in stay inline",
  );
  assert.equal(
    selectPendingSignIn([approval()], [run({ id: "other", threadId: "bot-pixel" })], "bot-nova"),
    null,
    "another conversation's handoff never hijacks this chat",
  );
  assert.equal(
    selectPendingSignIn(
      [approval({ id: "old" }), approval({ id: "new" })],
      [run(), { id: "run-2", threadId: "bot-nova" }],
      "bot-nova",
    ),
    "old",
    "first waiting handoff wins deterministically",
  );
});
