import assert from "node:assert/strict";
import test from "node:test";
import type { Bot } from "./types.js";
import { mentionedBotIds, resolveMessageTargets } from "./routing.js";

const bot = (id: string, name: string, role: string, instructions: string, status: Bot["status"] = "ready"): Bot => ({
  id, name, role, instructions, status, ownerId: "owner", providerInstanceId: "provider", emoji: "•", mascot: "orbit", color: "#6757d9",
  model: "test/model", currentAction: null, computerEnabled: true, browserEnabled: true, macAccessEnabled: false, weeklyTokenBudget: 0, tokensUsedThisWeek: 0,
  createdAt: new Date(0).toISOString(), lastActiveAt: null, threadId: `bot-${id}`, retiredAt: null,
});

const bots = [
  bot("nova", "Nova", "Researcher", "Research carefully and cite sources."),
  bot("pixel", "Pixel", "Maker", "Build, design and implement polished things."),
  bot("scout", "Scout", "Operator", "Organize schedules, routines and reliable workflows."),
];

test("mentions route to one, several, or every teammate", () => {
  assert.deepEqual(mentionedBotIds("@Nova research this and @pixel build it", bots), ["nova", "pixel"]);
  assert.deepEqual(mentionedBotIds("Morning @everyone", bots), ["nova", "pixel", "scout"]);
});

test("explicit mentions override chips and natural room text picks a relevant owner", () => {
  assert.deepEqual(resolveMessageTargets({ body: "@scout handle this", bots, requestedIds: ["nova"] }).map((item) => item.id), ["scout"]);
  assert.equal(resolveMessageTargets({ body: "Research and compare the latest sources", bots }).at(0)?.id, "nova");
  assert.equal(resolveMessageTargets({ body: "Build a polished settings screen", bots }).at(0)?.id, "pixel");
});

test("owners can address group teammates naturally: 'Nova: …', 'Pixel, …'", async () => {
  const { addressedBotIds, resolveMessageTargets } = await import("./routing.js");
  const bots = [{ id: "nova", name: "Nova" }, { id: "pixel", name: "Pixel" }, { id: "scout", name: "Scout" }];
  assert.deepEqual(addressedBotIds("Plan a weekend. Nova: find 3 things to do. Pixel: make a budget table.", bots), ["nova", "pixel"]);
  assert.deepEqual(addressedBotIds("Hey Scout, can you check this?", bots), ["scout"]);
  assert.deepEqual(addressedBotIds("Nova and Pixel, compare these.", bots), ["nova", "pixel"]);
  assert.deepEqual(addressedBotIds("Ask the team what Nova thinks about pixel art", bots), [], "mentioning a name is not addressing");
  assert.deepEqual(addressedBotIds("I like the novel, it was great", bots), [], "whole names only");
  const full = bots.map((bot) => ({ ...bot, role: "", instructions: "", status: "idle" })) as never[];
  assert.deepEqual(resolveMessageTargets({ body: "Nova: find prices. Pixel: budget it.", bots: full }).map((bot: { id: string }) => bot.id), ["nova", "pixel"]);
});
