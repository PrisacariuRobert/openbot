import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitHubConnector } from "./github.js";
import { githubWriteHost, GitHubWriteUncertainError, withPinnedGitHubWriteIdentity, type GitHubWriteDependencies, type PinnedGitHubWriter } from "./github-write-identity.js";

const identity = { host: "github.com", accountLogin: "reviewed-owner" };
const secret = "synthetic-credential-not-a-real-token";
const sha = "a".repeat(40);
const target = { repository: "reviewed-owner/project", branch: "work/fix", base: "main", expectedHeadCommit: sha, expectedBaseCommit: "b".repeat(40) };
const pr = { html_url: "https://github.com/reviewed-owner/project/pull/7", number: 7, title: "Fix broken import", body: "Checked and reviewed", draft: true, head: { sha, ref: target.branch, repo: { full_name: target.repository } }, base: { sha: target.expectedBaseCommit, ref: target.base, repo: { full_name: target.repository } } };
const issue = { html_url: "https://github.com/reviewed-owner/project/issues/8", title: "Resolve import", body: "Reproduction and acceptance criteria" };
function fixture(responses: unknown[] = [], environment: NodeJS.ProcessEnv = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const commands: Array<{ file: string; args: string[]; env: NodeJS.ProcessEnv; cwd?: string }> = [];
  const dependencies: GitHubWriteDependencies = {
    environment,
    command: async (file, args, options) => {
      commands.push({ file, args: [...args], env: { ...options.env }, cwd: options.cwd });
      return { stdout: file === "gh" ? secret : args[0] === "rev-parse" ? "/synthetic/project/.git/objects\n" : "" };
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response instanceof Response ? response : Response.json(response === undefined ? { login: identity.accountLogin } : response);
    },
  };
  return { dependencies, calls, commands };
}

test("GitHub uses the reviewed account credential once for verification, issue creation and readback", async () => {
  const state = fixture([{ login: identity.accountLogin }, issue, issue]);
  const connector = new GitHubConnector(state.dependencies);
  assert.equal(await connector.createIssue(target.repository, issue.title, issue.body, identity), issue.html_url);
  assert.deepEqual(state.commands.map((row) => row.args), [["auth", "token", "--hostname", "github.com", "--user", "reviewed-owner"]]);
  assert.deepEqual(state.calls.map((row) => new URL(row.url).pathname), ["/user", "/repos/reviewed-owner/project/issues", "/repos/reviewed-owner/project/issues/8"]);
  for (const row of state.calls) { assert.equal(new Headers(row.init.headers).get("Authorization"), `Bearer ${secret}`); assert.equal(row.init.redirect, "manual"); }
  assert.equal(state.commands[0].env.GH_DEBUG, undefined);
  assert.equal(state.commands[0].env.GH_TOKEN, undefined);
});

test("GitHub configured credentials are verified without silently falling back to another account", async () => {
  const state = fixture([{ login: "different-owner" }], { GH_TOKEN: secret, GITHUB_TOKEN: "other", GH_DEBUG: "api" });
  await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.createIssue({ repository: target.repository, title: "T", body: "B" }), state.dependencies), /no longer belongs/);
  assert.equal(state.commands.length, 0);
  assert.equal(state.calls.length, 1);
  assert.equal(new Headers(state.calls[0].init.headers).get("Authorization"), `Bearer ${secret}`);
});

test("GitHub credential and host changes during execution do not change the verified session", async () => {
  const environment = { GH_TOKEN: secret, GH_HOST: "github.com" };
  const state = fixture([{ login: identity.accountLogin }, pr, pr], environment);
  await withPinnedGitHubWriteIdentity(identity, async (writer) => {
    environment.GH_TOKEN = "another-account-token"; environment.GH_HOST = "elsewhere.example";
    assert.equal((await writer.createPullRequest({ ...target, title: pr.title, body: pr.body, draft: true })).url, pr.html_url);
  }, state.dependencies);
  assert.equal(state.commands.length, 0);
  assert.equal(state.calls.length, 3);
  for (const row of state.calls) { assert.equal(new URL(row.url).hostname, "api.github.com"); assert.equal(new Headers(row.init.headers).get("Authorization"), `Bearer ${secret}`); }
});

test("GitHub enterprise never falls back to github.com or a public-host credential", async () => {
  const state = fixture([{ login: identity.accountLogin }], { GH_HOST: "git.company.example", GH_TOKEN: "wrong-cloud-token", GH_ENTERPRISE_TOKEN: secret });
  await withPinnedGitHubWriteIdentity({ ...identity, host: "git.company.example" }, async () => undefined, state.dependencies);
  assert.equal(state.calls[0].url, "https://git.company.example/api/v3/user");
  assert.equal(new Headers(state.calls[0].init.headers).get("Authorization"), `Bearer ${secret}`);
  await assert.rejects(withPinnedGitHubWriteIdentity(identity, async () => undefined, state.dependencies), /host changed/);
  assert.equal(state.calls.length, 1);
});

test("GitHub rejects unconfigured or malformed identities before credential access", async () => {
  for (const invalid of [{ ...identity, host: "other.example" }, { ...identity, accountLogin: "--bad" }, { ...identity, accountLogin: "owner\nother" }]) {
    const state = fixture();
    await assert.rejects(withPinnedGitHubWriteIdentity(invalid, async () => undefined, state.dependencies));
    assert.equal(state.calls.length + state.commands.length, 0);
  }
  for (const host of ["https://github.com", "github.com/path", "127.0.0.1", "localhost", "github.com@evil.example", "git.local"]) assert.throws(() => githubWriteHost({ GH_HOST: host }));
});

test("GitHub cannot follow credential-bearing redirects or reuse an expired writer", async () => {
  const state = fixture([new Response(null, { status: 302, headers: { Location: "https://other.example/user" } })]);
  await assert.rejects(withPinnedGitHubWriteIdentity(identity, async () => undefined, state.dependencies), /redirected/);
  assert.equal(state.calls.length, 1);
  const clean = fixture(); let expired: PinnedGitHubWriter | undefined;
  await withPinnedGitHubWriteIdentity(identity, async (writer) => { expired = writer; }, clean.dependencies);
  await assert.rejects(expired!.createIssue({ repository: target.repository, title: "T", body: "B" }), /session has ended/);
  assert.equal(clean.calls.length, 1);
});

test("GitHub credential acquisition errors and API bodies never appear in returned errors", async () => {
  const state = fixture();
  state.dependencies.command = async () => { throw new Error(`Credential failure ${secret}`); };
  await assert.rejects(withPinnedGitHubWriteIdentity(identity, async () => undefined, state.dependencies), (error: Error) => !error.message.includes(secret) && !error.cause);
  const denied = fixture([{ login: identity.accountLogin }, new Response(`leaked ${secret}`, { status: 403 })]);
  await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.createIssue({ repository: target.repository, title: "T", body: "B" }), denied.dependencies), (error: Error) => !error.message.includes(secret) && !error.cause);
});

test("GitHub uncertain writes and missing readbacks are never repeated or claimed delivered", async () => {
  for (const response of [new Error(`lost ${secret}`), new Response("down", { status: 502 }), new Response("broken", { status: 201 }), { html_url: "https://elsewhere.example/issue/8" }]) {
    const state = fixture([{ login: identity.accountLogin }, response]);
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.createIssue({ repository: target.repository, title: issue.title, body: issue.body }), state.dependencies), GitHubWriteUncertainError);
    assert.equal(state.calls.filter((row) => row.init.method === "POST").length, 1);
  }
  const state = fixture([{ login: identity.accountLogin }, issue, new Error("lost readback")]);
  await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.createIssue({ repository: target.repository, title: issue.title, body: issue.body }), state.dependencies), GitHubWriteUncertainError);
  assert.equal(state.calls.filter((row) => row.init.method === "POST").length, 1);
});

test("GitHub pull request creation verifies the exact reviewed commit and complete readback", async () => {
  for (const changed of [{ ...pr, head: { ...pr.head, sha: "b".repeat(40) } }, { ...pr, base: { ...pr.base, sha: "c".repeat(40) } }, { ...pr, base: { ...pr.base, ref: "production" } }, { ...pr, title: "Changed" }, { ...pr, body: "Changed" }, { ...pr, draft: false }, { ...pr, html_url: "https://github.com/other/project/pull/7" }]) {
    const state = fixture([{ login: identity.accountLogin }, pr, changed]);
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.createPullRequest({ ...target, title: pr.title, body: pr.body, draft: true }), state.dependencies), GitHubWriteUncertainError);
    assert.equal(state.calls.filter((row) => row.init.method === "POST").length, 1);
  }
});

test("GitHub pull request lookup returns null only after a successful empty result", async () => {
  const empty = fixture([{ login: identity.accountLogin }, []]);
  assert.equal(await withPinnedGitHubWriteIdentity(identity, (writer) => writer.findPullRequest(target), empty.dependencies), null);
  for (const bad of [new Error("offline"), new Response("denied", { status: 403 }), {}, [pr, pr]]) {
    const state = fixture([{ login: identity.accountLogin }, bad]);
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.findPullRequest(target), state.dependencies));
    assert.equal(state.calls.filter((row) => row.init.method === "POST").length, 0);
  }
});

test("GitHub branch verification requires the exact branch and an immutable commit", async () => {
  const state = fixture([{ login: identity.accountLogin }, { ref: "refs/heads/main", object: { type: "commit", sha } }]);
  assert.equal(await withPinnedGitHubWriteIdentity(identity, (writer) => writer.readBranchCommit({ repository: target.repository, branch: "main" }), state.dependencies), sha);
  for (const row of [{ ref: "refs/heads/other", object: { type: "commit", sha } }, { ref: "refs/heads/main", object: { type: "tag", sha } }, { ref: "refs/heads/main", object: { type: "commit", sha: "HEAD" } }]) {
    const invalid = fixture([{ login: identity.accountLogin }, row]);
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.readBranchCommit({ repository: target.repository, branch: "main" }), invalid.dependencies));
  }
});

test("GitHub repository permission check requires the exact active repository and write access", async () => {
  const repository = { full_name: target.repository, html_url: `https://github.com/${target.repository}`, archived: false, disabled: false, permissions: { push: true } };
  const good = fixture([{ login: identity.accountLogin }, repository]);
  await withPinnedGitHubWriteIdentity(identity, (writer) => writer.assertRepositoryWriteAccess({ repository: target.repository }), good.dependencies);
  for (const invalid of [{ ...repository, permissions: { push: false } }, { ...repository, permissions: {} }, { ...repository, archived: true }, { ...repository, disabled: true }, { ...repository, full_name: "other/project" }, { ...repository, html_url: `https://elsewhere.example/${target.repository}` }]) {
    const state = fixture([{ login: identity.accountLogin }, invalid]);
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.assertRepositoryWriteAccess({ repository: target.repository }), state.dependencies), /cannot publish/);
    assert.equal(state.calls.filter((row) => row.init.method === "POST").length, 0);
  }
});

test("GitHub branch uploads isolate repository config and keep credentials out of argv and disk", async () => {
  const state = fixture([{ login: identity.accountLogin }], { GH_TOKEN: secret, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "url.evil.insteadOf", GIT_CONFIG_VALUE_0: "https://github.com", GH_DEBUG: "api", SSH_AUTH_SOCK: "/fake/socket" });
  await withPinnedGitHubWriteIdentity(identity, (writer) => writer.pushCommit({ cwd: "/synthetic/project", repository: target.repository, commit: sha, branch: target.branch }), state.dependencies);
  const push = state.commands.find((row) => row.args.includes("push"))!;
  assert.ok(push);
  assert.ok(push.args.includes(`https://github.com/${target.repository}.git`));
  assert.ok(push.args.includes(`${sha}:refs/heads/${target.branch}`));
  assert.ok(push.args.includes(`--force-with-lease=refs/heads/${target.branch}:`));
  assert.equal(push.cwd, undefined);
  assert.equal(push.env.GIT_CONFIG_GLOBAL, "/dev/null");
  assert.equal(push.env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(push.env.GH_TOKEN, undefined);
  assert.equal(push.env.GH_DEBUG, undefined);
  assert.equal(push.env.SSH_AUTH_SOCK, undefined);
  assert.equal(push.env.GIT_OBJECT_DIRECTORY, "/synthetic/project/.git/objects");
  const settings = Object.fromEntries(Array.from({ length: Number(push.env.GIT_CONFIG_COUNT) }, (_, index) => [push.env[`GIT_CONFIG_KEY_${index}`], push.env[`GIT_CONFIG_VALUE_${index}`]]));
  assert.equal(settings["http.followRedirects"], "false");
  assert.equal(settings["credential.helper"], "");
  assert.equal(settings["http.https://github.com/.extraHeader"], `Authorization: Basic ${Buffer.from(`x-access-token:${secret}`).toString("base64")}`);
  const temporary = push.args[1];
  assert.equal(existsSync(temporary), false);
  assert.equal(state.commands.some((row) => JSON.stringify(row.args).includes(secret)), false);
});

test("GitHub isolated Git publication uploads the intended object and cannot overwrite a branch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openbot-github-identity-test-"));
  const project = path.join(root, "project with spaces"), remote = path.join(root, "synthetic-remote.git");
  const exec = promisify(execFile);
  const localEnv = { ...process.env, HOME: root, XDG_CONFIG_HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull };
  try {
    await exec("git", ["init", "--initial-branch=main", project], { env: localEnv });
    await exec("git", ["init", "--bare", remote], { env: localEnv });
    await writeFile(path.join(project, "proof.txt"), "Only the checked object should be delivered.\n");
    await exec("git", ["add", "proof.txt"], { cwd: project, env: localEnv });
    await exec("git", ["-c", "user.name=Synthetic tester", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Synthetic checked work"], { cwd: project, env: localEnv });
    const commit = (await exec("git", ["rev-parse", "HEAD"], { cwd: project, env: localEnv })).stdout.trim();
    // A project-controlled rewrite must not influence the isolated publication.
    await exec("git", ["config", "url.ssh://wrong.example/.insteadOf", remote], { cwd: project, env: localEnv });
    const state = fixture([], { GH_TOKEN: secret });
    state.dependencies.command = async (file, args, options) => {
      assert.equal(file, "git");
      if (args.includes("push")) {
        assert.equal(args.filter((arg) => arg.startsWith("https://")).length, 1);
        // Only this synthetic transport redirects to a local test remote. The
        // production helper permits HTTPS exclusively; there is no real write.
        const rewritten = ["-c", "protocol.file.allow=always", ...args.map((arg) => arg === `https://github.com/${target.repository}.git` ? remote : arg)];
        return exec(file, rewritten, { ...options, encoding: "utf8" });
      }
      return exec(file, args, { ...options, encoding: "utf8" });
    };
    await withPinnedGitHubWriteIdentity(identity, (writer) => writer.pushCommit({ cwd: project, repository: target.repository, commit, branch: target.branch }), state.dependencies);
    assert.equal((await exec("git", ["--git-dir", remote, "rev-parse", `refs/heads/${target.branch}`], { env: localEnv })).stdout.trim(), commit);
    await writeFile(path.join(project, "proof.txt"), "Another commit must not replace the published branch.\n");
    await exec("git", ["-c", "user.name=Synthetic tester", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "commit", "-am", "Another checked object"], { cwd: project, env: localEnv });
    const another = (await exec("git", ["rev-parse", "HEAD"], { cwd: project, env: localEnv })).stdout.trim();
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.pushCommit({ cwd: project, repository: target.repository, commit: another, branch: target.branch }), state.dependencies), GitHubWriteUncertainError);
    assert.equal((await exec("git", ["--git-dir", remote, "rev-parse", `refs/heads/${target.branch}`], { env: localEnv })).stdout.trim(), commit);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("GitHub rejects arbitrary repository, commit and branch injection without a write", async () => {
  for (const input of [{ repository: "other.example/owner/repo", branch: "fix", commit: sha }, { repository: target.repository, branch: "--all", commit: sha }, { repository: target.repository, branch: "good:evil", commit: sha }, { repository: target.repository, branch: "fix", commit: "HEAD" }]) {
    const state = fixture();
    await assert.rejects(withPinnedGitHubWriteIdentity(identity, (writer) => writer.pushCommit({ cwd: "/synthetic/project", ...input }), state.dependencies));
    assert.equal(state.commands.some((row) => row.file === "git"), false);
    assert.equal(state.calls.filter((row) => row.init.method === "POST").length, 0);
  }
});
