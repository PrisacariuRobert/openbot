import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readGalleryIssue } from "../shared/gallery-submission.js";
import { botShareSchema } from "./sharing.js";

const CREDENTIAL = /-----BEGIN .*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})/;

/** Task R3: turn a submitted gallery issue into site/teammates/<slug>.json and its
 * index entry, after validating it. The issue body is untrusted text: it is parsed,
 * never run. The gallery test then checks it like every other gallery teammate. */
export function applyGallerySubmission(dir: string, body: string): { slug: string; name: string } {
  const fields = readGalleryIssue(body);
  if ("error" in fields) throw new Error(fields.error);
  let raw: unknown;
  try { raw = JSON.parse(fields.json); } catch { throw new Error("The teammate file isn't valid JSON. Use the file from \"Share as a file\"."); }
  const parsed = botShareSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The teammate file isn't a Sidemates teammate. Use the file from \"Share as a file\".");
  if (CREDENTIAL.test(fields.json)) throw new Error("The teammate file contains what looks like a key or password. Remove it first.");
  const file = path.join(dir, `${fields.slug}.json`);
  if (existsSync(file)) throw new Error(`The gallery already has a teammate called ${fields.slug}. Choose another short name.`);
  const bundle = { ...parsed.data, about: fields.about };
  // Routines always arrive paused, and a model choice is the importer's to make.
  const { model: _model, ...rest } = bundle.bot;
  const bot = { ...rest, mascot: rest.mascot ?? "nova" };
  const entry = { ...bundle, bot };
  writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  const indexFile = path.join(dir, "index.json");
  const index = JSON.parse(readFileSync(indexFile, "utf8")) as Array<Record<string, unknown>>;
  index.push({ slug: fields.slug, name: bot.name, role: bot.role, about: fields.about, mascot: bot.mascot, color: bot.color });
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  return { slug: fields.slug, name: bot.name };
}
