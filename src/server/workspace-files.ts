import path from "node:path";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import type { WorkspaceFile } from "../shared/types.js";

function isWithin(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function canonicalRoot(root: string) {
  if (!existsSync(root)) return null;
  try { return realpathSync(root); }
  catch { return null; }
}

export function listWorkspaceFiles(root: string, maxDepth = 5): WorkspaceFile[] {
  const resolvedRoot = path.resolve(root), realRoot = canonicalRoot(resolvedRoot);
  if (!realRoot) return [];

  const visit = (current: string, depth: number): WorkspaceFile[] => {
    if (depth > maxDepth) return [];
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch { return []; }

    return entries.filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink()).flatMap((entry) => {
      const absolute = path.join(current, entry.name);
      try {
        const stat = lstatSync(absolute);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) return [];
        const canonical = realpathSync(absolute);
        if (!isWithin(realRoot, canonical)) return [];
        const item: WorkspaceFile = {
          path: path.relative(resolvedRoot, absolute),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          kind: stat.isDirectory() ? "directory" : "file",
        };
        return stat.isDirectory() ? [item, ...visit(absolute, depth + 1)] : [item];
      } catch {
        return [];
      }
    });
  };

  return visit(resolvedRoot, 0);
}

export type WorkspaceFileRead =
  | { ok: true; path: string; content: string }
  | { ok: false; reason: "not_found" | "too_large" };

export function readWorkspaceFile(root: string, relativePath: string, maxBytes = 500_000): WorkspaceFileRead {
  const resolvedRoot = path.resolve(root), target = path.resolve(resolvedRoot, relativePath);
  if (!relativePath || relativePath.length > 2_048 || !isWithin(resolvedRoot, target)) return { ok: false, reason: "not_found" };
  const realRoot = canonicalRoot(resolvedRoot);
  if (!realRoot || !existsSync(target)) return { ok: false, reason: "not_found" };

  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile() || !isWithin(realRoot, realpathSync(target))) return { ok: false, reason: "not_found" };
    if (stat.size > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, path: path.relative(resolvedRoot, target), content: readFileSync(target, "utf8") };
  } catch {
    return { ok: false, reason: "not_found" };
  }
}
