import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { safeHostEnvironment } from "./runtime.js";

const execFileAsync = promisify(execFile);
const REPOSITORY = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

export interface GitHubWriteIdentity { host: string; accountLogin: string }
type Command = (command: string, args: string[], options: { cwd?: string; env: NodeJS.ProcessEnv; timeout: number }) => Promise<{ stdout: string }>;
export interface GitHubWriteDependencies { environment?: NodeJS.ProcessEnv; command?: Command; fetch?: typeof fetch }
type PullRequestTarget = { repository: string; branch: string; base: string; expectedHeadCommit: string; expectedBaseCommit: string };
export interface PinnedGitHubWriter {
  createIssue(input: { repository: string; title: string; body: string }): Promise<{ url: string }>;
  pushCommit(input: { cwd: string; repository: string; commit: string; branch: string }): Promise<void>;
  readBranchCommit(input: { repository: string; branch: string }): Promise<string>;
  assertRepositoryWriteAccess(input: { repository: string }): Promise<void>;
  findPullRequest(input: PullRequestTarget): Promise<{ url: string } | null>;
  createPullRequest(input: PullRequestTarget & { title: string; body: string; draft?: boolean }): Promise<{ url: string; verified: true }>;
}

/** A failed write may already have reached GitHub. Never automatically replay it. */
export class GitHubWriteUncertainError extends Error {
  constructor(message = "GitHub did not confirm the result. Check the repository before trying this action again.") { super(message); this.name = "GitHubWriteUncertainError"; }
}

/** Only server configuration selects an enterprise host; approvals cannot redirect it. */
export function githubWriteHost(source: NodeJS.ProcessEnv = process.env): string {
  const host = (source.GH_HOST || "github.com").trim().toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host) || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Choose a valid GitHub hostname in the server configuration.");
  return host;
}

function checkedRepository(repository: string): string {
  if (!REPOSITORY.test(repository) || repository.split("/").some((segment) => segment.endsWith("."))) throw new Error("Choose a repository as owner/name.");
  return repository;
}

function checkedBranch(branch: string): string {
  if (!branch || branch.length > 240 || branch === "@" || /[\s~^:?*\[\\\u0000-\u001f\u007f]/.test(branch) || branch.startsWith("-") || branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".") || branch.includes("..") || branch.includes("@{") || branch.includes("//") || branch.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"))) throw new Error("Choose a valid Git branch.");
  return branch;
}

/**
 * The credential exists only in this server-side closure and child environment.
 * It is verified once and reused for every operation; callers never receive it.
 * CLI account selection and response/error bodies cannot leak into model output.
 */
export async function withPinnedGitHubWriteIdentity<T>(expected: GitHubWriteIdentity, perform: (writer: PinnedGitHubWriter) => Promise<T>, dependencies: GitHubWriteDependencies = {}): Promise<T> {
  const source = { ...(dependencies.environment || process.env) };
  const host = githubWriteHost(source);
  if (!expected || expected.host !== host || !LOGIN.test(expected.accountLogin)) throw new Error("The GitHub account or host changed. Review this action again.");
  const accountLogin = expected.accountLogin;
  const command: Command = dependencies.command || (async (file, args, options) => execFileAsync(file, args, { ...options, encoding: "utf8", maxBuffer: 1_000_000 }));
  const transport = dependencies.fetch || fetch;
  const env = safeHostEnvironment({ GH_HOST: host, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_NO_EXTENSION_UPDATE_NOTIFIER: "1", GH_TELEMETRY: "false", GIT_TERMINAL_PROMPT: "0" }, source);
  if (source.GH_CONFIG_DIR) env.GH_CONFIG_DIR = source.GH_CONFIG_DIR;
  const isCloud = host === "github.com" || host.endsWith(".ghe.com");
  let token = (isCloud ? source.GH_TOKEN || source.GITHUB_TOKEN : source.GH_ENTERPRISE_TOKEN || source.GITHUB_ENTERPRISE_TOKEN)?.trim() || "";
  // Discard the snapshot's credentials immediately; never serialize it or attach it to errors.
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) delete source[key];
  if (!token) {
    try { token = (await command("gh", ["auth", "token", "--hostname", host, "--user", accountLogin], { env, timeout: 10_000 })).stdout.trim(); }
    catch { throw new Error("The reviewed GitHub account needs to sign in again."); }
  }
  if (!token || /[\s\u0000-\u001f\u007f]/.test(token)) throw new Error("The reviewed GitHub account needs to sign in again.");
  const apiBase = host === "github.com" ? "https://api.github.com" : host.endsWith(".ghe.com") ? `https://api.${host}` : `https://${host}/api/v3`;
  let active = true;
  function assertActive() { if (!active) throw new Error("This GitHub approval session has ended. Review the action again."); }
  async function request(endpoint: string, body?: unknown): Promise<unknown> {
    assertActive();
    let response: Response;
    try {
      response = await transport(`${apiBase}${endpoint}`, { method: body === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "OpenBot" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw body === undefined ? new Error("GitHub could not verify this request.") : new GitHubWriteUncertainError(); }
    if (!response.ok) {
      if (body !== undefined && (response.status >= 500 || (response.status >= 300 && response.status < 400))) throw new GitHubWriteUncertainError();
      throw new Error(response.status >= 300 && response.status < 400 ? "GitHub redirected this request. Reconnect the correct account and repository before retrying." : "GitHub declined this request. Check the account's access before trying again.");
    }
    try { return await response.json(); } catch { throw body === undefined ? new Error("GitHub returned an unreadable response.") : new GitHubWriteUncertainError(); }
  }
  function link(payload: unknown, repository: string, kind: "issues" | "pull", uncertain: boolean): { url: string } {
    const url = payload && typeof payload === "object" && "html_url" in payload ? payload.html_url : undefined;
    const prefix = `https://${host}/${repository}/${kind}/`;
    if (typeof url !== "string" || !url.toLowerCase().startsWith(prefix.toLowerCase()) || !/^\d+$/.test(url.slice(prefix.length))) throw uncertain ? new GitHubWriteUncertainError() : new Error("GitHub did not return a matching repository link.");
    return { url };
  }
  function pullRequest(payload: unknown, target: PullRequestTarget, uncertain: boolean): { url: string; number: number } {
    const result = link(payload, target.repository, "pull", uncertain);
    const row = payload as { number?: unknown; head?: { sha?: unknown; ref?: unknown; repo?: { full_name?: unknown } }; base?: { sha?: unknown; ref?: unknown; repo?: { full_name?: unknown } } };
    if (!COMMIT.test(target.expectedHeadCommit) || !COMMIT.test(target.expectedBaseCommit) || row.head?.sha !== target.expectedHeadCommit || row.head?.ref !== target.branch || row.base?.sha !== target.expectedBaseCommit || row.base?.ref !== target.base || typeof row.head?.repo?.full_name !== "string" || row.head.repo.full_name.toLowerCase() !== target.repository.toLowerCase() || typeof row.base?.repo?.full_name !== "string" || row.base.repo.full_name.toLowerCase() !== target.repository.toLowerCase() || typeof row.number !== "number" || !Number.isSafeInteger(row.number) || row.number < 1 || !result.url.endsWith(`/${row.number}`)) throw uncertain ? new GitHubWriteUncertainError() : new Error("The GitHub pull request no longer matches the reviewed code and branches.");
    return { ...result, number: row.number };
  }
  try {
    const user = await request("/user") as { login?: unknown } | null;
    if (!user || typeof user.login !== "string" || user.login.toLowerCase() !== accountLogin.toLowerCase()) throw new Error("The GitHub credential no longer belongs to the reviewed account. Review this action again.");
    const writer = Object.freeze<PinnedGitHubWriter>({
      async assertRepositoryWriteAccess(input) {
        const repository = checkedRepository(input.repository);
        const row = await request(`/repos/${repository}`) as { full_name?: unknown; html_url?: unknown; archived?: unknown; disabled?: unknown; permissions?: { push?: unknown } } | null;
        if (!row || typeof row.full_name !== "string" || row.full_name.toLowerCase() !== repository.toLowerCase() || typeof row.html_url !== "string" || row.html_url.toLowerCase() !== `https://${host}/${repository}`.toLowerCase() || row.archived !== false || row.disabled !== false || row.permissions?.push !== true) throw new Error("The reviewed GitHub account cannot publish to this repository. Check its write access and request a fresh review.");
      },
      async createIssue(input) {
        const repository = checkedRepository(input.repository), title = input.title, body = input.body;
        const result = link(await request(`/repos/${repository}/issues`, { title, body }), repository, "issues", true);
        try {
          const confirmation = await request(`/repos/${repository}/issues/${result.url.split("/").at(-1)}`) as { title?: unknown; body?: unknown };
          if (link(confirmation, repository, "issues", false).url !== result.url || confirmation.title !== title || confirmation.body !== body) throw new Error("Mismatch");
        } catch { throw new GitHubWriteUncertainError(); }
        return result;
      },
      async readBranchCommit(input) {
        const repository = checkedRepository(input.repository), branch = checkedBranch(input.branch);
        const row = await request(`/repos/${repository}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`) as { ref?: unknown; object?: { type?: unknown; sha?: unknown } } | null;
        if (!row || row.ref !== `refs/heads/${branch}` || row.object?.type !== "commit" || typeof row.object.sha !== "string" || !COMMIT.test(row.object.sha)) throw new Error("GitHub could not confirm the repository branch.");
        return row.object.sha;
      },
      async findPullRequest(input) {
        const repository = checkedRepository(input.repository), branch = checkedBranch(input.branch), base = checkedBranch(input.base);
        // A PR targeting a different base is still an existing destination for
        // this branch. Never silently update it when uploading approved work.
        const query = new URLSearchParams({ state: "open", head: `${repository.split("/")[0]}:${branch}`, per_page: "2" });
        const rows = await request(`/repos/${repository}/pulls?${query}`);
        if (!Array.isArray(rows)) throw new Error("GitHub returned an unreadable pull request list.");
        if (!rows.length) return null;
        if (rows.length !== 1) throw new Error("More than one pull request matches this branch. Check the repository before publishing.");
        return { url: pullRequest(rows[0], { ...input, repository, branch, base }, false).url };
      },
      async createPullRequest(input) {
        const repository = checkedRepository(input.repository), branch = checkedBranch(input.branch), base = checkedBranch(input.base);
        const target = { repository, branch, base, expectedHeadCommit: input.expectedHeadCommit, expectedBaseCommit: input.expectedBaseCommit }, title = input.title, body = input.body, draft = input.draft === true;
        if (!COMMIT.test(target.expectedHeadCommit) || !COMMIT.test(target.expectedBaseCommit)) throw new Error("Publishing needs the exact reviewed commit and base.");
        const created = pullRequest(await request(`/repos/${repository}/pulls`, { title, body, head: branch, base, draft }), target, true);
        try {
          const confirmation = await request(`/repos/${repository}/pulls/${created.number}`) as { title?: unknown; body?: unknown; draft?: unknown };
          if (pullRequest(confirmation, target, false).url !== created.url || confirmation.title !== title || confirmation.body !== body || confirmation.draft !== draft) throw new Error("Mismatch");
        } catch { throw new GitHubWriteUncertainError(); }
        return { url: created.url, verified: true };
      },
      async pushCommit(input) {
        assertActive();
        const repository = checkedRepository(input.repository), branch = checkedBranch(input.branch);
        if (!COMMIT.test(input.commit) || !path.isAbsolute(input.cwd)) throw new Error("Publishing needs an exact checked commit and project folder.");
        // Publish from a throwaway bare repository using the source object store.
        // This avoids project/global URL rewrites, credential helpers and hooks.
        // Neither the credential nor an authenticated URL is ever written to disk.
        const temporary = await mkdtemp(path.join(os.tmpdir(), "openbot-github-publish-"));
        const gitEnv = safeHostEnvironment({ HOME: temporary, XDG_CONFIG_HOME: temporary, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull, GIT_TERMINAL_PROMPT: "0" }, source);
        delete gitEnv.SSH_AUTH_SOCK;
        try {
          const objects = (await command("git", ["rev-parse", "--path-format=absolute", "--git-path", "objects"], { cwd: input.cwd, env: gitEnv, timeout: 10_000 })).stdout.trim();
          if (!path.isAbsolute(objects) || /[\r\n\u0000]/.test(objects)) throw new Error("The project object store could not be verified.");
          await command("git", ["init", "--bare", "--template=", temporary], { env: gitEnv, timeout: 10_000 });
          const settings = [["core.hooksPath", os.devNull], ["credential.helper", ""], ["http.followRedirects", "false"], ["http.sslVerify", "true"], ["protocol.allow", "never"], ["protocol.https.allow", "always"], [`http.https://${host}/.extraHeader`, `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`]];
          gitEnv.GIT_CONFIG_COUNT = String(settings.length);
          for (const [index, [key, value]] of settings.entries()) { gitEnv[`GIT_CONFIG_KEY_${index}`] = key; gitEnv[`GIT_CONFIG_VALUE_${index}`] = value; }
          gitEnv.GIT_OBJECT_DIRECTORY = objects;
          assertActive();
          try { await command("git", ["--git-dir", temporary, "push", "--no-verify", "--no-follow-tags", "--recurse-submodules=no", `--force-with-lease=refs/heads/${branch}:`, `https://${host}/${repository}.git`, `${input.commit}:refs/heads/${branch}`], { env: gitEnv, timeout: 120_000 }); }
          catch { throw new GitHubWriteUncertainError("GitHub did not confirm the branch upload. Check the repository before trying to publish again."); }
        } catch (error) {
          if (error instanceof GitHubWriteUncertainError) throw error;
          throw new Error("The checked project could not be prepared for GitHub publishing.");
        } finally {
          for (const key of Object.keys(gitEnv)) if (key.startsWith("GIT_CONFIG_VALUE_")) delete gitEnv[key];
          await rm(temporary, { recursive: true, force: true });
        }
      },
    });
    return await perform(writer);
  } finally { active = false; token = ""; }
}
