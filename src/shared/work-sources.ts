import { z } from "zod";

export const workApp = z.enum(["slack", "notion", "todoist"]);
export type WorkApp = z.infer<typeof workApp>;
export const workSourceSelection = z.object({
  service: workApp,
  id: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(1).max(200),
}).strict();
export const workSourcesInput = z.object({
  lookbackHours: z.union([z.literal(24), z.literal(72), z.literal(168)]).default(24),
  selections: z.array(workSourceSelection).max(6).default([]),
}).strict().superRefine((value, ctx) => {
  const keys = value.selections.map((item) => `${item.service}:${item.id}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Choose each source only once." });
  for (const app of workApp.options) if (value.selections.filter((item) => item.service === app).length > 2) {
    ctx.addIssue({ code: "custom", message: "Choose up to two sources from each app to keep briefs focused." });
  }
});
export type WorkSourceSelection = z.infer<typeof workSourceSelection>;
export type WorkSourcesInput = z.infer<typeof workSourcesInput>;
export interface WorkSourcesSettings extends WorkSourcesInput { revision: number; connectionVersions: Partial<Record<WorkApp, number>> }
export interface WorkSourceChoices { choices: WorkSourceSelection[]; limited: boolean }
