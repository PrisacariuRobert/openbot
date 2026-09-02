import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type MacFileEntry = {
  name: string;
  path: string;
  kind: "file" | "folder";
  size: number;
  modifiedAt: string;
};

export type MacFileMove = { from: string; to: string };

const TEXT_EXTENSIONS = new Set([
  ".csv", ".css", ".html", ".ini", ".js", ".json", ".jsx", ".log", ".md", ".mjs", ".py", ".rst", ".rtf", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);

export class MacFileAccess {
  readonly root: string;

  constructor(root = homedir()) {
    this.root = path.resolve(root);
  }

  private resolve(requested = ""): { target: string; relative: string } {
    const cleaned = String(requested).trim().replace(/^~(?:[\\/]|$)/, "");
    const target = path.resolve(path.isAbsolute(cleaned) ? cleaned : path.join(this.root, cleaned || "."));
    const relative = path.relative(this.root, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("That location is outside the allowed Mac home folder.");
    const parts = relative.split(path.sep).filter(Boolean);
    if (parts.some((part) => part.startsWith(".")) || parts[0] === "Library") throw new Error("Hidden and system folders stay protected.");
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      if (!existsSync(current)) break;
      if (lstatSync(current).isSymbolicLink()) throw new Error("Aliases and symbolic links stay protected.");
    }
    return { target, relative: relative || "." };
  }

  list(requested = ""): MacFileEntry[] {
    const { target } = this.resolve(requested);
    if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error("That Mac folder was not found.");
    return readdirSync(target, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "Library" && !entry.isSymbolicLink())
      .slice(0, 250)
      .map((entry) => {
        const absolute = path.join(target, entry.name), info = statSync(absolute);
        return {
          name: entry.name,
          path: path.relative(this.root, absolute),
          kind: entry.isDirectory() ? "folder" as const : "file" as const,
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
        };
      });
  }

  read(requested: string): { path: string; content: string; characters: number } {
    const { target, relative } = this.resolve(requested);
    if (!existsSync(target) || !statSync(target).isFile()) throw new Error("That Mac file was not found.");
    if (!TEXT_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new Error("OpenBot can only read bounded text files directly. Other files can still be organized without opening them.");
    if (statSync(target).size > 500_000) throw new Error("That text file is larger than the 500 KB reading limit.");
    const content = readFileSync(target, "utf8");
    return { path: relative, content, characters: content.length };
  }

  organize(moves: MacFileMove[]): { moved: Array<{ from: string; to: string }>; count: number } {
    if (!Array.isArray(moves) || moves.length < 1 || moves.length > 100) throw new Error("Choose between one and 100 files to organize at once.");
    const seenSources = new Set<string>(), seenTargets = new Set<string>();
    const plan = moves.map((move) => {
      const source = this.resolve(move.from), destination = this.resolve(move.to);
      if (source.target === destination.target) throw new Error("A file cannot be moved onto itself.");
      if (seenSources.has(source.target) || seenTargets.has(destination.target)) throw new Error("Each source and destination must be unique.");
      seenSources.add(source.target); seenTargets.add(destination.target);
      if (!existsSync(source.target)) throw new Error(`Could not find ${source.relative}.`);
      const info = lstatSync(source.target);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Mac organization moves regular files only; existing folders and aliases stay in place.");
      if (existsSync(destination.target)) throw new Error(`Nothing was moved because ${destination.relative} already exists.`);
      return { source, destination };
    });
    for (const item of plan) mkdirSync(path.dirname(item.destination.target), { recursive: true });
    for (const item of plan) renameSync(item.source.target, item.destination.target);
    const moved = plan.map((item) => ({ from: item.source.relative, to: item.destination.relative }));
    return { moved, count: moved.length };
  }
}
