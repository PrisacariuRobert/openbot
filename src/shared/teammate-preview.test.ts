import assert from "node:assert/strict";
import test from "node:test";
import { readTeammate } from "./teammate-preview.js";

const good = { kind: "openbot-teammate", version: 1, about: "Files receipts.", bot: { name: "Receipt keeper", emoji: "🧾", mascot: "sprout", color: "#299575", role: "Files receipts", instructions: "Find receipts." }, skills: ["a", "b"], routines: [{ name: "Monthly", prompt: "Collect last month's receipts." }] };

test("a shared teammate is read into a preview", () => {
  const preview = readTeammate(good);
  assert.deepEqual({ name: preview.name, role: preview.role, about: preview.about, mascot: preview.mascot, color: preview.color, skills: preview.skills }, { name: "Receipt keeper", role: "Files receipts", about: "Files receipts.", mascot: "sprout", color: "#299575", skills: 2 });
  assert.deepEqual(preview.routines, [{ name: "Monthly", prompt: "Collect last month's receipts." }]);
  assert.equal(preview.raw, good);
});

test("odd values fall back safely and text is clipped", () => {
  const odd = readTeammate({ ...good, bot: { ...good.bot, mascot: "<img onerror=x>", color: "red", name: "N".repeat(80), instructions: "x".repeat(5_000) }, routines: [{ name: 1 }, { name: "ok", prompt: "p" }, null], about: 5 });
  assert.equal(odd.mascot, "nova");
  assert.equal(odd.color, "#6757d9");
  assert.equal(odd.name.length, 30);
  assert.equal(odd.instructions.length, 2_000);
  assert.equal(odd.about, null);
  assert.deepEqual(odd.routines, [{ name: "ok", prompt: "p" }]);
});

test("things that are not teammates are refused", () => {
  for (const bad of [null, {}, { kind: "openbot-teammate", version: 2, bot: {} }, { kind: "other", version: 1, bot: good.bot }, { kind: "openbot-teammate", version: 1, bot: { name: 1, role: "x", instructions: "y" } }]) assert.throws(() => readTeammate(bad), /not a Sidemates teammate/);
});
