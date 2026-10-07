import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_RUN_SUGGESTIONS, firstRunAIOptions, firstRunModel, firstRunSuggestions, macStepRows } from "./first-run.js";

test("the AI step follows the plan's order, with Apple Intelligence hidden until it ships", () => {
  assert.deepEqual(firstRunAIOptions(), ["chatgpt", "gemini", "claude", "ollama", "other"]);
  assert.deepEqual(firstRunAIOptions(true), ["apple-intelligence", "chatgpt", "gemini", "claude", "ollama", "other"]);
});

test("the first suggestion needs nothing; web and Calendar suggestions appear only when they can work", () => {
  for (const browserEnabled of [true, false]) for (const mac of [true, false]) {
    const cards = firstRunSuggestions({ browserEnabled }, { mac });
    const label = `web ${browserEnabled ? "on" : "off"}, ${mac ? "Mac" : "not a Mac"}`;
    assert.ok(cards.length >= 2 && cards.length <= 3, label);
    assert.deepEqual(cards[0]!.needs, [], `${label}: the first card needs nothing`);
    assert.equal(new Set(cards.map((card) => card.key)).size, cards.length, `${label}: no repeats`);
    if (!browserEnabled) assert.ok(cards.every((card) => !card.needs.includes("web")), `${label}: no web without the web switch`);
    if (!mac) assert.ok(cards.every((card) => macStepRows(card.needs).length === 0), `${label}: nothing to set up off a Mac`);
  }
  assert.deepEqual(firstRunSuggestions({ browserEnabled: true }, { mac: true }).map((card) => card.hint), ["Needs nothing else", "Searches the web", "Uses Calendar and Reminders"]);
});

test("setting up the Mac asks only for what a suggestion needs, and never for Accessibility", () => {
  const plate = FIRST_RUN_SUGGESTIONS.find((card) => card.key === "plate")!;
  assert.deepEqual(macStepRows(plate.needs).map((row) => row.need), ["mac-apps", "automation:Calendar", "automation:Reminders"], "the day's plan needs no Full Disk Access");
  assert.deepEqual(macStepRows(["full-disk-access"]).map((row) => row.title), ["Full Disk Access"]);
  assert.deepEqual(macStepRows(["web"]), []);
  assert.ok(macStepRows(["mac-apps", "automation:Calendar", "automation:Reminders", "full-disk-access"]).every((row) => row.why.length > 20 && !/accessibility/i.test(row.title)));
});

test("no suggestion claims to work on an AI before the reliability scoreboard says so", () => {
  assert.ok(FIRST_RUN_SUGGESTIONS.every((card) => card.evidence === null));
});

test("the preselected model is never a blocked free model, nor a training model for a teammate that reads personal data", () => {
  const models = ["opencode/ling-3.1-flash-free", "opencode-go/muse-spark-1.3-contributor", "opencode-go/deepseek-v4.1-flash"];
  assert.equal(firstRunModel({ models }, { readsPersonalData: true }), "opencode-go/deepseek-v4.1-flash");
  assert.equal(firstRunModel({ models: ["opencode-go/muse-spark-1.3-contributor"] }, { readsPersonalData: false }), "opencode-go/muse-spark-1.3-contributor");
  assert.equal(firstRunModel({ models: ["opencode-go/muse-spark-1.3-contributor"] }, { readsPersonalData: true }), "", "the owner chooses instead");
  assert.equal(firstRunModel({ models: ["claude-code/sonnet", "claude-code/haiku"], defaultModel: "claude-code/sonnet" }, { readsPersonalData: true }), "claude-code/sonnet");
  assert.equal(firstRunModel({ models: ["opencode/ling-3.1-flash-free"], defaultModel: "opencode/ling-3.1-flash-free" }, { readsPersonalData: false }), "", "a blocked default is never preselected");
  assert.equal(firstRunModel({}, { readsPersonalData: false }), "");
});
