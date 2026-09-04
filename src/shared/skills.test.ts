import assert from "node:assert/strict";
import test from "node:test";
import type { TaughtWorkflow } from "./types.js";
import { invokedSkillSlug, invokedWorkflow, skillSlug } from "./skills.js";

const workflow: TaughtWorkflow = {
  id: "workflow-1", botId: "nova", botName: "Nova", name: "Morning brief", skillSlug: "morning-brief",
  description: "Prepare the morning brief.", instructions: "Collect current information and verify it.", startUrl: "https://example.com",
  stepCount: 3, version: 1, source: "taught", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

test("skill names become stable composer commands", () => {
  assert.equal(skillSlug("  Café Morning Brief! "), "cafe-morning-brief");
  assert.equal(invokedSkillSlug("/morning-brief for today"), "morning-brief");
  assert.equal(invokedSkillSlug("Please use /morning-brief now"), "morning-brief");
  assert.equal(invokedSkillSlug("https://example.com/morning-brief"), null);
});

test("an invoked command resolves its learned workflow", () => {
  assert.equal(invokedWorkflow("/morning-brief", [workflow])?.botId, "nova");
  assert.equal(invokedWorkflow("/unknown", [workflow]), null);
});
