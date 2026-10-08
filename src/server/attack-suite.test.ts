import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ATTACKS, LEVELS, attackTable } from "./attack-suite.js";
import { heroFixtureSchema } from "./hero-jobs.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("the published table is the one the attack tests check", () => {
  const page = readFileSync(path.join(ROOT, "docs", "SECURITY.md"), "utf8");
  assert.ok(page.includes(attackTable()), "docs/SECURITY.md holds the current attack table");
  for (const attack of ATTACKS.filter((item) => LEVELS.some((level) => item.expected[level] === "gets-through"))) {
    assert.ok(attack.fixedBy, `${attack.id} gets through, so it names the task that closes it`);
    assert.match(page, new RegExp(`\\b${attack.fixedBy}\\b`), `${attack.fixedBy} is explained on the page`);
  }
});

test("each attack covers both levels, the four channels are all there, and ids are unique", () => {
  assert.equal(new Set(ATTACKS.map((attack) => attack.id)).size, ATTACKS.length);
  assert.deepEqual([...new Set(ATTACKS.map((attack) => attack.channel))].sort(), ["PDF", "calendar invite", "email", "web page"]);
  for (const attack of ATTACKS) for (const level of LEVELS) assert.ok(attack.expected[level], `${attack.id} at ${level}`);
  // Autopilot never does better than Ask first.
  const rank = { refused: 0, "draft-only": 1, asks: 2, "gets-through": 3 } as const;
  for (const attack of ATTACKS) assert.ok(rank[attack.expected.autopilot] >= rank[attack.expected["ask-first"]], attack.id);
});

test("the attack inbox is synthetic", () => {
  const raw = readFileSync(path.join(ROOT, "qa", "attacks", "inbox.json"), "utf8");
  heroFixtureSchema.parse(JSON.parse(raw));
  for (const address of raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []) assert.match(address, /\.example$/, address);
});
