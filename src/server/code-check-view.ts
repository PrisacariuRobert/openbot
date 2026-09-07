import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";

// A unique copy avoids stale host-to-VM inode caches after atomic agent edits.
// Tests may create build output here, but may not change the tracked test/source
// files and still certify the original commit. Nothing is copied back.
export function createCodeCheckView(projectPath: string, dataDir: string, protectedPaths: string[]) {
  const base = path.join(dataDir, "code-check-views");
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const rootPath = mkdtempSync(path.join(base, "check-"));
  const privateData = path.relative(projectPath, dataDir);
  const excluded = [...protectedPaths, ...(privateData && !privateData.startsWith(`..${path.sep}`) && privateData !== ".." && !path.isAbsolute(privateData) ? [privateData] : [])];
  const isExcluded = (relative: string) => excluded.some((item) => relative === item || relative.startsWith(`${item}${path.sep}`));
  const dispose = () => rmSync(rootPath, { recursive: true, force: true });
  try {
    const tracked = spawnSync("git", ["-C", projectPath, "ls-files", "-z"], { encoding: "utf8", timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    if (tracked.status !== 0) throw new Error("The isolated project file list could not be checked.");
    const names = tracked.stdout.split("\0").filter(Boolean).filter((name) => !isExcluded(name));
    if (names.length > 20_000 || names.some((name) => path.isAbsolute(name) || name.split(/[\\/]/).includes(".."))) throw new Error("This project is too large or has unsupported paths for a bounded check.");
    let copiedBytes = 0, copiedFiles = 0;
    const filter = (source: string) => {
      if (isExcluded(path.relative(projectPath, source))) return false;
      const stat = lstatSync(source);
      if (!stat.isDirectory()) {
        copiedFiles++;
        copiedBytes += stat.size;
        if (copiedFiles > 100_000 || copiedBytes > 2 * 1024 ** 3) throw new Error("The check view exceeds 2 GB or 100,000 files. Remove generated output or use a smaller project.");
      }
      return true;
    };
    // Copy children individually so private data nested in a source repository
    // can be excluded without recursively copying the check view into itself.
    for (const entry of readdirSync(projectPath)) {
      const source = path.join(projectPath, entry);
      if (!isExcluded(entry)) cpSync(source, path.join(rootPath, entry), { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE, filter });
    }
    const fingerprint = (root: string, name: string) => {
      let filename = root;
      const parts = name.split(path.sep);
      for (const part of parts.slice(0, -1)) {
        filename = path.join(filename, part);
        try { if (!lstatSync(filename).isDirectory()) return "unsafe-parent"; } catch { return "missing"; }
      }
      filename = path.join(filename, parts.at(-1)!);
      let stat;
      try { stat = lstatSync(filename); } catch { return "missing"; }
      if (stat.isSymbolicLink()) return `link:${readlinkSync(filename)}`;
      if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error("A tracked file is too large or unsupported for a bounded check.");
      return `${stat.mode & 0o777}:${createHash("sha256").update(readFileSync(filename)).digest("hex")}`;
    };
    const before = names.map((name) => fingerprint(rootPath, name));
    if (names.some((name, index) => fingerprint(projectPath, name) !== before[index])) throw new Error("Project files changed while preparing the check. Try again from a stable commit.");
    return { rootPath, dispose, unchanged: () => names.every((name, index) => fingerprint(rootPath, name) === before[index]) };
  } catch (error) { dispose(); throw error; }
}
