import test from "node:test";
import assert from "node:assert/strict";
import type { Thread } from "./types";
import { defaultConversation } from "./default-conversation";

const room = { id: "team-room", kind: "room", hidden: false } as Thread;
const direct = { id: "bot-pixel", kind: "direct", hidden: false } as Thread;
test("direct chats are the default without taking over explicit room links", () => {
  assert.equal(defaultConversation([room, direct]), direct.id);
  assert.equal(defaultConversation([room, direct], room.id), room.id);
  assert.equal(defaultConversation([room, direct], "missing"), direct.id);
  assert.equal(defaultConversation([room, { ...direct, hidden: true }]), room.id);
  assert.equal(defaultConversation([room]), room.id);
});
