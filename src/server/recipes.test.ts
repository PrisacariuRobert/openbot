import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { starterRecipes } from "../shared/recipes.js";
import { exportRecipe, inspectRecipe, RecipeLibrary } from "./recipes.js";
import { OpenBotDatabase } from "./testing/database.js";
import { runRecipeExample } from "./recipe-examples.js";

test("portable recipes accept only known settings, no private bindings or executable instructions", () => {
  const bundle = exportRecipe("inbox-follow-ups", { detail: "expanded", includeDrafts: true });
  assert.equal(inspectRecipe(JSON.parse(JSON.stringify(bundle))).recipe.id, "inbox-follow-ups");
  for (const field of ["accountId", "botId", "projectId", "sourceId", "url", "instructions", "name", "credentials", "steps", "history"]) {
    assert.throws(() => inspectRecipe({ ...bundle, [field]: "private@example.com" }));
  }
  assert.throws(() => inspectRecipe({ ...bundle, preferences: { ...bundle.preferences, url: "https://private.example/path" } }));
  assert.throws(() => inspectRecipe({ ...bundle, preferences: { ...bundle.preferences, detail: "concise" } }), /changed after export/);
  assert.throws(() => inspectRecipe({ ...bundle, recipeVersion: 2 }));
  assert.throws(() => inspectRecipe({ ...bundle, format: "openbot.skill" }));
});

test("import is idempotent and bot-specific; preparing does not create jobs or grant access", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-recipe-import-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
  try {
    const library = new RecipeLibrary(db), bundle = exportRecipe("morning-brief");
    const before = db.getState();
    library.save({ botId: "nova", bundle }); library.save({ botId: "nova", bundle });
    assert.equal(library.list("nova").saved.length, 1); assert.equal(library.list("pixel").saved.length, 0);
    assert.throws(() => library.save({ botId: "missing", bundle }));
    for (const recipe of starterRecipes) {
      const prepared = library.prepare({ botId: "nova", recipeId: recipe.id, preferences: bundle.preferences, timeZone: "Europe/Brussels" });
      assert.equal(prepared.botId, "nova"); assert.equal(prepared.expectedWorkKind, recipe.workKind);
      if (!recipe.workKind) assert.match(prepared.prompt, /First ask/);
    }
    assert.throws(() => library.prepare({ botId: "nova", recipeId: "morning-brief", preferences: bundle.preferences, timeZone: "not/a/timezone" }));
    const after = db.getState();
    assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.routines, before.routines);
    assert.deepEqual(after.bots, before.bots);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("safe examples remain isolated even when a live data directory is configured", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-recipe-owner-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "owner") });
  const previous = process.env.OPENBOT_DATA_DIR;
  try {
    db.remember("nova", "Private note", "This must never appear in an example.");
    const before = db.getState();
    process.env.OPENBOT_DATA_DIR = db.dataDir;
    for (const recipe of starterRecipes) {
      const example = await runRecipeExample(recipe.id);
      assert.equal(example.providerUsed, false); assert.equal(example.fixture, true);
      assert.ok(example.checks.length >= 3); assert.match(example.markdown, /synthetic data/);
      assert.doesNotMatch(example.markdown, /This must never appear/);
    }
    assert.deepEqual(db.getState(), before);
    assert.equal(db.searchMemories("nova", "Private").length, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENBOT_DATA_DIR; else process.env.OPENBOT_DATA_DIR = previous;
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

test("the bug-fix starter asks for scope and checked delivery, not an unapproved publication", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-recipe-delivery-"));
  const db = new OpenBotDatabase(root);
  try {
    const before = db.getState();
    const prepared = new RecipeLibrary(db).prepare({ botId: "nova", recipeId: "project-bug-fix", preferences: { detail: "concise", includeDrafts: false }, timeZone: "Europe/Brussels" });
    for (const required of ["First ask", "independent failing check", "keep the original tests", "code_request_review", "Wait for the review", "one combined result", "If I also request publication", "wait for my approval", "host delivery receipt"]) assert.ok(prepared.prompt.includes(required), required);
    assert.deepEqual(db.getState(), before, "Preparing a recipe cannot create work or publish a change");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
