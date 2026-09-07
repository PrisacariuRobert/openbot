import assert from "node:assert/strict";
import test from "node:test";
import type { StudioDraft } from "../shared/types";
import { ConversationDrafts } from "./conversation-drafts";

const remote = (threadId: string, body: string, n = 1): StudioDraft => ({
  threadId, body, source: "web", updatedAt: `2026-09-06T09:00:${String(n).padStart(2, "0")}.000Z`,
});
function fixture() {
  let version = 1;
  const calls: { threadId: string; body: string; resolve: (draft: StudioDraft) => void; reject: (error: Error) => void }[] = [];
  const store = new ConversationDrafts((threadId, body) => new Promise<StudioDraft>((resolve, reject) => {
    calls.push({ threadId, body, resolve, reject });
  }), 60_000);
  const finish = (index: number) => {
    const call = calls[index]!;
    call.resolve(remote(call.threadId, call.body, ++version));
  };
  return { store, calls, finish };
}

test("drafts do not write blanks or text before the matching initial snapshot", async () => {
  const { store, calls, finish } = fixture();
  store.view("a");
  await store.flush("a");
  store.edit("a", "Typed before loading");
  await store.flush("a");
  assert.equal(calls.length, 0);
  store.receive(remote("b", "Other conversation"));
  assert.equal(store.view("a").ready, false);
  store.receive(remote("a", ""));
  const save = store.flush("a");
  assert.equal(calls[0]?.body, "Typed before loading");
  finish(0); await save;
});

test("different conversation drafts remain separate while saves are pending", async () => {
  const { store, calls, finish } = fixture();
  store.receive(remote("a", "First")); store.receive(remote("b", "Second"));
  store.edit("a", "First edited"); store.edit("b", "Second edited");
  assert.equal(store.view("a").body, "First edited");
  const a = store.flush("a"), b = store.flush("b");
  assert.deepEqual(calls.map(({ threadId, body }) => ({ threadId, body })), [
    { threadId: "a", body: "First edited" }, { threadId: "b", body: "Second edited" },
  ]);
  finish(0); finish(1); await Promise.all([a, b]);
});

test("older save completion cannot clear or replace newer typing, writes serialize", async () => {
  const { store, calls, finish } = fixture();
  store.receive(remote("a", "")); store.edit("a", "One");
  const first = store.flush("a");
  store.edit("a", "Two"); await store.flush("a");
  assert.equal(calls.length, 1);
  finish(0); await first;
  assert.equal(store.view("a").body, "Two"); assert.equal(store.view("a").dirty, true);
  const second = store.flush("a");
  assert.equal(calls[1]?.body, "Two"); finish(1); await second;
  assert.equal(store.view("a").dirty, false);
});

test("successful send clears only the captured revision on its original thread", async () => {
  const { store, finish } = fixture();
  store.receive(remote("a", "Send me")); store.receive(remote("b", "Leave me"));
  const captured = store.capture("a");
  store.edit("a", "New typing");
  assert.equal(store.clearSent(captured), false);
  assert.equal(store.view("a").body, "New typing");
  const latest = store.capture("a");
  assert.equal(store.clearSent(latest), true);
  assert.equal(store.view("b").body, "Leave me");
  const save = store.flush("a"); finish(0); await save;
});

test("a stale polled snapshot cannot replace acknowledged text", async () => {
  const { store, finish } = fixture();
  store.receive(remote("a", "Old")); store.edit("a", "Saved");
  const saving = store.flush("a"); finish(0); await saving;
  store.receive(remote("a", "Old"));
  assert.equal(store.view("a").body, "Saved");
});

test("incoming phone edit is held beside unsaved local text until chosen", async () => {
  const { store, calls } = fixture();
  store.receive(remote("a", "Original")); store.edit("a", "My local edit");
  store.receive({ ...remote("a", "Phone edit", 3), source: "ios" });
  assert.equal(store.view("a").body, "My local edit");
  assert.equal(store.view("a").conflict?.body, "Phone edit");
  await store.flush("a"); assert.equal(calls.length, 0);
  store.resolve("a", "remote");
  assert.equal(store.view("a").body, "Phone edit");
  assert.equal(store.view("a").dirty, false);
});

test("choosing a remote draft while a write is in flight re-saves that choice afterward", async () => {
  const { store, calls, finish } = fixture();
  store.receive(remote("a", "Original")); store.edit("a", "Local");
  const first = store.flush("a");
  store.receive({ ...remote("a", "Phone", 3), source: "ios" });
  store.resolve("a", "remote");
  finish(0); await first;
  assert.equal(store.view("a").body, "Phone");
  const second = store.flush("a");
  assert.equal(calls[1]?.body, "Phone"); finish(1); await second;
});

test("failed save retains the draft and retries only on an explicit action", async () => {
  const { store, calls, finish } = fixture();
  store.receive(remote("a", "")); store.edit("a", "Keep this");
  const saving = store.flush("a"); calls[0]!.reject(new Error("Offline")); await saving;
  assert.equal(store.view("a").body, "Keep this");
  assert.equal(store.view("a").error, "Offline"); assert.equal(store.hasUnsaved(), true);
  const retry = store.flush("a"); finish(1); await retry;
  assert.equal(store.view("a").error, ""); assert.equal(store.hasUnsaved(), false);
});

test("typing before a nonempty remote draft arrives never discards either copy", () => {
  const { store } = fixture();
  store.edit("a", "Typed locally"); store.receive(remote("a", "Saved elsewhere"));
  assert.equal(store.view("a").body, "Typed locally");
  assert.equal(store.view("a").conflict?.body, "Saved elsewhere");
  store.resolve("a", "remote");
});

test("debouncing saves only the latest text after the typing pause", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: string[] = [];
  const store = new ConversationDrafts(async (threadId, body) => {
    calls.push(body);
    return remote(threadId, body, 2);
  }, 650);
  store.receive(remote("a", ""));
  store.edit("a", "H"); context.mock.timers.tick(500);
  store.edit("a", "Hello"); context.mock.timers.tick(649);
  assert.equal(calls.length, 0);
  context.mock.timers.tick(1);
  await Promise.resolve();
  assert.deepEqual(calls, ["Hello"]);
  assert.equal(store.view("a").dirty, false);
});
