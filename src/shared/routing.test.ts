import assert from "node:assert/strict";
import test from "node:test";
import type { Bot } from "./types.js";
import { mentionedBotIds, resolveMessageTargets } from "./routing.js";

const bot = (id: string, name: string, role: string, instructions: string, status: Bot["status"] = "ready"): Bot => ({
  id, name, role, instructions, status, ownerId: "owner", providerInstanceId: "provider", emoji: "•", mascot: "orbit", color: "#6757d9",
  model: "test/model", computerEnabled: true, browserEnabled: true, macAccessEnabled: false, weeklyTokenBudget: 0, tokensUsedThisWeek: 0,
  createdAt: new Date(0).toISOString(), lastActiveAt: null, threadId: `bot-${id}`,
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
