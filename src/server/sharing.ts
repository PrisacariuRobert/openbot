import { z } from "zod";
import type { Bot, MascotKind } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { CommunitySkills } from "./community-skills.js";

const CREDENTIAL_PATTERN = /-----BEGIN .*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/;

function rejectCredentials(text: string, where: string) {
  if (CREDENTIAL_PATTERN.test(text)) throw new Error(`Remove the credential from ${where} before sharing.`);
}

export const botShareSchema = z.object({
  kind: z.literal("openbot-teammate"),
  version: z.literal(1),
  bot: z.object({
    name: z.string().trim().min(1).max(30), emoji: z.string().trim().min(1).max(8),
    mascot: z.enum(["nova", "blob", "sprout", "orbit", "pebble", "sunny"]).optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i), role: z.string().trim().min(1).max(60),
    instructions: z.string().trim().min(1).max(2_000), model: z.string().max(300).optional(),
  }),
  skills: z.array(z.string().max(100)).max(50).default([]),
  routines: z.array(z.object({
    name: z.string().trim().min(1).max(120), prompt: z.string().trim().min(1).max(4_000),
    intervalMinutes: z.number().min(5).max(43_200),
    schedule: z.unknown().optional(), triggerType: z.enum(["schedule", "calendar", "todoist", "dropbox", "slack", "notion", "webpage"]).optional(),
    triggerConfig: z.record(z.string(), z.unknown()).optional(),
  })).max(20).default([]),
});

export type BotShareBundle = z.infer<typeof botShareSchema>;

/** Portable teammate config. History, memory, attachments, access grants and
 * provider connections never leave the studio; the importer picks their own
 * connection and every routine arrives paused. */
export function exportBot(db: OpenBotDatabase, botId: string): BotShareBundle {
  const bot = db.getBot(botId);
  if (!bot) throw new Error("Teammate not found.");
  if (bot.retiredAt) throw new Error("Restore this teammate before sharing.");
  rejectCredentials(`${bot.name}\n${bot.role}\n${bot.instructions}`, "this teammate's profile");
  const skills = new CommunitySkills(db).list()
    .filter((skill) => skill.bundled && skill.botIds.includes(botId))
    .map((skill) => skill.id);
  const routines = db.listRoutines().filter((routine) => routine.botId === botId).map((routine) => {
    rejectCredentials(`${routine.name}\n${routine.prompt}`, `the routine "${routine.name}"`);
    const triggerType = ["calendar", "todoist", "dropbox", "slack", "notion", "webpage"].includes(routine.triggerType)
      ? routine.triggerType as BotShareBundle["routines"][number]["triggerType"]
      : undefined;
    return {
      name: routine.name, prompt: routine.prompt, intervalMinutes: routine.intervalMinutes,
      ...(routine.schedule ? { schedule: routine.schedule } : {}),
      ...(triggerType ? { triggerType } : {}),
      ...(routine.triggerConfig ? { triggerConfig: routine.triggerConfig as Record<string, unknown> } : {}),
    };
  });
  return {
    kind: "openbot-teammate", version: 1,
    bot: { name: bot.name, emoji: bot.emoji, mascot: bot.mascot as BotShareBundle["bot"]["mascot"], color: bot.color, role: bot.role, instructions: bot.instructions, ...(bot.model ? { model: bot.model } : {}) },
    skills, routines,
  };
}

export function importBot(db: OpenBotDatabase, raw: unknown): { bot: Bot; skills: number; routines: number } {
  const bundle = botShareSchema.parse(raw);
  rejectCredentials(`${bundle.bot.name}\n${bundle.bot.role}\n${bundle.bot.instructions}`, "this teammate's profile");
  for (const routine of bundle.routines) rejectCredentials(`${routine.name}\n${routine.prompt}`, `the routine "${routine.name}"`);
  const bot = db.createBot({
    name: bundle.bot.name, emoji: bundle.bot.emoji, mascot: bundle.bot.mascot as MascotKind | undefined,
    color: bundle.bot.color, role: bundle.bot.role, instructions: bundle.bot.instructions, model: bundle.bot.model || "",
  });
  const skills = new CommunitySkills(db);
  const known = skills.list().filter((skill) => skill.bundled && bundle.skills.includes(skill.id)).map((skill) => skill.id);
  let assigned = 0;
  for (const id of known) {
    const current = skills.list().find((skill) => skill.id === id);
    if (current && !current.botIds.includes(bot.id)) {
      skills.assign(id, [...current.botIds, bot.id]);
      assigned += 1;
    }
  }
  let routines = 0;
  for (const routine of bundle.routines) {
    db.createRoutine({
      name: routine.name.slice(0, 120), botId: bot.id, threadId: bot.threadId, prompt: routine.prompt,
      intervalMinutes: routine.intervalMinutes,
      ...(routine.schedule !== undefined ? { schedule: routine.schedule as Parameters<OpenBotDatabase["createRoutine"]>[0]["schedule"] } : {}),
      ...(routine.triggerType ? { triggerType: routine.triggerType } : {}),
      ...(routine.triggerConfig ? { triggerConfig: routine.triggerConfig as Parameters<OpenBotDatabase["createRoutine"]>[0]["triggerConfig"] } : {}),
      enabled: false,
    });
    routines += 1;
  }
  return { bot: db.getBot(bot.id)!, skills: assigned, routines };
}
