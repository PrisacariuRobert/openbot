import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
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
export type MacFileOrganizationResult = {
  moved: MacFileMove[];
  count: number;
  complete: boolean;
  remaining: MacFileMove[];
  copies: MacFileMove[];
  error?: string;
};

/** Partial work needs reconciliation, never a replay of the original batch. */
export class MacOrganizationIncompleteError extends Error {
  constructor(readonly result: MacFileOrganizationResult) {
    const describe = (moves: MacFileMove[]) => moves.length ? moves.map((move) => `${JSON.stringify(move.from)} → ${JSON.stringify(move.to)}`).join("; ") : "None";
    super(`File organization stopped before all moves finished. ${result.error || "Check the files before continuing."}\nMoved: ${describe(result.moved)}\nDestination copies retained with source still present or changed: ${describe(result.copies)}${result.copies.length ? "\nThese retained paths may still refer to the same file; they are not independent backups." : ""}\nUnfinished moves: ${describe(result.remaining)}\nDo not repeat completed moves or replay this batch. Inspect the listed paths and prepare a fresh review for any remaining work.`);
    this.name = "MacOrganizationIncompleteError";
  }
}

const TEXT_EXTENSIONS = new Set([
  ".csv", ".css", ".html", ".ini", ".js", ".json", ".jsx", ".log", ".md", ".mjs", ".py", ".rst", ".rtf", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);

export class MacFileAccess {
  readonly root: string;

  constructor(root = homedir(), private readonly fileOperations: { claimDestination: typeof linkSync; removeSource: typeof unlinkSync } = { claimDestination: linkSync, removeSource: unlinkSync }) {
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

  organize(moves: MacFileMove[]): MacFileOrganizationResult {
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
      return { source, destination, identity: { dev: info.dev, ino: info.ino } };
    });
    const moved: MacFileMove[] = [], copies: MacFileMove[] = [];
    for (const [index, item] of plan.entries()) {
      let claimed = false;
      const pair = { from: item.source.relative, to: item.destination.relative };
      try {
        // Revalidate paths after earlier moves. A hard-link claim is atomic:
        // unlike rename, it cannot replace a destination created after review.
        // Cross-filesystem moves stop safely; there is no copy/delete fallback.
        this.resolve(item.source.target); this.resolve(item.destination.target);
        const before = lstatSync(item.source.target);
        if (!before.isFile() || before.isSymbolicLink() || before.dev !== item.identity.dev || before.ino !== item.identity.ino) throw new Error("A source file changed. Review its current contents before moving it.");
        mkdirSync(path.dirname(item.destination.target), { recursive: true });
        this.fileOperations.claimDestination(item.source.target, item.destination.target);
        claimed = true;
        const current = lstatSync(item.source.target), destination = lstatSync(item.destination.target);
        if (!current.isFile() || !destination.isFile() || current.isSymbolicLink() || destination.isSymbolicLink() || current.dev !== item.identity.dev || current.ino !== item.identity.ino || destination.dev !== item.identity.dev || destination.ino !== item.identity.ino) throw new Error("A source or destination changed during the move. Both paths were left in place for review.");
        // This identity check detects ordinary concurrent changes; it is not a
        // sandbox against hostile actors racing every filesystem operation.
        this.fileOperations.removeSource(item.source.target);
        moved.push(pair);
      } catch (error) {
        if (claimed) copies.push(pair);
        const code = (error as NodeJS.ErrnoException).code;
        const detail = code === "EEXIST" ? "A destination already exists. It was not overwritten."
          : code === "EXDEV" ? "This move crosses filesystems. The source was kept; move it manually or choose a folder on the same disk."
          : claimed ? "The destination was claimed, but the source could not be safely removed. Check both paths before continuing."
          : code ? "A file or folder could not be accessed. Completed moves remain in place; unfinished sources were not removed."
          : error instanceof Error ? error.message : "The remaining files could not be moved safely.";
        return { moved, count: moved.length, complete: false, copies, remaining: plan.slice(index).map((pending) => ({ from: pending.source.relative, to: pending.destination.relative })), error: detail };
      }
    }
    return { moved, count: moved.length, complete: true, copies, remaining: [] };
  }
}
