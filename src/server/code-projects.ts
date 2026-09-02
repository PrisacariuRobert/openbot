import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import type { CodeProject, CodeProjectReview, CodeProjectSuggestion } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

const SKIP_DIRECTORIES = new Set([".git", ".openbot", "node_modules", "dist", "build", "coverage", ".next", ".turbo", "vendor"]);
const SAFE_HIDDEN_DIRECTORIES = new Set([".github"]);
const MAX_FILE_BYTES = 1_000_000;
const MAX_DIFF_CHARACTERS = 60_000;

type ProjectAccessInput = Array<{ botId: string; canRead: boolean; canWrite: boolean; canRun: boolean }>;

export function parseGitHubRepository(input: string): { owner: string; name: string; url: string } {
  const value = String(input).trim();
  let owner = "", repository = "";
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(value)) [owner, repository] = value.split("/");
  else {
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new Error("Use a GitHub link or owner/project."); }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com" || parsed.username || parsed.password || parsed.search || parsed.hash || segments.length !== 2) throw new Error("Use a standard public or private GitHub repository link.");
    [owner, repository] = segments;
  }
  const name = repository.replace(/\.git$/i, "");
  if (!owner || !name || owner === "." || owner === ".." || name === "." || name === "..") throw new Error("Use a GitHub link or owner/project.");
  return { owner, name, url: `https://github.com/${owner}/${name}.git` };
}

function contentHash(content: Buffer | string) { return createHash("sha256").update(content).digest("hex"); }

function safeGitError(value: unknown) {
  return String(value || "Git could not finish that action.").replace(/https:\/\/[^\s/@]+@github\.com/gi, "https://github.com").replace(/[\r\n]+/g, " ").trim().slice(0, 500);
}

export type CodeFileEntry = { path: string; kind: "file" | "directory"; size: number; modifiedAt: string };

export class CodeProjectManager {
  readonly allowedRoot: string;

  constructor(private readonly db: OpenBotDatabase, allowedRoot = homedir()) {
    this.allowedRoot = realpathSync(path.resolve(allowedRoot));
  }

  inspectRoot(requested: string): { rootPath: string; gitRepository: boolean; projectKind: string; remoteUrl: string | null; defaultBranch: string | null; managedClone: boolean } {
    const resolved = path.resolve(String(requested).trim().replace(/^~(?:[\\/]|$)/, `${homedir()}${path.sep}`));
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw new Error("Choose an existing project folder.");
    if (lstatSync(resolved).isSymbolicLink()) throw new Error("Choose the real project folder instead of an alias.");
    const rootPath = realpathSync(resolved), relative = path.relative(this.allowedRoot, rootPath);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Choose one project folder inside your home directory, not the whole home or a system folder.");
    if (relative.split(path.sep).some((part) => part.startsWith("."))) throw new Error("Hidden folders cannot be added as code projects.");
    const gitRepository = existsSync(path.join(rootPath, ".git"));
    const projectKind = existsSync(path.join(rootPath, "package.json")) ? "JavaScript / TypeScript"
      : existsSync(path.join(rootPath, "pyproject.toml")) || existsSync(path.join(rootPath, "requirements.txt")) ? "Python"
        : existsSync(path.join(rootPath, "Cargo.toml")) ? "Rust"
          : existsSync(path.join(rootPath, "go.mod")) ? "Go" : "Code project";
    const origin = gitRepository ? spawnSync("git", ["remote", "get-url", "origin"], { cwd: rootPath, encoding: "utf8", timeout: 5_000 }) : null;
    const remoteUrl = origin?.status === 0 ? this.safeRemoteUrl(String(origin.stdout || "").trim()) : null;
    const remoteHead = gitRepository ? spawnSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: rootPath, encoding: "utf8", timeout: 5_000 }) : null;
    const current = gitRepository ? spawnSync("git", ["branch", "--show-current"], { cwd: rootPath, encoding: "utf8", timeout: 5_000 }) : null;
    const defaultBranch = remoteHead?.status === 0 ? String(remoteHead.stdout || "").trim().replace(/^origin\//, "") : String(current?.stdout || "").trim() || null;
    return { rootPath, gitRepository, projectKind, remoteUrl, defaultBranch, managedClone: rootPath.startsWith(`${path.join(this.allowedRoot, "Documents", "OpenBot Projects")}${path.sep}`) };
  }

  private safeRemoteUrl(value: string): string | null {
    const ssh = /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(value);
    if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
    try { const parsed = parseGitHubRepository(value); return parsed.url.replace(/\.git$/, ""); } catch { return null; }
  }

  private git(project: CodeProject, args: string[], timeout = 15_000) {
    const result = spawnSync("git", args, { cwd: project.rootPath, encoding: "utf8", timeout, maxBuffer: 1_500_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    if (result.error || result.status !== 0) throw new Error(safeGitError(result.stderr || result.error?.message));
    return String(result.stdout || "");
  }

  private async command(command: string, args: string[], options: { cwd: string; timeout?: number; env?: NodeJS.ProcessEnv }) {
    return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1", ...options.env }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "", settled = false;
      const timer = setTimeout(() => { child.kill("SIGKILL"); if (!settled) { settled = true; reject(new Error(`${command} took too long and was stopped.`)); } }, options.timeout || 120_000);
      child.stdout.on("data", (chunk) => { if (stdout.length < 1_500_000) stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { if (stderr.length < 1_500_000) stderr += String(chunk); });
      child.on("error", (error) => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
      child.on("close", (code) => { clearTimeout(timer); if (settled) return; settled = true; code === 0 ? resolve({ stdout, stderr }) : reject(new Error(safeGitError(stderr || `${command} exited ${code}`))); });
    });
  }

  async cloneGitHub(input: string, access: ProjectAccessInput): Promise<CodeProject> {
    const repository = parseGitHubRepository(input), base = path.join(this.allowedRoot, "Documents", "OpenBot Projects"), destination = path.join(base, repository.name);
    mkdirSync(base, { recursive: true });
    if (existsSync(destination)) throw new Error(`${repository.name} already exists in OpenBot Projects. Connect that folder instead.`);
    const temporary = path.join(base, `.openbot-clone-${randomUUID()}`);
    try {
      await this.command("git", ["clone", "--origin", "origin", "--", repository.url, temporary], { cwd: base, timeout: 180_000 });
      renameSync(temporary, destination);
      const inspected = this.inspectRoot(destination);
      return this.db.createCodeProject({ name: repository.name, ...inspected, remoteUrl: repository.url.replace(/\.git$/, ""), managedClone: true, access });
    } catch (error) {
      if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  suggestions(): CodeProjectSuggestion[] {
    const connected = new Set(this.db.listCodeProjects().map((project) => project.rootPath));
    const bases = [path.join(this.allowedRoot, "Documents", "GitHub"), path.join(this.allowedRoot, "Developer"), path.join(this.allowedRoot, "Projects")];
    const suggestions: CodeProjectSuggestion[] = [];
    for (const base of bases) {
      if (!existsSync(base) || !statSync(base).isDirectory()) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (suggestions.length >= 18 || !entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        try {
          const inspected = this.inspectRoot(path.join(base, entry.name));
          if (!connected.has(inspected.rootPath)) suggestions.push({ name: entry.name, ...inspected });
        } catch { /* Ignore folders that fail the same checks used during connection. */ }
      }
    }
    return suggestions;
  }

  private project(botId: string, projectId: string, capability: "read" | "write" | "run" = "read"): CodeProject {
    const project = this.db.getCodeProjectForBot(botId, projectId, capability);
    if (!project) throw new Error(capability === "read" ? "This teammate cannot access that code project." : `This teammate does not have ${capability} access to that code project.`);
    if (!existsSync(project.rootPath) || lstatSync(project.rootPath).isSymbolicLink() || realpathSync(project.rootPath) !== project.rootPath) throw new Error("This code project moved or became an alias. Disconnect it, then connect its real folder again.");
    return project;
  }

  forRun(botId: string, projectId: string): CodeProject {
    return this.project(botId, projectId, "run");
  }

  private resolveFile(project: CodeProject, requested = "", allowMissing = false): { target: string; relative: string } {
    const clean = String(requested).trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (path.isAbsolute(clean)) throw new Error("Use a path relative to the project root.");
    const target = path.resolve(project.rootPath, clean || "."), relative = path.relative(project.rootPath, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("That path leaves the allowed code project.");
    const parts = relative.split(path.sep).filter(Boolean);
    if (parts.some((part) => part.startsWith(".") && !SAFE_HIDDEN_DIRECTORIES.has(part))) throw new Error("Hidden project files, secrets, and Git internals stay protected.");
    let current = project.rootPath;
    for (const part of parts) {
      current = path.join(current, part);
      if (!existsSync(current)) {
        if (allowMissing) break;
        throw new Error("That project file was not found.");
      }
      if (lstatSync(current).isSymbolicLink()) throw new Error("Aliases and symbolic links stay protected.");
    }
    return { target, relative: relative || "." };
  }

  list(botId: string, projectId: string, requested = ""): { project: Pick<CodeProject, "id" | "name" | "projectKind">; path: string; entries: CodeFileEntry[] } {
    const project = this.project(botId, projectId), start = this.resolveFile(project, requested);
    if (!statSync(start.target).isDirectory()) throw new Error("Choose a folder inside the code project.");
    const entries: CodeFileEntry[] = [];
    const walk = (directory: string, depth: number) => {
      if (depth > 6 || entries.length >= 300) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entries.length >= 300 || entry.isSymbolicLink() || (entry.name.startsWith(".") && !SAFE_HIDDEN_DIRECTORIES.has(entry.name)) || SKIP_DIRECTORIES.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name), info = statSync(absolute);
        entries.push({ path: path.relative(project.rootPath, absolute), kind: entry.isDirectory() ? "directory" : "file", size: info.size, modifiedAt: info.mtime.toISOString() });
        if (entry.isDirectory()) walk(absolute, depth + 1);
      }
    };
    walk(start.target, 0);
    return { project: { id: project.id, name: project.name, projectKind: project.projectKind }, path: start.relative, entries };
  }

  read(botId: string, projectId: string, requested: string): { projectId: string; path: string; content: string; characters: number } {
    const project = this.project(botId, projectId), file = this.resolveFile(project, requested);
    if (!statSync(file.target).isFile()) throw new Error("Choose a file inside the code project.");
    if (statSync(file.target).size > MAX_FILE_BYTES) throw new Error("That code file is larger than the 1 MB reading limit.");
    const buffer = readFileSync(file.target);
    if (buffer.includes(0)) throw new Error("Binary project files cannot be opened as code.");
    const content = buffer.toString("utf8");
    return { projectId, path: file.relative, content, characters: content.length };
  }

  search(botId: string, projectId: string, query: string): { projectId: string; query: string; matches: string[] } {
    const project = this.project(botId, projectId), needle = query.trim();
    if (!needle || needle.length > 240) throw new Error("Use a focused code search of up to 240 characters.");
    const result = spawnSync("rg", ["-n", "-F", "--no-heading", "--color", "never", "--max-count", "20", "--max-columns", "360", "--glob", "!node_modules/**", "--glob", "!.git/**", "--glob", "!.env*", "--glob", "!dist/**", "--glob", "!build/**", needle, "."], { cwd: project.rootPath, encoding: "utf8", timeout: 15_000, maxBuffer: 800_000 });
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Code search needs ripgrep installed on this Mac.");
    if (result.status !== 0 && result.status !== 1) throw new Error("Code search stopped before it could finish.");
    return { projectId, query: needle, matches: String(result.stdout || "").split(/\r?\n/).filter(Boolean).slice(0, 200) };
  }

  write(botId: string, projectId: string, requested: string, content: string) {
    const project = this.project(botId, projectId, "write"), file = this.resolveFile(project, requested, true);
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("Write code files smaller than 1 MB at a time.");
    const existed = existsSync(file.target), originalMode = existed ? statSync(file.target).mode : null, before = existed ? this.read(botId, projectId, requested).content : "";
    if (existed && !statSync(file.target).isFile()) throw new Error("That project path is not a file.");
    mkdirSync(path.dirname(file.target), { recursive: true });
    const temporary = path.join(path.dirname(file.target), `.openbot-write-${randomUUID()}`);
    try {
      writeFileSync(temporary, content, "utf8");
      if (originalMode !== null) chmodSync(temporary, originalMode);
      renameSync(temporary, file.target);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    const beforeLines = before ? before.split(/\r?\n/).length : 0, afterLines = content ? content.split(/\r?\n/).length : 0;
    const edit = this.db.recordCodeProjectEdit({ projectId, botId, path: file.relative, operation: existed ? "updated" : "created", additions: Math.max(0, afterLines - beforeLines) || (existed ? 0 : afterLines), deletions: Math.max(0, beforeLines - afterLines), beforeContent: existed ? before : null, afterHash: contentHash(content) });
    return { projectId, path: file.relative, operation: edit.operation, additions: edit.additions, deletions: edit.deletions, editId: edit.id };
  }

  replace(botId: string, projectId: string, requested: string, oldText: string, newText: string, expectedOccurrences = 1) {
    if (!oldText) throw new Error("Choose the exact existing code to replace.");
    const current = this.read(botId, projectId, requested).content;
    const occurrences = current.split(oldText).length - 1;
    if (occurrences !== expectedOccurrences) throw new Error(`Expected ${expectedOccurrences} matching code block${expectedOccurrences === 1 ? "" : "s"}, but found ${occurrences}. Read the file again before editing.`);
    return this.write(botId, projectId, requested, current.split(oldText).join(newText));
  }

  status(botId: string, projectId: string) {
    const project = this.project(botId, projectId);
    if (!project.gitRepository) return { projectId, gitRepository: false, branch: null, defaultBranch: null, remoteUrl: null, changes: [] as string[] };
    const branch = spawnSync("git", ["branch", "--show-current"], { cwd: project.rootPath, encoding: "utf8", timeout: 8_000 });
    const status = spawnSync("git", ["status", "--short"], { cwd: project.rootPath, encoding: "utf8", timeout: 8_000, maxBuffer: 300_000 });
    const changes = String(status.stdout || "").split(/\r?\n/).filter((line) => {
      if (!line) return false;
      const fileNames = line.slice(3).split(" -> ");
      return fileNames.every((fileName) => !fileName.split(/[\\/]/).some((part) => part.startsWith(".") && !SAFE_HIDDEN_DIRECTORIES.has(part)));
    }).slice(0, 200);
    return { projectId, gitRepository: true, branch: String(branch.stdout || "").trim() || null, defaultBranch: project.defaultBranch, remoteUrl: project.remoteUrl, changes };
  }

  review(botId: string, projectId: string): CodeProjectReview {
    const project = this.project(botId, projectId), state = this.status(botId, projectId);
    if (!project.gitRepository) return { projectId, gitRepository: false, branch: null, defaultBranch: null, remoteUrl: null, changes: [], diff: "", truncated: false };
    const visiblePaths = state.changes.map((line) => line.slice(3).split(" -> ").pop()?.replace(/^"|"$/g, "") || "").filter((file) => file && !file.split(/[\\/]/).some((part) => part.startsWith(".") && !SAFE_HIDDEN_DIRECTORIES.has(part))).slice(0, 120);
    if (!visiblePaths.length) return { ...state, diff: "", truncated: false };
    const unstaged = this.git(project, ["diff", "--no-ext-diff", "--unified=3", "--", ...visiblePaths]);
    const staged = this.git(project, ["diff", "--cached", "--no-ext-diff", "--unified=3", "--", ...visiblePaths]);
    const full = [staged && "Staged changes\n\n" + staged, unstaged && "Working changes\n\n" + unstaged].filter(Boolean).join("\n");
    return { ...state, diff: full.slice(0, MAX_DIFF_CHARACTERS), truncated: full.length > MAX_DIFF_CHARACTERS };
  }

  branch(botId: string, projectId: string, requested: string) {
    const project = this.project(botId, projectId, "write");
    if (!project.gitRepository) throw new Error("This project is not a Git repository.");
    const name = requested.trim();
    if (!name || name.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) || name.includes("..") || name.endsWith("/") || name.includes("//")) throw new Error("Use a short branch name such as openbot/fix-login.");
    if (this.git(project, ["status", "--porcelain"]).trim()) throw new Error("Review or commit the current changes before starting another branch.");
    this.git(project, ["check-ref-format", "--branch", name]);
    this.git(project, ["-c", "core.hooksPath=/dev/null", "switch", "-c", name]);
    return { projectId, branch: name, message: `Started branch ${name}.` };
  }

  commit(botId: string, projectId: string, requestedMessage: string, requestedPaths: string[]) {
    const project = this.project(botId, projectId, "write");
    if (!project.gitRepository) throw new Error("This project is not a Git repository.");
    const branch = this.git(project, ["branch", "--show-current"]).trim();
    if (!branch) throw new Error("Create a named branch before committing changes.");
    if (branch === (project.defaultBranch || "main") || branch === "main" || branch === "master") throw new Error("Create a separate OpenBot branch before committing changes.");
    const message = requestedMessage.trim().replace(/[\r\n]+/g, " ");
    if (!message || message.length > 120) throw new Error("Use a clear commit message up to 120 characters.");
    const paths = [...new Set(requestedPaths)].slice(0, 50).map((item) => this.resolveFile(project, item, true).relative).filter((item) => item !== ".");
    if (!paths.length) throw new Error("Name the exact changed files to include in this commit.");
    this.git(project, ["add", "--", ...paths]);
    const selected = this.git(project, ["diff", "--cached", "--name-only", "--", ...paths]).trim();
    if (!selected) throw new Error("Those files do not contain changes to commit.");
    this.git(project, ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", `user.name=OpenBot ${this.db.getBot(botId)?.name || "Agent"}`, "-c", "user.email=openbot@localhost", "commit", "--only", "--no-verify", "-m", message, "--", ...paths], 30_000);
    const commit = this.git(project, ["rev-parse", "--short", "HEAD"]).trim();
    return { projectId, branch, commit, files: selected.split(/\r?\n/).filter(Boolean), message };
  }

  preparePublish(botId: string, projectId: string, requestedBase?: string) {
    const project = this.project(botId, projectId, "write");
    if (!project.gitRepository || !project.remoteUrl) throw new Error("Connect a GitHub repository before publishing a pull request.");
    const repository = parseGitHubRepository(project.remoteUrl), branch = this.git(project, ["branch", "--show-current"]).trim();
    const base = (requestedBase || project.defaultBranch || "main").trim();
    if (!branch || branch === base) throw new Error("Create and commit on a separate branch before publishing.");
    if (this.git(project, ["status", "--porcelain"]).trim()) throw new Error("Commit or restore every current change before publishing.");
    this.git(project, ["rev-parse", "--verify", "HEAD"]);
    return { project, repository, branch, base };
  }

  async publishPullRequest(botId: string, projectId: string, input: { title: string; body: string; base?: string; draft?: boolean }) {
    const prepared = this.preparePublish(botId, projectId, input.base), title = input.title.trim(), body = input.body.trim();
    if (!title || title.length > 160 || !body || body.length > 10_000) throw new Error("Give the pull request a clear title and review summary.");
    const repo = `${prepared.repository.owner}/${prepared.repository.name}`;
    await this.command("gh", ["auth", "status", "--hostname", "github.com"], { cwd: prepared.project.rootPath, timeout: 15_000 });
    await this.command("git", ["-c", "core.hooksPath=/dev/null", "push", "--no-verify", "--set-upstream", "origin", prepared.branch], { cwd: prepared.project.rootPath, timeout: 120_000 });
    try {
      const existing = await this.command("gh", ["pr", "view", prepared.branch, "--repo", repo, "--json", "url"], { cwd: prepared.project.rootPath, timeout: 20_000 });
      const url = (JSON.parse(existing.stdout) as { url?: string }).url;
      if (url) return { projectId, branch: prepared.branch, url, existing: true };
    } catch { /* No pull request exists for this branch yet. */ }
    const args = ["pr", "create", "--repo", repo, "--base", prepared.base, "--head", prepared.branch, "--title", title, "--body", body];
    if (input.draft) args.push("--draft");
    const created = await this.command("gh", args, { cwd: prepared.project.rootPath, timeout: 60_000 });
    const url = created.stdout.split(/\r?\n/).find((line) => /^https:\/\/github\.com\//.test(line.trim()))?.trim();
    if (!url) throw new Error("GitHub created the pull request but did not return its link.");
    return { projectId, branch: prepared.branch, url, existing: false };
  }

  restoreEdit(editId: string) {
    const edit = this.db.getCodeProjectEdit(editId);
    if (!edit || !edit.reversible) throw new Error("That restore point is no longer available.");
    const project = this.db.getCodeProject(edit.projectId);
    if (!project) throw new Error("Reconnect that project before restoring its file.");
    const file = this.resolveFile(project, edit.path);
    if (!statSync(file.target).isFile() || contentHash(readFileSync(file.target)) !== edit.afterHash) throw new Error("That file changed again, so OpenBot left the newer work untouched.");
    if (edit.operation === "created") unlinkSync(file.target);
    else {
      const temporary = path.join(path.dirname(file.target), `.openbot-restore-${randomUUID()}`), mode = statSync(file.target).mode;
      try { writeFileSync(temporary, edit.beforeContent ?? "", "utf8"); chmodSync(temporary, mode); renameSync(temporary, file.target); }
      finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    this.db.markCodeProjectEditRestored(edit.id);
    return { editId, projectId: edit.projectId, path: edit.path, restored: true };
  }
}
