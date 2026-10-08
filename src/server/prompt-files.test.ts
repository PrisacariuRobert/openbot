import assert from "node:assert/strict";
import test from "node:test";
import { fragment, parsePromptFile, promptFile, promptVersion, rules } from "./prompt-files.js";
import { measureModelRequest } from "./prompt-measure.js";

const sample = `<!-- sidemates prompt: sample · version 3 · 8 October 2026 -->
<!-- A comment that is never sent. -->

<!-- @greeting -->
Hello {{name}}.
<!-- an inline note --> Still here.

<!-- @rule always -->
- Always.

<!-- @rule web_search|browser_open -->
- Web.

<!-- @rule !self_extend -->
- No self-extending.
`;

test("prompt files: a header with a version, fragments without comments", () => {
  const file = parsePromptFile("sample", sample);
  assert.equal(file.version, 3);
  assert.deepEqual(file.fragments.map((item) => item.key), ["greeting", "rule always", "rule web_search|browser_open", "rule !self_extend"]);
  assert.equal(file.fragments[0]!.text, "Hello {{name}}.\n Still here.");
  assert.throws(() => parsePromptFile("sample", sample.replace("sidemates prompt", "prompt")), /no valid header/);
  assert.throws(() => parsePromptFile("other", sample), /no valid header/, "the header names its own file");
});

test("the shipped prompt files load, and a missing fragment or value is an error, not an empty string", () => {
  for (const name of ["teammate", "request", "tools"]) assert.match(promptVersion(name), new RegExp(`^${name} v\\d+$`));
  assert.throws(() => fragment("teammate", "no-such-fragment"), /has no fragment/);
  assert.throws(() => fragment("teammate", "header", { name: "Nova" }), /needs role/);
  assert.match(fragment("request", "new", { prompt: "hi" }), /^New request from the owner: hi\n/);
  for (const key of promptFile("tools").fragments.map((item) => item.key)) assert.ok(fragment("tools", key, { roster: "" }).length < 700, `${key} stays short`);
});

test("rules: always, either of two tools, and a tool the teammate can't use", () => {
  const can = (available: string[]) => (tool: string) => available.includes(tool);
  const teammate = (available: string[]) => rules("teammate", can(available)).join("\n");
  assert.match(teammate([]), /Self-extending is turned off/);
  assert.doesNotMatch(teammate(["self_extend"]), /Self-extending is turned off/);
  assert.match(teammate(["self_extend"]), /propose one with self_extend/);
  assert.match(teammate(["gmail_reply"]), /Never say an email was sent/, "either tool is enough");
  assert.doesNotMatch(teammate([]), /Never say an email was sent/);
});

test("a model request is measured from its system text, other messages and tool definitions", () => {
  const tool = (name: string) => ({ type: "function", function: { name, description: "x".repeat(10), parameters: { type: "object" } } });
  const measure = measureModelRequest({
    messages: [{ role: "system", content: "S".repeat(100) }, { role: "user", content: [{ type: "text", text: "U".repeat(50) }] }],
    tools: [tool("b_tool"), tool("a_tool")],
  });
  assert.equal(measure.systemChars, 100);
  assert.equal(measure.userChars, 50);
  assert.equal(measure.toolCount, 2);
  assert.equal(measure.toolChars, JSON.stringify([tool("b_tool"), tool("a_tool")]).length);
  assert.equal(measure.totalChars, 150 + measure.toolChars);
  assert.deepEqual(measure.tools, ["a_tool", "b_tool"]);
  assert.equal(measure.estimatedTokens, Math.round(measure.totalChars / 4.37));
  assert.deepEqual(measureModelRequest({}), { systemChars: 0, userChars: 0, toolCount: 0, toolChars: 0, totalChars: 0, estimatedTokens: 0, tools: [], toolSizes: [] });
});
