import assert from "node:assert/strict";
import test from "node:test";
import type { Run } from "../shared/types";
import { conversationProgress } from "./conversation-progress";

test("working, queued and waiting states have distinct honest language", () => {
  const run = (status: Run["status"]) => ({ botName: "Scout", status } as Run);
  assert.deepEqual(conversationProgress(run("queued")), { label: "Scout is up next", detail: "Your request is saved.", animated: false });
  assert.equal(conversationProgress(run("running"))?.label, "Scout is working on it");
  assert.equal(conversationProgress({ ...run("running"), activities: [{ label: "Opening the website", createdAt: "2026-09-12T10:00:00Z" }, { label: "Reading the page", createdAt: "2026-09-12T09:00:00Z" }] as Run["activities"] })?.detail, "Opening the website");
  assert.equal(conversationProgress({ ...run("running"), activities: [{ label: "Leaked page text" }] as Run["activities"] })?.detail, "You can keep chatting while this runs.");
  assert.equal(conversationProgress({ ...run("running"), activities: [{ label: "Reading the page", createdAt: "2026-09-12T09:00:00Z" }, { label: "Model payload", createdAt: "2026-09-12T10:00:00Z" }] as Run["activities"] })?.detail, "You can keep chatting while this runs.");
  assert.equal(conversationProgress({ ...run("running"), task: {stage:"checking"} as Run["task"] })?.label, "Scout is checking the result");
  assert.equal(conversationProgress(run("waiting_for_teammate"))?.label, "Scout is checking with the team");
  assert.equal(conversationProgress(run("awaiting_approval"))?.animated, false);
  for (const state of ["completed", "failed", "cancelled"] as const) assert.equal(conversationProgress(run(state)), null);
});
