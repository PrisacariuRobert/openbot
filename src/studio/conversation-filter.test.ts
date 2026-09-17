import test from "node:test";
import assert from "node:assert/strict";
import type { Bot, Thread } from "../shared/types.js";
import { conversationMatches } from "./conversation-filter.js";

const bot = (overrides: Partial<Bot> = {}): Bot => ({
  id: "nova",
  ownerId: "owner",
  providerInstanceId: null,
  name: "Nova",
  emoji: "✦",
  mascot: "nova",
  color: "#6757d9",
  role: "Researcher",
  instructions: "",
  model: "",
  status: "ready",
  currentAction: null,
  computerEnabled: true,
  browserEnabled: true,
  macAccessEnabled: false,
  weeklyTokenBudget: 0,
  tokensUsedThisWeek: 0,
  createdAt: "2026-09-17",
  lastActiveAt: null,
  threadId: "bot-nova",
  ...overrides,
} as Bot);

const thread = (overrides: Partial<Thread> = {}): Thread => ({
  id: "bot-nova",
  title: "Nova",
  kind: "direct",
  botId: "nova",
  botIds: ["nova"],
  section: null,
  pinned: false,
  hidden: false,
  createdAt: "2026-09-17",
  updatedAt: "2026-09-17",
  unreadCount: 0,
  lastMessage: "See you Monday",
  lastMessageAt: null,
  ...overrides,
});

test("chats match by title, snippet, teammate name and specialty", () => {
  const bots = [bot()];
  const chat = thread();
  assert.equal(conversationMatches(chat, bots, ""), true, "empty query matches");
  assert.equal(conversationMatches(chat, bots, "  "), true);
  assert.equal(conversationMatches(chat, bots, "nov"), true, "title");
  assert.equal(conversationMatches(chat, bots, "monday"), true, "snippet");
  assert.equal(conversationMatches(chat, bots, "NOVA"), true, "case-insensitive");
  assert.equal(conversationMatches(chat, bots, "Researcher"), true, "member specialty shown in the row subtitle");
  assert.equal(conversationMatches(chat, bots, "zzz-nope"), false);
});

test("direct teammates resolve without membership rows", () => {
  const solo = bot({ id: "pixel", name: "Pixel", role: "Maker", threadId: "bot-pixel" });
  const chat = thread({ id: "bot-pixel", title: "Pixel", botId: "pixel", botIds: [], lastMessage: null });
  assert.equal(conversationMatches(chat, [solo], "maker"), true, "direct teammate role");
  assert.equal(conversationMatches(chat, [solo], "pixel"), true);
  assert.equal(conversationMatches(chat, [], "maker"), false, "no bots, no member match");
});

test("room members all participate in matching", () => {
  const bots = [bot(), bot({ id: "pixel", name: "Pixel", role: "Maker", threadId: "bot-pixel" })];
  const room = thread({ id: "team-room", title: "The studio", kind: "room", botId: null, botIds: ["nova", "pixel"], lastMessage: "Hello" });
  assert.equal(conversationMatches(room, bots, "maker"), true);
  assert.equal(conversationMatches(room, bots, "researcher"), true);
  assert.equal(conversationMatches(room, bots, "studio"), true);
  assert.equal(conversationMatches(room, bots, "scout"), false);
});

test("matcher never filters on pinned or hidden state", () => {
  const bots = [bot()];
  assert.equal(conversationMatches(thread({ pinned: true }), bots, "nova"), true);
  assert.equal(conversationMatches(thread({ hidden: true }), bots, "nova"), true);
});
