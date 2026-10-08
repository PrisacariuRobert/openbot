import test from "node:test";
import assert from "node:assert/strict";
import type { Bot, Thread } from "../shared/types.js";
import { conversationMatches, recentTeammates } from "./conversation-filter.js";

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

test("the faces row shows the teammates you talked to most recently", () => {
  const bot = (name: string, retiredAt: string | null = null) => ({ id: name, name, threadId: `bot-${name}`, retiredAt } as Bot);
  const thread = (name: string, updatedAt: string) => ({ id: `bot-${name}`, updatedAt } as Thread);
  const bots = [bot("Nova"), bot("Pixel"), bot("Scout"), bot("Juno"), bot("Milo"), bot("Old", "2026-10-01T00:00:00Z")];
  const threads = [thread("Nova", "2026-10-01T09:00:00Z"), thread("Pixel", "2026-10-02T09:00:00Z"), thread("Scout", "2026-10-03T09:00:00Z"), thread("Juno", "2026-10-08T09:00:00Z"), thread("Milo", "2026-10-07T09:00:00Z"), thread("Old", "2026-10-09T09:00:00Z")];
  assert.deepEqual(recentTeammates(bots, threads).map((item) => item.name), ["Juno", "Milo", "Scout"]);
});
