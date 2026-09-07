import { z } from "zod";

export const recipeId = z.enum(["morning-brief", "inbox-follow-ups", "meeting-prep", "source-change-digest", "project-bug-fix", "weekly-review"]);
export type RecipeId = z.infer<typeof recipeId>;
export const recipePreferences = z.object({ detail: z.enum(["concise", "expanded"]), includeDrafts: z.boolean() }).strict();
export type RecipePreferences = z.infer<typeof recipePreferences>;
export const defaultRecipePreferences: RecipePreferences = { detail: "concise", includeDrafts: false };
export interface StarterRecipe {
  id: RecipeId; version: number; title: string; summary: string;
  requirements: string[]; output: string; limit: string;
  workKind: "morning" | "inbox" | "meeting" | "weekly" | null;
}
export const starterRecipes: StarterRecipe[] = [
  { id: "morning-brief", version: 1, title: "A calmer morning", summary: "See your next day and the few things that need attention.", requirements: ["A readable calendar, inbox, or selected Slack, Notion or Todoist source"], output: "A dated brief with source links and honest coverage.", limit: "Only permitted, selected sources. Not an exhaustive account search.", workKind: "morning" },
  { id: "inbox-follow-ups", version: 1, title: "Find replies worth sending", summary: "Spot unanswered conversations and prepare replies to review.", requirements: ["Read access to Gmail or Mail on the Mac"], output: "A source-linked inbox review; optional drafts stay in OpenBot.", limit: "No sending or changes to your mailbox. The fetched inbox window is bounded.", workKind: "inbox" },
  { id: "meeting-prep", version: 1, title: "Walk into a meeting prepared", summary: "Gather the next meeting and clearly labelled supporting context.", requirements: ["Read access to a calendar", "Optional permitted mail and Drive context"], output: "A meeting brief that distinguishes confirmed event details from candidate context.", limit: "Similar names do not establish that documents belong to the meeting.", workKind: "meeting" },
  { id: "source-change-digest", version: 1, title: "Tell me when a page changes", summary: "Check a public page or feed without spending model tokens when unchanged.", requirements: ["A public page or feed URL", "Your chosen check frequency"], output: "A saved baseline and a change-triggered task with a source link.", limit: "Not authenticated social feeds. The host must be running; you choose the source before any watch starts.", workKind: null },
  { id: "project-bug-fix", version: 1, title: "Fix a bug with proof", summary: "Repair the problem, check the fix, and get a second teammate's review.", requirements: ["A selected Git project with explicit read, write and run permissions", "A concrete bug and an independent check", "The configured coding runtime", "Another teammate with read access for independent review"], output: "A checked patch; if you request and approve publication, a pull request with a saved delivery receipt.", limit: "Publishing needs a connected GitHub account and a complete change review. No automatic push, merge, deployment or dependency installation. Passing checks are not proof of complete test coverage.", workKind: null },
  { id: "weekly-review", version: 1, title: "Close the week", summary: "Bring selected work context together and choose next steps.", requirements: ["A readable calendar, inbox, or selected Slack, Notion or Todoist source"], output: "A source-linked review with next steps you can track locally.", limit: "Slack uses a seven-day window; Notion and open tasks show current state, not a weekly change history.", workKind: "weekly" },
];
// There are deliberately no free-text, URL, account, project, bot or source-ID
// fields here. Local bindings stay local. Unknown fields fail closed.
export const portableRecipeBody = z.object({ format: z.literal("openbot.recipe"), formatVersion: z.literal(1), recipeId, recipeVersion: z.literal(1), preferences: recipePreferences }).strict();
export const portableRecipe = portableRecipeBody.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type PortableRecipe = z.infer<typeof portableRecipe>;
export interface RecipeExample { recipeId: RecipeId; fixture: true; providerUsed: false; elapsedMs: number; checks: string[]; markdown: string; }
