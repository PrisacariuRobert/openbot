import type { Express, Request, Response } from "express";
import { z } from "zod";
import { recipeId, recipePreferences } from "../shared/recipes.js";
import type { OpenBotDatabase } from "./database.js";
import { exportRecipe, inspectRecipe, RecipeLibrary } from "./recipes.js";
import { runRecipeExample } from "./recipe-examples.js";

// Owner-authenticated routes only. No route is exposed to the internal model
// gateway. Example inputs select a known recipe, never an executable payload.
export function registerRecipeRoutes(app: Express, db: OpenBotDatabase, onChange: () => void) {
  const library = new RecipeLibrary(db);
  let exampleRunning = false, lastExampleAt = 0;
  const route = (work: (req: Request) => unknown | Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await work(req)); }
    catch (error) { res.status(400).json({ error: error instanceof z.ZodError ? "Use a current OpenBot recipe file containing only recipe settings." : error instanceof Error ? error.message : "This recipe could not be opened." }); }
  };
  app.get("/api/recipes", route((req) => library.list(z.string().min(1).parse(req.query.botId))));
  app.post("/api/recipes/export", route((req) => { const input = z.object({ recipeId, preferences: recipePreferences }).strict().parse(req.body); return exportRecipe(input.recipeId, input.preferences); }));
  app.post("/api/recipes/inspect", route((req) => inspectRecipe(req.body)));
  app.post("/api/recipes/import", route((req) => { const result = library.save(req.body); onChange(); return result; }));
  app.post("/api/recipes/prepare", route((req) => library.prepare(req.body)));
  app.post("/api/recipes/example", route(async (req) => {
    const input = z.object({ recipeId }).strict().parse(req.body);
    if (exampleRunning || Date.now() - lastExampleAt < 3_000) throw new Error("An example just ran. Give it a few seconds before trying another.");
    exampleRunning = true;
    try { return await runRecipeExample(input.recipeId); }
    finally { exampleRunning = false; lastExampleAt = Date.now(); }
  }));
}
