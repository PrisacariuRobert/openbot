import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import type { GitHubConnectorStatus, GitHubIssueSummary, GitHubNotificationSummary } from "../shared/types.js";

const execFileAsync = promisify(execFile);
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type GitHubApiIssue = {
  id?: number;
  number?: number;
  repository_url?: string;
  html_url?: string;
  title?: string;
  state?: "open" | "closed";
  user?: { login?: string };
  labels?: Array<{ name?: string }>;
  updated_at?: string;
};

type GitHubApiNotification = {
  id?: string;
  repository?: { full_name?: string };
  subject?: { title?: string; type?: string; url?: string | null };
  reason?: string;
  unread?: boolean;
  updated_at?: string;
};

function repositoryFromApiUrl(value = ""): string {
  return value.match(/\/repos\/([^/]+\/[^/]+)/)?.[1] || "Unknown repository";
}

export function githubWebUrl(apiUrl: string | null | undefined): string | null {
  if (!apiUrl) return null;
  const match = apiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(issues|pulls|releases)\/(.+)$/);
  if (!match) return null;
  const [, owner, repository, kind, rest] = match;
  return `https://github.com/${owner}/${repository}/${kind === "pulls" ? "pull" : kind}/${rest}`;
}

function friendlyError(error: unknown): string {
  const value = error as { stderr?: string; message?: string };
  const text = String(value.stderr || value.message || error).replace(/\b(?:gh[opurs]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, "[private token]").trim();
  if (/auth login|not logged into/i.test(text)) return "GitHub needs a quick sign-in.";
  return text.split("\n").filter(Boolean).at(-1)?.slice(0, 300) || "GitHub could not be reached.";
}

export class GitHubConnector {
  private connectingUntil = 0;
  private cachedStatus: GitHubConnectorStatus | null = null;
  private cachedAt = 0;

  status(force = false): GitHubConnectorStatus {
    const cacheFor = this.cachedStatus?.connected ? 10_000 : 2_000;
    if (!force && this.cachedStatus && Date.now() - this.cachedAt < cacheFor) return this.cachedStatus;
    const user = spawnSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", timeout: 5_000 });
    if ((user.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return this.remember({ installed: false, connected: false, connecting: false, accountLogin: null, lastError: "Install GitHub CLI to connect your account." });
    return this.remember({ installed: true, connected: user.status === 0, connecting: user.status !== 0 && Date.now() < this.connectingUntil, accountLogin: user.status === 0 ? user.stdout.trim() || null : null, lastError: user.status === 0 || Date.now() < this.connectingUntil ? null : friendlyError(user.stderr) });
  }

  private remember(status: GitHubConnectorStatus): GitHubConnectorStatus {
    this.cachedStatus = status; this.cachedAt = Date.now(); return status;
  }

  beginLogin(): GitHubConnectorStatus {
    const current = this.status(true);
    if (!current.installed || current.connected) return current;
    const child = spawn("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard"], { detached: true, stdio: "ignore" });
    child.unref();
    this.connectingUntil = Date.now() + 10 * 60_000;
    return this.remember({ ...current, connecting: true, lastError: null });
  }

  private async json<T>(args: string[]): Promise<T> {
    try {
      const result = await execFileAsync("gh", args, { encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 });
      return JSON.parse(result.stdout) as T;
    } catch (error) { throw new Error(friendlyError(error)); }
  }

  async notifications(maxResults = 12): Promise<GitHubNotificationSummary[]> {
    const limit = Math.max(1, Math.min(Math.round(maxResults), 50));
    const rows = await this.json<GitHubApiNotification[]>(["api", "-X", "GET", "notifications", "-f", "all=true", "-f", `per_page=${limit}`]);
    return rows.map((item) => ({
      id: String(item.id || ""), repository: item.repository?.full_name || "Unknown repository", title: item.subject?.title || "GitHub update",
      type: item.subject?.type || "Update", reason: item.reason || "activity", unread: Boolean(item.unread), updatedAt: item.updated_at || new Date(0).toISOString(), url: githubWebUrl(item.subject?.url),
    }));
  }

  async issues(query = "", maxResults = 12): Promise<GitHubIssueSummary[]> {
    const limit = Math.max(1, Math.min(Math.round(maxResults), 50));
    const focusedQuery = `${query.trim().slice(0, 300)} is:issue ${query.trim() ? "" : "involves:@me state:open"}`.trim();
    const payload = await this.json<{ items?: GitHubApiIssue[] }>(["api", "-X", "GET", "search/issues", "-f", `q=${focusedQuery}`, "-f", `per_page=${limit}`]);
    return (payload.items || []).map((item) => ({
      id: String(item.id || item.number || ""), number: Number(item.number || 0), repository: repositoryFromApiUrl(item.repository_url), title: item.title || "Untitled issue",
      state: item.state || "open", author: item.user?.login || null, labels: (item.labels || []).map((label) => label.name || "").filter(Boolean), updatedAt: item.updated_at || new Date(0).toISOString(), url: item.html_url || "https://github.com/issues",
    }));
  }

  async createIssue(repository: string, title: string, body: string): Promise<string> {
    if (!REPOSITORY.test(repository)) throw new Error("Choose a repository as owner/name.");
    try {
      const result = await execFileAsync("gh", ["issue", "create", "--repo", repository, "--title", title, "--body", body], { encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000 });
      const url = result.stdout.trim().split("\n").find((line) => line.startsWith("https://github.com/"));
      if (!url) throw new Error("GitHub did not return the new issue link.");
      return url;
    } catch (error) { throw new Error(friendlyError(error)); }
  }
}
