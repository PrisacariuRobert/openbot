import type { Bot } from "./types.js";

export function mentionSlug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function mentionedBotIds(body: string, bots: Pick<Bot, "id" | "name">[]): string[] {
  const tokens = new Set(Array.from(body.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu), (match) => mentionSlug(match[1] || "")));
  if (tokens.has("everyone") || tokens.has("team")) return bots.map((bot) => bot.id);
  return bots.filter((bot) => tokens.has(mentionSlug(bot.name)) || tokens.has(mentionSlug(bot.id))).map((bot) => bot.id);
}

function routingScore(body: string, bot: Pick<Bot, "role" | "instructions">): number {
  const haystack = body.toLowerCase();
  const profile = `${bot.role} ${bot.instructions}`.toLowerCase();
  const words = haystack.match(/[a-z0-9]{4,}/g) || [];
  let score = words.reduce((total, word) => total + (profile.includes(word) ? 2 : 0), 0);
  if (/research|source|compare|learn|find|investigate|summari[sz]e/.test(haystack) && /research|analys|source|investigat/.test(profile)) score += 8;
  if (/build|create|design|code|write|make|implement|fix/.test(haystack) && /maker|build|design|code|creat|engineer/.test(profile)) score += 8;
  if (/schedule|routine|organize|operate|monitor|check|run|workflow/.test(haystack) && /operat|organiz|schedule|workflow|reliable/.test(profile)) score += 8;
  return score;
}

export function resolveMessageTargets(input: {
  body: string;
  bots: Bot[];
  requestedIds?: string[];
  directBotId?: string | null;
}): Bot[] {
  const { body, bots, requestedIds, directBotId } = input;
  if (directBotId) return bots.filter((bot) => bot.id === directBotId);
  const mentions = mentionedBotIds(body, bots);
  if (mentions.length) return bots.filter((bot) => mentions.includes(bot.id));
  if (requestedIds?.length) return bots.filter((bot) => requestedIds.includes(bot.id));
  return [...bots].sort((left, right) => {
    const score = routingScore(body, right) - routingScore(body, left);
    if (score) return score;
    const leftBusy = left.status === "working" || left.status === "waiting" ? 1 : 0;
    const rightBusy = right.status === "working" || right.status === "waiting" ? 1 : 0;
    return leftBusy - rightBusy || left.name.localeCompare(right.name);
  }).slice(0, 1);
}
