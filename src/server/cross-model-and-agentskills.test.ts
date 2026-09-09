import test from "node:test";
import assert from "node:assert/strict";
import { crossModelReviewDecision, type CrossModelCandidate } from "./code-projects.js";
import { parseAgentsSkillMarkdown, toAgentsSkillMarkdown } from "./skill-library.js";

function candidate(id: string, name: string, providerInstanceId: string | null, model: string, retiredAt: string | null = null): CrossModelCandidate {
  return { id, name, providerInstanceId, model, retiredAt };
}

test("same-model review is refused when another model class exists", () => {
  const author = { providerInstanceId: "p1", model: "model-a" };
  const decision = crossModelReviewDecision({
    author,
    target: candidate("pixel", "Pixel", "p1", "model-a"),
    candidates: [
      candidate("pixel", "Pixel", "p1", "model-a"),
      candidate("nova", "Nova", "p1", "model-b"),
      candidate("scout", "Scout", "p2", "model-a"),
    ],
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.error!, /different model/);
  assert.deepEqual(decision.eligibleNames.sort(), ["Nova", "Scout"]);
});

test("same-model review degrades gracefully on a single-model studio", () => {
  const author = { providerInstanceId: "p1", model: "model-a" };
  const decision = crossModelReviewDecision({
    author,
    target: candidate("pixel", "Pixel", "p1", "model-a"),
    candidates: [
      candidate("pixel", "Pixel", "p1", "model-a"),
      candidate("old", "Old", "p2", "model-z", new Date().toISOString()),
    ],
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.error, null);
});

test("retired teammates are never proposed as the different-model reviewer", () => {
  const author = { providerInstanceId: "p1", model: "model-a" };
  const onlyRetiredDifferentModel = crossModelReviewDecision({
    author,
    target: candidate("pixel", "Pixel", "p1", "model-a"),
    candidates: [candidate("nova", "Nova", "p2", "model-b", new Date().toISOString())],
  });
  assert.equal(onlyRetiredDifferentModel.allowed, true);
  const activeDifferentModel = crossModelReviewDecision({
    author,
    target: candidate("pixel", "Pixel", "p1", "model-a"),
    candidates: [candidate("nova", "Nova", "p2", "model-b")],
  });
  assert.equal(activeDifferentModel.allowed, false);
  assert.deepEqual(activeDifferentModel.eligibleNames, ["Nova"]);
});

test("a genuinely different model reviews freely", () => {
  const author = { providerInstanceId: "p1", model: "model-a" };
  const decision = crossModelReviewDecision({
    author,
    target: candidate("nova", "Nova", "p2", "model-b"),
    candidates: [candidate("nova", "Nova", "p2", "model-b")],
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.error, null);
});

test("agentskills.io SKILL.md round-trips through the open standard", () => {
  const markdown = `---\nname: expense-filing\ndescription: "File an expense end to end."\n---\n\n# Expense filing\n\nOpen https://portal.example.com, attach the receipt, submit.\n`;
  const parsed = parseAgentsSkillMarkdown(markdown);
  assert.equal(parsed.name, "expense-filing");
  assert.equal(parsed.description, "File an expense end to end.");
  assert.equal(parsed.startUrl, "https://portal.example.com");
  assert.match(parsed.instructions, /attach the receipt/);
  // Exporting produces the same open shape again.
  const exported = toAgentsSkillMarkdown({ name: "Expense filing", slug: "expense-filing", description: parsed.description, instructions: parsed.instructions, steps: [{ type: "navigate", url: "https://portal.example.com" }] });
  const reparsed = parseAgentsSkillMarkdown(exported);
  assert.equal(reparsed.name, "expense-filing");
  assert.match(reparsed.instructions, /Recorded steps/);
});

test("broken agentskills.io input fails with a usable message", () => {
  assert.throws(() => parseAgentsSkillMarkdown("# No frontmatter\n"), /frontmatter/);
  assert.throws(() => parseAgentsSkillMarkdown("---\nname: x\n"), /not closed/);
  assert.throws(() => parseAgentsSkillMarkdown("---\ndescription: y\n---\n\nBody"), /needs at least/);
  assert.throws(() => parseAgentsSkillMarkdown("---\nname: x\ndescription: y\n---\n"), /needs instructions/);
});
