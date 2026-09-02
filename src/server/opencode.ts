import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Bot, Run } from "../shared/types.js";
import { OpenBotDatabase } from "./database.js";
import { safeHostEnvironment } from "./runtime.js";
import { connectedAppsText, prepareWorkspace } from "./workspace.js";
import { modelAttachmentFiles, type AttachmentService } from "./attachments.js";

const CLAUDE_MCP_PATH = fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url));

export function eventText(event: Record<string, unknown>): string | null {
  const part = event.part as Record<string, unknown> | undefined;
  if (typeof event.text === "string") return event.text;
  if (part && typeof part.text === "string" && (part.type === "text" || event.type === "text")) return part.text;
  if (typeof event.content === "string" && event.type === "text") return event.content;
  const message = event.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (event.type === "assistant" && Array.isArray(content)) {
    const text = content.map((item) => item as Record<string, unknown>).filter((item) => item.type === "text" && typeof item.text === "string").map((item) => String(item.text)).join("\n\n");
    return text || null;
  }
  if (event.type === "result" && typeof event.result === "string") return event.result;
  return null;
}

export function appendModelText(current: string, next: string): string {
  if (!current) return next;
  if (!next || /\s$/.test(current) || /^\s/.test(next)) return current + next;
  if (/[.!?:;”")\]]$/.test(current) && /^[A-Z0-9“"'(]/.test(next)) return `${current}\n\n${next}`;
  return current + next;
}

function eventSessionId(event: Record<string, unknown>): string | null {
  if (typeof event.sessionID === "string") return event.sessionID;
  if (typeof event.sessionId === "string") return event.sessionId;
  if (typeof event.session_id === "string") return event.session_id;
  const session = event.session as Record<string, unknown> | undefined;
  return session && typeof session.id === "string" ? session.id : null;
}

type ToolActivity = { label: string; detail: string | null; kind: "tool" | "handoff" };

function friendlyToolActivity(rawName: string, title: string | null): ToolActivity {
  const name = rawName.replace(/^mcp__openbot__/, "");
  const labels: Record<string, string> = {
    workspace_list: "Checking my files", workspace_read: "Reading the file", workspace_write: "Saving your file",
    workspace_replace: "Updating the file", isolated_bash: "Working in my workspace", bash: "Working in my workspace",
    browser_open: "Opening the website", browser_snapshot: "Reading the page", browser_click: "Using the page",
    browser_type: "Filling in the page", remember: "Remembering this for next time", handoff: "Asking a teammate to help",
    mac_list: "Looking through your Mac files", mac_read: "Reading the Mac file", mac_organize: "Preparing a tidy-up for your approval",
    mac_apps_list: "Seeing which Mac apps are open", mac_app_inspect: "Reading the app", mac_app_open: "Opening the app",
    mac_app_click: "Preparing a click for your approval", mac_app_type: "Preparing text entry for your approval", mac_app_key: "Preparing a key press for your approval", mac_app_scroll: "Moving through the app",
    gmail_search: "Looking through your inbox", gmail_read: "Reading the email", gmail_send: "Preparing the email for your approval",
    google_drive_search: "Looking through your Drive", google_drive_read: "Reading the Drive file", google_calendar_agenda: "Checking your calendar",
    github_notifications: "Checking your GitHub updates", github_issues: "Looking through GitHub issues", github_issue_create: "Preparing a GitHub issue for your approval",
    slack_search: "Looking through Slack", slack_read: "Reading the Slack conversation", slack_post: "Preparing a Slack message for your approval",
    notion_search: "Looking through shared Notion pages", notion_read: "Reading the Notion page", notion_update: "Preparing a Notion update for your approval",
    code_projects: "Checking shared code projects", code_list: "Reading the project structure", code_search: "Searching the code", code_read: "Reading a project file",
    code_write: "Saving a code change", code_replace: "Applying a focused code change", code_status: "Reviewing project changes", code_diff: "Reading the code diff",
    code_branch: "Starting an isolated work branch", code_commit: "Saving a reviewed checkpoint", code_request_review: "Asking for an independent code review", code_review_result: "Recording the independent review", code_publish_pr: "Preparing a pull request for your approval", code_run: "Running project checks",
    task_plan: "Setting the finish line", task_progress: "Moving the job forward", task_verify: "Checking the finished work",
    routine_create: "Setting up your routine",
    message_teammate: "Checking in with a teammate", request_approval: "Checking with you first",
  };
  return { label: labels[name] || title || "Working on it", detail: null, kind: name === "handoff" ? "handoff" : "tool" };
}

export function toolActivity(event: Record<string, unknown>): ToolActivity | null {
  const part = event.part as Record<string, unknown> | undefined;
  const tool = (part?.tool || event.tool) as string | undefined;
  const state = part?.state as Record<string, unknown> | undefined;
  const title = typeof state?.title === "string" ? state.title : typeof part?.title === "string" ? part.title : null;
  if (tool) return friendlyToolActivity(tool, title);
  const message = event.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (event.type === "assistant" && Array.isArray(content)) {
    const use = content.map((item) => item as Record<string, unknown>).find((item) => item.type === "tool_use" && typeof item.name === "string");
    if (use) return friendlyToolActivity(String(use.name), null);
  }
  if (!tool && part?.type !== "tool") return null;
  return null;
}

export type Usage = { inputTokens: number; outputTokens: number; reasoningTokens: number; cacheReadTokens: number; cost: number };

export function shouldPublishRunMessage(run: Pick<Run, "parentRunId">): boolean {
  return run.parentRunId === null;
}

export function eventUsage(event: Record<string, unknown>): Usage | null {
  const part = event.part as Record<string, unknown> | undefined;
  const message = event.message as Record<string, unknown> | undefined;
  const tokens = (event.tokens || part?.tokens || event.usage || message?.usage) as Record<string, unknown> | undefined;
  if (!tokens) return null;
  const cache = tokens.cache as Record<string, unknown> | undefined;
  return {
    inputTokens: Number(tokens.input || tokens.input_tokens || 0), outputTokens: Number(tokens.output || tokens.output_tokens || 0), reasoningTokens: Number(tokens.reasoning || 0),
    cacheReadTokens: Number(cache?.read || tokens.cacheRead || tokens.cache_read_input_tokens || 0), cost: Number(event.cost || event.total_cost_usd || part?.cost || 0),
  };
}

function cleanError(raw: string): string {
  return raw.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).filter(Boolean).slice(-6).join("\n").slice(0, 1600);
}

export interface OpenCodeRunnerOptions {
  db: OpenBotDatabase;
  onChange: () => void;
  internalUrl: string;
  internalToken: string;
  attachments: AttachmentService;
  maxParallel?: number;
}

export class OpenCodeRunner {
  private readonly running = new Map<string, ChildProcess>();
  private queueTimer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly options: OpenCodeRunnerOptions) {}

  start() {
    if (this.queueTimer) return;
    this.queueTimer = setInterval(() => void this.tick(), 500);
    void this.tick();
  }

  stop() {
    if (this.queueTimer) clearInterval(this.queueTimer);
    for (const child of this.running.values()) child.kill("SIGTERM");
    this.running.clear();
  }

  cancel(runId: string): boolean {
    const child = this.running.get(runId);
    if (!child) return false;
    child.kill("SIGTERM");
    return true;
  }

  private resumeCoordinatorIfReady(runId: string): boolean {
    const run = this.options.db.getRun(runId);
    if (!run || run.status !== "waiting_for_teammate" || !run.consultationPending || this.options.db.hasPendingChildRuns(run.id)) return false;
    const consultants = [...new Set(this.options.db.listChildRuns(run.id).map((child) => child.botName))];
    const originalRequest = run.prompt.replace(/^The private consultation is complete[\s\S]*?Original request:\n/u, "");
    const prompt = `The private consultation is complete. Review the newest private team signals and now give the user one final synthesized answer in your own voice. Incorporate useful findings and resolve any differences. Only you should answer the user. Start directly with the useful conclusion: do not narrate that a teammate replied, say you are about to finalize, mention internal consultation mechanics, or use prefaces such as “their answer is in” or “I got their take.”\n\nOriginal request:\n${originalRequest}`;
    this.options.db.resumeRunAfterConsultation(run.id, prompt);
    this.options.db.addActivity({ runId: run.id, botId: run.botId, kind: "message", label: consultants.length ? `Team input from ${consultants.join(" and ")} is ready` : "Team input is ready", detail: null });
    return true;
  }

  private shareChildOutcome(run: Run, bot: Bot, body: string, failed = false) {
    if (!run.parentRunId) return;
    const parent = this.options.db.getRun(run.parentRunId);
    if (!parent || parent.botId === bot.id) return;
    if (!this.options.db.hasAgentMessage(run.id, bot.id, parent.botId)) {
      this.options.db.addAgentMessage({
        threadId: run.threadId, fromBotId: bot.id, toBotId: parent.botId,
        body: body.slice(0, 4_000), kind: "finding", expectsReply: false, runId: run.id,
        hopCount: this.options.db.runDepth(run.id), dedupeKey: `result:${run.id}`,
      });
    }
    this.options.db.addActivity({
      runId: parent.id, botId: parent.botId, kind: failed ? "status" : "message",
      label: failed ? `${bot.name} could not finish their part` : `${bot.name} shared a finding`, detail: body.slice(0, 180),
    });
    this.resumeCoordinatorIfReady(parent.id);
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const run of this.options.db.readyConsultationCoordinators()) this.resumeCoordinatorIfReady(run.id);
      const maximum = this.options.maxParallel || 3;
      while (this.running.size < maximum) {
        const excludedBotIds = [...this.running.keys()].map((runId) => this.options.db.getRun(runId)?.botId).filter((id): id is string => Boolean(id));
        const run = this.options.db.nextQueuedRun(excludedBotIds);
        if (!run || this.running.has(run.id)) break;
        const budget = this.options.db.budgetAvailable(run.botId);
        if (!budget.allowed) {
          const error = `Weekly token limit reached (${budget.used.toLocaleString()} of ${budget.budget.toLocaleString()}). Raise the limit in this teammate's settings.`;
          this.options.db.updateRun(run.id, { status: "failed", finishedAt: new Date().toISOString(), error });
          this.options.db.finishRunTask(run.id, "failed", error);
          this.options.db.addActivity({ runId: run.id, botId: run.botId, kind: "error", label: "Paused by budget", detail: error });
          this.options.onChange();
          continue;
        }
        this.executeRun(run);
      }
    } finally { this.ticking = false; }
  }

  private buildPrompt(run: Run, bot: Bot, continuing: boolean): string {
    const inbox = this.options.db.listAgentInbox(bot.id, run.threadId);
    const teamContext = inbox.length ? `\n\nRecent private team signals:\n${inbox.map((message) => `- ${message.fromBotName} (${message.kind}): ${message.body}`).join("\n")}` : "";
    const redirectedFrom = run.steeredFromRunId ? this.options.db.getRun(run.steeredFromRunId) : null;
    const request = redirectedFrom
      ? `The user added a new direction while you were working. Continue the same job without repeating finished work.\n\nPrevious request: ${redirectedFrom.prompt}\n\nNewest direction (authoritative): ${run.prompt}`
      : continuing
        ? `Continue the existing task after the user's latest instruction or approval. Current request: ${run.prompt}`
        : `Take care of this request for the user: ${run.prompt}`;
    const sharedProjects = this.options.db.listCodeProjects(bot.id).map((project) => {
      const access = project.access.find((item) => item.botId === bot.id)!;
      return `- ${project.name} (${project.id}): ${access.canWrite ? "edit" : "read-only"}${access.canRun ? ", checks enabled" : ""}`;
    }).join("\n") || "- No code projects are shared with this teammate.";
    const liveApps = `Current connected-app state for this task (authoritative; it overrides older messages and memories):\n${connectedAppsText(this.options.db, bot)}\n\nShared code projects:\n${sharedProjects}\n\nIf the request can be answered with an available app or code project, use its tool now. For code work, inspect project instructions and current status, make focused changes, and run the smallest relevant checks. For “latest” or “last email,” search the inbox for one newest message, then read it before answering. Never claim an app is disconnected based only on an earlier reply; only report a connection problem when a tool returns one during this task.`;
    const completion = `Completion rules:\n- Own the requested outcome, not merely the next response.\n- For multi-step work, call task_plan before the first work tool, keep meaningful steps current with task_progress, and call task_verify before the final answer.\n- Continue until the deliverable is finished and checked, an external action needs approval, or a real blocker remains.\n- A progress update, explanation of what you could do, or unverified draft is not a finished deliverable.\n- Keep the conversation quiet: use the task tools for progress and reserve prose for a short useful result or a genuine question.\n- When you create a useful file, save it inside your workspace and include its relative path as a Markdown link in the final answer so OpenBot can show it as a reviewable result card.`;
    const taskContext = continuing && run.task.tracked
      ? `\n\nResume the existing job contract; do not replace its plan unless the user's outcome changed.\nGoal: ${run.task.goal}\nDeliverable: ${run.task.deliverable}\nSteps:\n${run.task.steps.map((step) => `- ${step.id}. [${step.status}] ${step.title}${step.detail ? ` — ${step.detail}` : ""}`).join("\n")}`
      : "";
    return `${request}\n\n${completion}${taskContext}\n\n${liveApps}${teamContext}`;
  }

  private executeRun(run: Run) {
    const bot = this.options.db.getBot(run.botId);
    if (!bot) return;
    const workspace = prepareWorkspace(this.options.db, bot);
    const provider = this.options.db.providerForBot(bot.id);
    const useClaude = provider?.runtime === "claude_code";
    const capabilityFingerprint = this.options.db.botSessionFingerprint(bot.id);
    const previousSession = this.options.db.previousSession(run.threadId, bot.id, capabilityFingerprint);
    const task = this.options.db.startRunTask(run.id);
    this.options.db.updateRun(run.id, { status: "running", startedAt: new Date().toISOString(), progressAt: new Date().toISOString(), partialText: "", taskStage: task?.stage || "planning" });
    this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: "status", label: "Woke up", detail: `Using ${bot.model.replace(/^(opencode|claude-code)\//, "")}` });
    this.options.onChange();

    const extraEnvironment = {
      ...this.options.db.providerEnvironment(bot.id), OPENBOT_INTERNAL_URL: this.options.internalUrl,
      OPENBOT_INTERNAL_TOKEN: this.options.internalToken, OPENBOT_BOT_ID: bot.id, OPENBOT_RUN_ID: run.id, OPENBOT_WORKSPACE: workspace,
    };
    const prompt = this.buildPrompt(run, bot, Boolean(previousSession));
    const attachedFiles = modelAttachmentFiles(this.options.db, run);
    const mcpConfig = JSON.stringify({ mcpServers: { openbot: { command: process.execPath, args: [CLAUDE_MCP_PATH] } } });
    const claudeTools = ["mcp__openbot__workspace_list", "mcp__openbot__workspace_read", "mcp__openbot__workspace_write", "mcp__openbot__workspace_replace", "mcp__openbot__isolated_bash", "mcp__openbot__browser_open", "mcp__openbot__browser_snapshot", "mcp__openbot__browser_click", "mcp__openbot__browser_type", "mcp__openbot__mac_list", "mcp__openbot__mac_read", "mcp__openbot__mac_organize", "mcp__openbot__mac_apps_list", "mcp__openbot__mac_app_inspect", "mcp__openbot__mac_app_open", "mcp__openbot__mac_app_click", "mcp__openbot__mac_app_type", "mcp__openbot__mac_app_key", "mcp__openbot__mac_app_scroll", "mcp__openbot__code_projects", "mcp__openbot__code_list", "mcp__openbot__code_search", "mcp__openbot__code_read", "mcp__openbot__code_write", "mcp__openbot__code_replace", "mcp__openbot__code_status", "mcp__openbot__code_diff", "mcp__openbot__code_branch", "mcp__openbot__code_commit", "mcp__openbot__code_request_review", "mcp__openbot__code_review_result", "mcp__openbot__code_publish_pr", "mcp__openbot__code_run", "mcp__openbot__gmail_search", "mcp__openbot__gmail_read", "mcp__openbot__gmail_send", "mcp__openbot__google_drive_search", "mcp__openbot__google_drive_read", "mcp__openbot__google_calendar_agenda", "mcp__openbot__github_notifications", "mcp__openbot__github_issues", "mcp__openbot__github_issue_create", "mcp__openbot__slack_search", "mcp__openbot__slack_read", "mcp__openbot__slack_post", "mcp__openbot__notion_search", "mcp__openbot__notion_read", "mcp__openbot__notion_update", "mcp__openbot__task_plan", "mcp__openbot__task_progress", "mcp__openbot__task_verify", "mcp__openbot__routine_create", "mcp__openbot__remember", "mcp__openbot__handoff", "mcp__openbot__message_teammate", "mcp__openbot__request_approval"].join(",");
    const args = useClaude
      ? ["-p", "--output-format", "stream-json", "--verbose", "--model", bot.model.replace(/^claude-code\//, ""), "--permission-mode", "dontAsk", "--tools", "", "--mcp-config", mcpConfig, "--strict-mcp-config", "--allowedTools", claudeTools, ...(previousSession ? ["--resume", previousSession] : []), prompt]
      : ["run", "--auto", "--format", "json", "--model", bot.model, "--dir", workspace, ...attachedFiles.flatMap((file) => ["--file", file]), ...(previousSession ? ["--session", previousSession] : []), "--title", `${bot.name} · OpenBot`, prompt];
    const child = spawn(useClaude ? "claude" : "opencode", args, { cwd: workspace, env: safeHostEnvironment(extraEnvironment), stdio: ["ignore", "pipe", "pipe"] });
    this.running.set(run.id, child);
    let stdoutBuffer = "", stderr = "", responseText = "", sessionId: string | null = previousSession, lastTool = "";
    let usage: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cost: 0 };

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        sessionId = eventSessionId(event) || sessionId;
        const text = event.type === "result" && responseText ? null : eventText(event);
        if (text) {
          responseText = appendModelText(responseText, text);
          this.options.db.updateRun(run.id, { partialText: responseText, progressAt: new Date().toISOString(), ...(sessionId ? { sessionId } : {}) });
          this.options.onChange();
        }
        const nextUsage = eventUsage(event);
        if (nextUsage) usage = nextUsage;
        const tool = toolActivity(event);
        if (tool && tool.label !== lastTool) {
          lastTool = tool.label;
          this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: tool.kind, label: tool.label, detail: tool.detail });
          this.options.onChange();
        }
      } catch { if (!line.startsWith("[")) responseText += line; }
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) consumeLine(line);
    });
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", (error) => (stderr += error.message));
    child.on("close", async (code, signal) => {
      if (stdoutBuffer) consumeLine(stdoutBuffer);
      this.running.delete(run.id);
      if (sessionId) this.options.db.rememberSessionCapabilities(sessionId, capabilityFingerprint);
      const finishedAt = new Date().toISOString();
      const current = this.options.db.getRun(run.id);
      const waiting = current?.status === "awaiting_approval";
      const cancelled = signal === "SIGTERM" || current?.status === "cancelled";
      const usagePatch = {
        inputTokens: (current?.inputTokens || 0) + usage.inputTokens,
        outputTokens: (current?.outputTokens || 0) + usage.outputTokens,
        reasoningTokens: (current?.reasoningTokens || 0) + usage.reasoningTokens,
        cacheReadTokens: (current?.cacheReadTokens || 0) + usage.cacheReadTokens,
        cost: (current?.cost || 0) + usage.cost,
        progressAt: finishedAt,
        ...(sessionId ? { sessionId } : {}),
      };
      if (waiting) {
        this.options.db.updateRun(run.id, { ...usagePatch, partialText: responseText || current?.partialText || "" });
        this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: "status", label: "Waiting for you", detail: current?.approvalReason || null });
      } else if (cancelled) {
        if (current?.status === "cancelled") this.options.db.updateRun(run.id, usagePatch);
        else {
          this.options.db.updateRun(run.id, { ...usagePatch, status: "cancelled", finishedAt });
          this.options.db.finishRunTask(run.id, "cancelled");
        }
      } else if (current?.consultationPending) {
        this.options.db.updateRun(run.id, usagePatch);
        this.options.db.pauseRunForConsultation(run.id);
        const pendingNames = [...new Set(this.options.db.listChildRuns(run.id).filter((childRun) => !["completed", "failed", "cancelled"].includes(childRun.status)).map((childRun) => childRun.botName))];
        this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: "handoff", label: pendingNames.length ? `Waiting for ${pendingNames.join(" and ")}` : "Bringing the team's ideas together", detail: null });
        this.resumeCoordinatorIfReady(run.id);
      } else if (code === 0 && responseText.trim()) {
        const summary = responseText.trim();
        this.options.db.updateRun(run.id, { ...usagePatch, status: "completed", finishedAt, summary, partialText: null, error: null });
        this.options.db.finishRunTask(run.id, "completed");
        this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: "status", label: "Finished", detail: null });
        if (!shouldPublishRunMessage(run)) {
          this.shareChildOutcome(run, bot, summary);
        } else {
          const message = this.options.db.addMessage({ threadId: run.threadId, senderType: "bot", senderId: bot.id, body: summary, runId: run.id });
          try {
            const artifacts = await this.options.attachments.captureArtifacts(bot, message, summary);
            if (artifacts.length) this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: "file", label: artifacts.length === 1 ? "Prepared your result file" : `Prepared ${artifacts.length} result files`, detail: artifacts.map((artifact) => artifact.name).join(", ") });
          } catch { /* A finished answer remains useful even if a result card cannot be prepared. */ }
        }
      } else {
        const error = cleanError(stderr) || `${useClaude ? "Claude Code" : "OpenCode"} stopped before returning a response.`;
        this.options.db.updateRun(run.id, { ...usagePatch, status: "failed", finishedAt, error, partialText: responseText || null });
        this.options.db.finishRunTask(run.id, "failed", error);
        this.options.db.addActivity({ runId: run.id, botId: bot.id, kind: "error", label: "Couldn’t finish", detail: error });
        this.shareChildOutcome(run, bot, `I could not finish the private consultation: ${error}`, true);
      }
      this.options.onChange();
      void this.tick();
    });
  }
}
