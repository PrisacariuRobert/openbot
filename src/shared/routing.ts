import type { Bot } from "./types.js";

export function mentionSlug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function mentionedBotIds(body: string, bots: Pick<Bot, "id" | "name">[]): string[] {
  const tokens = new Set(Array.from(body.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu), (match) => mentionSlug(match[1] || "")));
  if (tokens.has("everyone") || tokens.has("team")) return bots.map((bot) => bot.id);
  return bots.filter((bot) => tokens.has(mentionSlug(bot.name)) || tokens.has(mentionSlug(bot.id))).map((bot) => bot.id);
}

/** People address teammates the natural way too: "Nova: find…", "Pixel,
 * make…". A name followed by a colon or comma, at the start of the message
 * or a clause, counts as addressing that teammate. */
export function addressedBotIds(body: string, bots: Pick<Bot, "id" | "name">[]): string[] {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return bots.filter((bot) => bot.name.trim() && new RegExp(`(?:^|[.!?;\\n]\\s*|\\s(?:and|&)\\s+|^(?:hey|hi|ok|okay)\\s+)${escape(bot.name.trim())}(?:\\s*[:,]|\\s+(?:and|&)\\s+[\\p{L}\\p{N}_-]+\\s*[:,])`, "iu").test(body.trim())).map((bot) => bot.id);
}

/** "Nova: find three restaurants. Scout, double-check their hours." Scout's
 * part builds on Nova's result, so Scout should start once Nova has answered
 * rather than race her. Returns follower → teammate it follows, for parts
 * addressed later in the message that check, refine or use earlier work. */
export function followUpOrder(body: string, bots: Pick<Bot, "id" | "name">[]): Map<string, string> {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const addressed = new Set(addressedBotIds(body, bots));
  const positions = bots.filter((bot) => addressed.has(bot.id)).map((bot) => {
    const match = new RegExp(`(?:^|[.!?;\\n]\\s*|\\s(?:and|&)\\s+|^(?:hey|hi|ok|okay)\\s+)(${escape(bot.name.trim())})\\s*[:,]`, "iu").exec(body.trim());
    return match ? { id: bot.id, at: match.index + match[0].indexOf(match[1]!) } : null;
  }).filter((item): item is { id: string; at: number } => Boolean(item)).sort((a, b) => a.at - b.at);
  const order = new Map<string, string>();
  const text = body.trim();
  positions.forEach((item, index) => {
    if (!index) return;
    const part = text.slice(item.at, positions[index + 1]?.at ?? text.length);
    if (/\b(?:double[- ]?check|check|verify|confirm|review|proofread|fact[- ]?check|edit|polish|improve|tidy|shorten|summari[sz]e|translate|turn (?:it|this|that|them|those|these)|use (?:it|that|those|these|them|the (?:list|results?|plan|draft))|based on|afterwards?|then)\b|\b(?:their|them|those|these|it|her|his)\b/i.test(part)) order.set(item.id, positions[index - 1]!.id);
  });
  return order;
}

/** Teammates a bot's reply pulls into a group conversation. Unlike owner
 * mentions, @everyone/@team never fan out from a bot: only explicit,
 * existing members respond, so one reply can never wake the whole roster. */
export function botReplyMentions(body: string, bots: Pick<Bot, "id" | "name">[]): string[] {
  const tokens = new Set(Array.from(body.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu), (match) => mentionSlug(match[1] || "")));
  for (const reserved of ["everyone", "team", "user", "owner", "me"]) tokens.delete(reserved);
  return bots.filter((bot) => bot.id && (tokens.has(mentionSlug(bot.name)) || tokens.has(mentionSlug(bot.id)))).map((bot) => bot.id);
}

/** A bot handing a judgment call to the owner ("@user", "@owner") instead of
 * answering alone. Drives the thread's Needs-you state; it never starts runs. */
export function replyEscalatesToOwner(body: string): boolean {
  return /(?:^|\s)@(?:user|owner)\b/i.test(body);
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
  const addressed = addressedBotIds(body, bots);
  if (addressed.length) return bots.filter((bot) => addressed.includes(bot.id));
  if (requestedIds?.length) return bots.filter((bot) => requestedIds.includes(bot.id));
  return [...bots].sort((left, right) => {
    const score = routingScore(body, right) - routingScore(body, left);
    if (score) return score;
    const leftBusy = left.status === "working" || left.status === "waiting" ? 1 : 0;
    const rightBusy = right.status === "working" || right.status === "waiting" ? 1 : 0;
    return leftBusy - rightBusy || left.name.localeCompare(right.name);
  }).slice(0, 1);
}
