/** Reads a shared teammate (file, link or gallery) into something a person
 * can judge before adding it. Nothing is trusted: sizes are checked and only
 * text is ever shown as text. */
export interface TeammatePreview {
  raw: unknown;
  name: string; role: string; about: string | null; instructions: string;
  mascot: string; color: string;
  skills: number; routines: Array<{ name: string; prompt: string }>;
}

const MASCOTS = ["nova", "blob", "sprout", "orbit", "pebble", "sunny"];

export function readTeammate(raw: unknown): TeammatePreview {
  const item = raw as { kind?: unknown; version?: unknown; about?: unknown; bot?: Record<string, unknown>; skills?: unknown; routines?: unknown } | null;
  const bot = item?.bot;
  if (item?.kind !== "openbot-teammate" || item?.version !== 1 || typeof bot?.name !== "string" || typeof bot?.role !== "string" || typeof bot?.instructions !== "string") throw new Error("This is not a Sidemates teammate.");
  const color = typeof bot.color === "string" && /^#[0-9a-f]{6}$/i.test(bot.color) ? bot.color : "#6757d9";
  const routines = Array.isArray(item.routines) ? item.routines.filter((routine): routine is { name: string; prompt: string } => typeof routine?.name === "string" && typeof routine?.prompt === "string").slice(0, 20) : [];
  return {
    raw, name: bot.name.slice(0, 30), role: bot.role.slice(0, 60), about: typeof item.about === "string" ? item.about.slice(0, 240) : null, instructions: bot.instructions.slice(0, 2_000),
    mascot: typeof bot.mascot === "string" && MASCOTS.includes(bot.mascot) ? bot.mascot : "nova", color,
    skills: Array.isArray(item.skills) ? item.skills.length : 0, routines,
  };
}

