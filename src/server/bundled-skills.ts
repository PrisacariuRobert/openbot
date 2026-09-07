import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";

// Bundled, pinned text only. No downloads, third-party code loading or account grants.
const root = new URL("../../skills/bundled/", import.meta.url);
const catalog = z.array(z.object({ id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), source: z.string() }).strict()).min(1).max(30).parse(JSON.parse(readFileSync(new URL("catalog.json", root), "utf8")));
if (new Set(catalog.map((entry) => entry.id)).size !== catalog.length) throw new Error("Duplicate bundled skill ID.");
const license = readFileSync(new URL("LICENSE", root), "utf8");
export const bundledSkillBundles = catalog.map((entry) => ({
  id: `bundled-${entry.id}`,
  source: entry.source,
  files: { "SKILL.md": readFileSync(new URL(`${entry.id}/SKILL.md`, root), "utf8"), LICENSE: license },
}));
export const bundledSkillsRevision = createHash("sha256").update(JSON.stringify(bundledSkillBundles)).digest("hex");
export const BUNDLED_ACCESS_KIND = "bundled-skill-access";
export interface BundledSkillAccess { enabledByDefault: boolean; overrides: Record<string, boolean> }
