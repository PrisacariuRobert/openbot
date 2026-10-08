import { readFileSync } from "node:fs";
import path from "node:path";

/** Versioned prompt text (task A7). Each file in src/server/prompts starts with
 * `<!-- sidemates prompt: <name> · version <n> · <date> -->`; its fragments start
 * with `<!-- @key -->` and run until the next marker. Comments are not sent. */

export interface PromptFile {
  name: string;
  version: number;
  fragments: Array<{ key: string; text: string }>;
}

const PROMPTS_DIR = path.join(import.meta.dirname, "prompts");
const cache = new Map<string, PromptFile>();

export function parsePromptFile(name: string, source: string): PromptFile {
  const header = /^<!-- sidemates prompt: ([a-z-]+) · version (\d+) · [^>]+ -->/.exec(source);
  if (!header || header[1] !== name) throw new Error(`Prompt file ${name} has no valid header.`);
  const fragments: PromptFile["fragments"] = [];
  const marker = /^<!-- @([^>]+?) -->[ \t]*$/gm;
  const matches = [...source.matchAll(marker)];
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1]!.index! : source.length;
    const body = source.slice(match.index! + match[0].length, end).replace(/<!--[\s\S]*?-->/g, "");
    fragments.push({ key: match[1]!.trim(), text: body.replace(/^\n+|\s+$/g, "") });
  });
  return { name, version: Number(header[2]), fragments };
}

export function promptFile(name: string): PromptFile {
  let file = cache.get(name);
  if (!file) {
    file = parsePromptFile(name, readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8"));
    cache.set(name, file);
  }
  return file;
}

/** One fragment, with `{{placeholders}}` filled. A missing fragment or value is a bug, not an empty string. */
export function fragment(name: string, key: string, values: Record<string, string> = {}): string {
  const found = promptFile(name).fragments.find((item) => item.key === key);
  if (!found) throw new Error(`Prompt ${name} has no fragment ${key}.`);
  return found.text.replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) => {
    if (!(placeholder in values)) throw new Error(`Prompt ${name}/${key} needs ${placeholder}.`);
    return values[placeholder]!;
  });
}

/** `@rule <condition>` fragments whose condition holds, in file order. */
export function rules(name: string, can: (tool: string) => boolean): string[] {
  const holds = (condition: string) => condition === "always" || condition.split("|").some((part) => part.startsWith("!") ? !can(part.slice(1)) : can(part));
  return promptFile(name).fragments
    .filter((item) => item.key.startsWith("rule ") && holds(item.key.slice(5).trim()))
    .map((item) => item.text);
}

export const promptVersion = (name: string) => `${name} v${promptFile(name).version}`;
