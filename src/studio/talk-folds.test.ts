import test from "node:test";
import assert from "node:assert/strict";
import { foldTalkingPills } from "./talk-folds.js";
import type { Message } from "../shared/types.js";

let n = 0;
function event(overrides: Partial<Message>): Message {
  n += 1;
  const base: Record<string, unknown> = {
    id: `m${n}`,
    threadId: "t",
    senderType: "system",
    senderId: null,
    senderName: "Studio",
    senderColor: null,
    senderMascot: null,
    kind: "event",
    body: "",
    eventType: null,
    eventData: null,
    runId: null,
    attachments: [],
    reactions: [],
    createdAt: "2026-09-12T00:00:00Z",
  };
  return { ...base, ...overrides } as Message;
}

const talk = (from: string, to: string, type = "teammate_message") =>
  event({ eventType: type, eventData: { fromName: from, toName: to } });

test("consecutive same-pair talking pills fold, either direction", () => {
  const a = talk("Scout", "Pixel");
  const b = talk("Scout", "Pixel");
  const c = talk("Pixel", "Scout");
  const { firstOf, folds } = foldTalkingPills([a, b, c]);
  assert.equal(folds.size, 1);
  assert.equal(folds.get(a.id)?.items.length, 3);
  assert.equal(firstOf.get(c.id)?.id, a.id);
});

test("a single talking pill never folds", () => {
  const a = talk("Scout", "Pixel");
  const { folds, firstOf } = foldTalkingPills([a]);
  assert.equal(folds.size, 0);
  assert.equal(firstOf.size, 0);
});

test("other messages break the run", () => {
  const a = talk("Scout", "Pixel");
  const gap = event({ eventType: "routine_run", kind: "event", body: "x" });
  const b = talk("Scout", "Pixel");
  const { folds } = foldTalkingPills([a, gap, b]);
  assert.equal(folds.size, 0);
});

test("different pairs and types stay separate", () => {
  const a = talk("Scout", "Pixel");
  const b = talk("Scout", "Nova");
  const c = talk("Scout", "Pixel", "handoff");
  const { folds } = foldTalkingPills([a, b, c]);
  assert.equal(folds.size, 0);
});
