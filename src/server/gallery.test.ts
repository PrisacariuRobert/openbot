import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { routineScheduleInput } from "../shared/calendar-schedule.js";
import { approvalReason } from "./safety.js";
import { botShareSchema, importBot } from "./sharing.js";
import { OpenBotDatabase } from "./testing/database.js";

const dir = path.resolve(import.meta.dirname, "../../site/teammates");
const slugs = readdirSync(dir).filter((file) => file.endsWith(".json") && file !== "index.json").map((file) => file.replace(/\.json$/, "")).sort();
const load = (slug: string) => JSON.parse(readFileSync(path.join(dir, `${slug}.json`), "utf8"));

test("the gallery has teammates, and the index lists exactly them", () => {
  assert.ok(slugs.length >= 6, `only ${slugs.length} teammates`);
  const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as Array<{ slug: string; name: string; role: string; about: string; mascot: string; color: string }>;
  assert.deepEqual(index.map((entry) => entry.slug).sort(), slugs);
  for (const entry of index) {
    const bundle = load(entry.slug);
    assert.deepEqual({ name: entry.name, role: entry.role, about: entry.about, mascot: entry.mascot, color: entry.color }, { name: bundle.bot.name, role: bundle.bot.role, about: bundle.about, mascot: bundle.bot.mascot, color: bundle.bot.color }, `index entry for ${entry.slug} is out of date`);
  }
});

for (const slug of slugs) {
  test(`gallery teammate ${slug}: valid, safe to import, runs unattended once switched on`, () => {
    const raw = readFileSync(path.join(dir, `${slug}.json`), "utf8");
    assert.ok(raw.length < 8_000, "small enough to read in one sitting");
    const bundle = botShareSchema.parse(JSON.parse(raw));
    assert.match(slug, /^[a-z0-9][a-z0-9-]{0,60}$/);
    assert.ok(bundle.about && bundle.about.length >= 30, "has a one-sentence description");
    assert.equal(bundle.bot.name.length <= 30 && bundle.bot.role.length <= 60, true);
    for (const skill of bundle.skills) assert.ok(existsSync(path.resolve(import.meta.dirname, "../../skills/bundled", skill, "SKILL.md")), `skill ${skill} exists`);
    for (const routine of bundle.routines) {
      assert.equal(approvalReason(routine.prompt), null, `routine "${routine.name}" would stop for approval at run time`);
      if (routine.schedule !== undefined) routineScheduleInput.parse(routine.schedule);
    }
    // Instructions never tell a teammate to send, buy, pay or delete on its own.
    assert.match(bundle.bot.instructions, /never|don't|only if|ask|before/i, "states a boundary");
    const root = mkdtempSync(path.join(tmpdir(), "openbot-gallery-"));
    try {
      const db = new OpenBotDatabase(root);
      const imported = importBot(db, JSON.parse(raw));
      assert.equal(imported.bot.browserEnabled, false);
      assert.equal(imported.bot.computerEnabled, false);
      assert.equal(imported.routines, bundle.routines.length);
      for (const routine of db.listRoutines().filter((item) => item.botId === imported.bot.id)) assert.equal(routine.enabled, false);
      db.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
