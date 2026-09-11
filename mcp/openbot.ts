#!/usr/bin/env node
/**
 * OpenBot MCP test harness.
 *
 * Exposes the owner's local OpenBot studio as MCP tools so an AI assistant
 * can drive the whole app end to end — roster, tasks, approvals, receipts,
 * routines, skills, imports, browser live views — and judge whether the
 * product is going in the right direction. See docs/MCP_TESTING.md for the
 * evaluation sequence.
 *
 * Safety: the base 15 tools are observe + owner-reversible acts. Set
 * OPENBOT_MCP_FULL=1 to also register the full-access tools (private
 * browser input, the own-browser bridge, deletes, retires, settings).
 * That flag is the owner's explicit consent — keep it in your own MCP
 * client config, never in a shared file.
 *
 * Run:  node --import tsx mcp/openbot.ts
 * Env:  OPENBOT_URL (default http://127.0.0.1:4311)
 *       OPENBOT_DATA_DIR (default: the server's own data dir next to this
 *       file, else ~/.openbot) — only to read access.token
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reviewSignInRequest } from "../src/server/sign-in-review.js";
import { parseAgentsSkillMarkdown } from "../src/server/skill-library.js";

const base = (process.env.OPENBOT_URL || "http://127.0.0.1:4311").replace(/\/$/, "");
// Same default as the server itself (repo/.openbot), then the global home.
const repoDataDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), ".openbot");
const dataDir = process.env.OPENBOT_DATA_DIR
  || (existsSync(path.join(repoDataDir, "access.token")) ? repoDataDir : path.join(homedir(), ".openbot"));

let token: string | null = null;
function readToken(): string {
  if (!token) token = readFileSync(path.join(dataDir, "access.token"), "utf8").trim();
  if (!token) throw new Error(`No access token at ${path.join(dataDir, "access.token")}. Is the OpenBot server running with this data dir?`);
  return token;
}

async function call(route: string, body?: unknown, method?: string): Promise<unknown> {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? "GET" : method || "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${readToken()}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let value: unknown = null;
  try { value = text ? JSON.parse(text) : null; } catch { value = { raw: text.slice(0, 2_000) }; }
  if (!response.ok) {
    const message = (value as { error?: string } | null)?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return value;
}

async function callBytes(route: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(`${base}${route}`, {
    headers: { Authorization: `Bearer ${readToken()}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(value?.error || `HTTP ${response.status}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "image/jpeg" };
}

type AnyRecord = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const slice = (value: unknown, length: number) => str(value).slice(0, length);

function summarizeState(state: AnyRecord, threadId: string | undefined, messageLimit: number): string {
  const bots = ((state.bots as AnyRecord[]) || []).map((bot) => ({
    id: bot.id, name: bot.name, status: bot.status, model: bot.model, threadId: bot.threadId,
  }));
  const threads = ((state.threads as AnyRecord[]) || []).map((thread) => ({
    id: thread.id, title: thread.title, kind: thread.kind, needsYou: Boolean(thread.needsYou),
    lastMessage: slice(thread.lastMessage, 160),
  }));
  const approvals = ((state.approvals as AnyRecord[]) || [])
    .filter((approval) => approval.status === "pending" || !approval.status)
    .map((approval) => ({ id: approval.id, botId: approval.botId, kind: approval.kind, reason: slice(approval.reason, 240), actionLabel: slice(approval.actionLabel, 160) }));
  // runs and studioRuns overlap: the same active run appears in both lists.
  const seenRuns = new Set<string>();
  const runs = [...((state.runs as AnyRecord[]) || []), ...((state.studioRuns as AnyRecord[]) || [])]
    .filter((run) => {
      if (typeof run.id !== "string" || seenRuns.has(run.id)) return false;
      seenRuns.add(run.id);
      return !["completed", "failed", "cancelled"].includes(str(run.status));
    })
    .map((run) => ({ id: run.id, botId: run.botId, threadId: run.threadId, status: run.status, prompt: slice((run.task as AnyRecord | undefined)?.goal || run.prompt, 200) }));
  const routines = ((state.routines as AnyRecord[]) || []).map((routine) => ({
    id: routine.id, name: routine.name, enabled: routine.enabled, nextRunAt: routine.nextRunAt,
  }));
  const messages = threadId
    ? ((state.messages as AnyRecord[]) || []).slice(-messageLimit).map((message) => ({
        from: message.senderType === "bot" ? str((message as AnyRecord).senderId) || "bot" : "owner",
        body: slice(message.body, 300),
      }))
    : [];
  return JSON.stringify({ bots, threads, pendingApprovals: approvals, activeRuns: runs, routines, messages, usage: state.usage ?? null }, null, 1);
}

function findRun(state: AnyRecord, runId: string): AnyRecord | null {
  const seen = new Set<string>();
  for (const run of [...((state.runs as AnyRecord[]) || []), ...((state.studioRuns as AnyRecord[]) || [])]) {
    if (typeof run.id !== "string" || seen.has(run.id)) continue;
    seen.add(run.id);
    if (run.id === runId) return run;
  }
  return null;
}

const MCP_VERSION = "0.3.0";
const server = new McpServer({ name: "openbot", version: MCP_VERSION });

server.tool("studio_state", "Snapshot of the studio: teammates with status, conversations (with per-thread Needs-you flags), pending approvals, active tasks, routines, usage. Pass threadId to include its recent messages.", {
  threadId: z.string().optional().describe("Conversation to include messages from (e.g. team-room or a bot thread id)."),
  messageLimit: z.number().int().min(1).max(50).default(15),
}, async ({ threadId, messageLimit }) => {
  const state = await call(`/api/state${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ""}`) as AnyRecord;
  return { content: [{ type: "text", text: summarizeState(state, threadId, messageLimit) }] };
});

server.tool("send_message", "Send a chat message as the owner. Starts teammate task runs. Use targetBotIds to direct it; omit to let routing decide. To attach files: fixture_upload first, then pass the returned attachment ids here in the SAME flow — the run cannot see files you do not bind.", {
  threadId: z.string().describe("team-room, a group id, or a bot thread id."),
  body: z.string().min(1).max(20_000),
  targetBotIds: z.array(z.string()).max(6).optional(),
  attachmentIds: z.array(z.string()).max(6).optional().describe("Attachment ids from fixture_upload (or the app UI). The server rejects unknown, cross-thread, or already-claimed files before any model work starts."),
  requestId: z.string().min(8).max(80).optional().describe("Caller-generated idempotency key: retrying with the same key replays the original result instead of sending twice."),
}, async ({ threadId, body, targetBotIds, attachmentIds, requestId }) => {
  const result = await call("/api/messages", { threadId, body, ...(targetBotIds ? { targetBotIds } : {}), ...(attachmentIds ? { attachmentIds } : {}), ...(requestId ? { requestId } : {}) }) as AnyRecord;
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 4_000) }] };
});

server.tool("wait_for_run", "Poll until a task run reaches a terminal state (completed/failed/cancelled) or the timeout elapses. Returns the final run.", {
  runId: z.string(),
  timeoutSeconds: z.number().int().min(5).max(600).default(120),
}, async ({ runId, timeoutSeconds }) => {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  for (;;) {
    const state = await call("/api/state") as AnyRecord;
    const run = findRun(state, runId);
    if (!run) throw new Error(`Task ${runId} is not visible.`);
    if (["completed", "failed", "cancelled"].includes(str(run.status))) {
      return { content: [{ type: "text", text: JSON.stringify({ id: run.id, status: run.status, summary: slice(run.summary, 1_500), error: run.error ?? null }, null, 1) }] };
    }
    if (Date.now() > deadline) {
      return { content: [{ type: "text", text: `Still ${str(run.status)} after ${timeoutSeconds}s. Call again to keep waiting, or cancel_run.` }] };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
});

server.tool("run_receipt", "The Work Receipt for a finished task: team, verification checks (host-verified vs teammate-reported), work log, files, usage, uncertainty.", {
  runId: z.string(),
}, async ({ runId }) => {
  const receipt = await call(`/api/runs/${encodeURIComponent(runId)}/receipt`);
  return { content: [{ type: "text", text: JSON.stringify(receipt, null, 1).slice(0, 12_000) }] };
});

server.tool("decide_approval", "Approve or deny a pending approval (reviews, publishes, sign-in handoffs). This is the owner's decision — use it to test the approval loop, not to rubber-stamp.", {
  approvalId: z.string(),
  decision: z.enum(["approved", "denied"]),
  reviewFingerprint: z.string().max(128).optional(),
}, async ({ approvalId, decision, reviewFingerprint }) => {
  const result = await call(`/api/approvals/${encodeURIComponent(approvalId)}/decide`, { decision, ...(reviewFingerprint ? { reviewFingerprint } : {}) });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
});

server.tool("cancel_run", "Cancel a running or queued task.", {
  runId: z.string(),
}, async ({ runId }) => {
  const result = await call(`/api/runs/${encodeURIComponent(runId)}/cancel`, {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
});

server.tool("create_bot", "Create a teammate. Browser/computer access default OFF (explicit flags); the response states the effective permissions — individual flags plus studio-wide Mac access it inherits.", {
  name: z.string().min(1).max(30),
  role: z.string().min(1).max(60),
  instructions: z.string().min(1).max(2_000),
  providerInstanceId: z.string().optional().describe("AI connection id from provider_status; omit to connect later in settings."),
  model: z.string().optional().describe("Model id; required with providerInstanceId."),
  browserEnabled: z.boolean().default(false).describe("Private browser access. Default off."),
  computerEnabled: z.boolean().default(false).describe("Private computer access. Default off."),
}, async ({ name, role, instructions, providerInstanceId, model, browserEnabled, computerEnabled }) => {
  const bot = await call("/api/bots", { name, emoji: "●", color: "#6b6b6b", role, instructions, browserEnabled, computerEnabled, ...(providerInstanceId ? { providerInstanceId, model: model || "" } : {}) }) as AnyRecord;
  const state = await call("/api/state") as AnyRecord;
  const settings = (state.settings as AnyRecord) || {};
  return { content: [{ type: "text", text: JSON.stringify({ bot, effectivePermissions: { browser: Boolean((bot as AnyRecord).browserEnabled), computer: Boolean((bot as AnyRecord).computerEnabled), macAccessInheritedFromStudio: Boolean(settings.macAccessEnabled) } }, null, 1).slice(0, 2_500) }] };
});

server.tool("update_bot", "Update a teammate: model/connection, browser/computer access, budget, name, role, instructions.", {
  botId: z.string(),
  providerInstanceId: z.string().nullable().optional(),
  model: z.string().optional(),
  browserEnabled: z.boolean().optional(),
  computerEnabled: z.boolean().optional(),
  weeklyTokenBudget: z.number().int().min(0).max(100_000_000).optional(),
  name: z.string().min(1).max(30).optional(),
  role: z.string().min(1).max(60).optional(),
  instructions: z.string().min(1).max(2_000).optional(),
}, async ({ botId, ...patch }) => {
  const clean: AnyRecord = {};
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) clean[key] = value;
  const bot = await call(`/api/bots/${encodeURIComponent(botId)}`, clean, "PATCH");
  return { content: [{ type: "text", text: JSON.stringify(bot, null, 1).slice(0, 2_000) }] };
});

server.tool("approval_preview", "Read the complete review behind a pending approval before deciding.", {
  approvalId: z.string(),
}, async ({ approvalId }) => {
  const preview = await call(`/api/approvals/${encodeURIComponent(approvalId)}/preview`);
  return { content: [{ type: "text", text: JSON.stringify(preview, null, 1).slice(0, 8_000) }] };
});

server.tool("approve_run", "Approve a task waiting on a prompt-kind approval (the run-level path).", {
  runId: z.string(),
  reviewFingerprint: z.string().max(128).optional(),
}, async ({ runId, reviewFingerprint }) => {
  const result = await call(`/api/runs/${encodeURIComponent(runId)}/approve`, reviewFingerprint ? { reviewFingerprint } : {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
});

server.tool("recall_delegation", "Recall a teammate waiting on a consultation (stops the consultants, hands back).", {
  runId: z.string(),
}, async ({ runId }) => {
  const result = await call(`/api/delegations/${encodeURIComponent(runId)}/recall`, {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
});

server.tool("resolve_approved_action", "Resolve an uncertain approved action: confirm whether it completed.", {
  actionId: z.string(),
  outcome: z.enum(["completed", "not_completed"]),
}, async ({ actionId, outcome }) => {
  const result = await call(`/api/approved-actions/${encodeURIComponent(actionId)}/resolve`, { outcome });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
});

server.tool("token_allowance", "Grant extra tokens to a task waiting on a token review (50k/100k/250k).", {
  approvalId: z.string(),
  additionalTokens: z.union([z.literal(50_000), z.literal(100_000), z.literal(250_000)]),
}, async ({ approvalId, additionalTokens }) => {
  const result = await call(`/api/approvals/${encodeURIComponent(approvalId)}/token-allowance`, { additionalTokens });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
});

server.tool("list_workflows", "List saved skills/workflows, optionally for one teammate.", {
  botId: z.string().optional(),
}, async ({ botId }) => {
  const workflows = await call(botId ? `/api/bots/${encodeURIComponent(botId)}/workflows` : "/api/workflows");
  return { content: [{ type: "text", text: JSON.stringify(workflows, null, 1).slice(0, 6_000) }] };
});

server.tool("import_skill_markdown", "Install an agentskills.io SKILL.md as a teammate's skill (server-validated, reversible via delete_workflow).", {
  botId: z.string(),
  markdown: z.string().min(1).max(256_000),
}, async ({ botId, markdown }) => {
  const workflow = await call("/api/skills/import/agentskills", { botId, markdown });
  return { content: [{ type: "text", text: JSON.stringify(workflow, null, 1).slice(0, 2_000) }] };
});

server.tool("install_skill_template", "Install a starter skill template for a teammate.", {
  templateId: z.string(),
  botId: z.string(),
}, async ({ templateId, botId }) => {
  const workflow = await call(`/api/skill-templates/${encodeURIComponent(templateId)}/install`, { botId });
  return { content: [{ type: "text", text: JSON.stringify(workflow, null, 1).slice(0, 2_000) }] };
});

server.tool("assign_workflow", "Copy a skill to another teammate.", {
  workflowId: z.string(),
  botId: z.string(),
}, async ({ workflowId, botId }) => {
  const workflow = await call(`/api/workflows/${encodeURIComponent(workflowId)}/assign`, { botId });
  return { content: [{ type: "text", text: JSON.stringify(workflow, null, 1).slice(0, 2_000) }] };
});

server.tool("browser_snapshot", "Text snapshot of a teammate's current page (accessibility tree + URL + title). The non-visual check to pair with live frames.", {
  botId: z.string(),
}, async ({ botId }) => {
  const snapshot = await call(`/api/bots/${encodeURIComponent(botId)}/browser/snapshot`);
  return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 1).slice(0, 8_000) }] };
});

server.tool("browser_sites", "Sites holding sessions in a teammate's browser (names + counts only). Pair with clear_browser_site.", {
  botId: z.string(),
}, async ({ botId }) => {
  const sites = await call(`/api/bots/${encodeURIComponent(botId)}/browser/sites`);
  return { content: [{ type: "text", text: JSON.stringify(sites, null, 1).slice(0, 3_000) }] };
});

server.tool("connector_status", "Status of all app connectors (mail, calendar, chat, storage) and per-teammate grants.", {}, async () => {
  const status = await call("/api/connectors");
  return { content: [{ type: "text", text: JSON.stringify(status, null, 1).slice(0, 6_000) }] };
});

server.tool("provider_status", "AI connections, models, and studio readiness (the preflight before blaming a teammate).", {}, async () => {
  const [provider, readiness] = await Promise.all([
    call("/api/provider"),
    call("/api/readiness").catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })),
  ]);
  return { content: [{ type: "text", text: JSON.stringify({ provider, readiness }, null, 1).slice(0, 6_000) }] };
});

server.tool("auto_review_rules", "List the approval-policy rules (always_allow / require_approval).", {}, async () => {
  const rules = await call("/api/auto-review");
  return { content: [{ type: "text", text: JSON.stringify(rules, null, 1).slice(0, 4_000) }] };
});

server.tool("memory_list", "A teammate's saved memory notes (keys + contents).", {
  botId: z.string(),
}, async ({ botId }) => {
  const memories = await call(`/api/extensions/memory/${encodeURIComponent(botId)}`);
  return { content: [{ type: "text", text: JSON.stringify(memories, null, 1).slice(0, 6_000) }] };
});

server.tool("search", "Full-text search across the studio (conversations, work, files).", {
  query: z.string().min(2).max(100),
}, async ({ query }) => {
  const results = await call(`/api/search?q=${encodeURIComponent(query)}`);
  return { content: [{ type: "text", text: JSON.stringify(results, null, 1).slice(0, 6_000) }] };
});

server.tool("list_artifacts", "Delivered files and their revisions (verify finished work).", {}, async () => {
  const artifacts = await call("/api/artifacts");
  return { content: [{ type: "text", text: JSON.stringify(artifacts, null, 1).slice(0, 6_000) }] };
});

server.tool("work_sources", "A teammate's connected work sources (mail/calendar/docs scope for briefs).", {
  botId: z.string(),
}, async ({ botId }) => {
  const sources = await call(`/api/work-sources/${encodeURIComponent(botId)}`);
  return { content: [{ type: "text", text: JSON.stringify(sources, null, 1).slice(0, 4_000) }] };
});

server.tool("work_report", "A saved work report by id (source-backed output).", {
  reportId: z.string(),
}, async ({ reportId }) => {
  const report = await call(`/api/work-reports/${encodeURIComponent(reportId)}`);
  return { content: [{ type: "text", text: JSON.stringify(report, null, 1).slice(0, 8_000) }] };
});

server.tool("list_projects", "Code projects shared with teammates.", {}, async () => {
  const projects = await call("/api/code-projects");
  return { content: [{ type: "text", text: JSON.stringify(projects, null, 1).slice(0, 6_000) }] };
});

server.tool("project_review", "Review state of a code project: changes, workspaces, checks.", {
  projectId: z.string(),
  runId: z.string().optional().describe("Isolated task workspace run to review."),
}, async ({ projectId, runId }) => {
  const review = await call(`/api/code-projects/${encodeURIComponent(projectId)}/review${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`);
  return { content: [{ type: "text", text: JSON.stringify(review, null, 1).slice(0, 10_000) }] };
});

server.tool("computer_status", "A teammate's private computer status (container, browser, current page).", {
  botId: z.string(),
}, async ({ botId }) => {
  const status = await call(`/api/bots/${encodeURIComponent(botId)}/computer`);
  return { content: [{ type: "text", text: JSON.stringify(status, null, 1).slice(0, 3_000) }] };
});

server.tool("messages_list", "Full conversation messages with complete bodies (newest last). Independent evidence — never ask a bot to report on itself.", {
  threadId: z.string(),
  limit: z.number().int().min(1).max(200).default(60),
  offset: z.number().int().min(0).max(10_000).default(0).describe("Skip this many newest messages for paging."),
}, async ({ threadId, limit, offset }) => {
  const messages = await call(`/api/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}&offset=${offset}`);
  return { content: [{ type: "text", text: JSON.stringify(messages, null, 1).slice(0, 20_000) }] };
});

server.tool("run_get", "A task run in full: status, prompt, summary, tokens, verification state.", {
  runId: z.string(),
}, async ({ runId }) => {
  const run = await call(`/api/runs/${encodeURIComponent(runId)}`);
  return { content: [{ type: "text", text: JSON.stringify(run, null, 1).slice(0, 12_000) }] };
});

server.tool("run_events", "A run's activity timeline with handoff/consultation attribution (exact requested target included). Paginated.", {
  runId: z.string(),
  limit: z.number().int().min(1).max(200).default(100),
  cursor: z.number().int().min(0).default(0),
}, async ({ runId, limit, cursor }) => {
  const events = await call(`/api/runs/${encodeURIComponent(runId)}/events?limit=${limit}&cursor=${cursor}`);
  return { content: [{ type: "text", text: JSON.stringify(events, null, 1).slice(0, 12_000) }] };
});

server.tool("approval_get", "A pending approval in full: the proposed action plus its complete review.", {
  approvalId: z.string(),
}, async ({ approvalId }) => {
  const approval = await call(`/api/approvals/${encodeURIComponent(approvalId)}`);
  return { content: [{ type: "text", text: JSON.stringify(approval, null, 1).slice(0, 10_000) }] };
});

server.tool("artifact_read", "Read an artifact's actual file bytes (base64) — independent verification of what a run produced. Give the artifact url from list_artifacts or a receipt.", {
  url: z.string().describe("Artifact url, e.g. /api/attachments/<id>."),
}, async ({ url }) => {
  if (!url.startsWith("/api/")) throw new Error("Give an /api/ artifact url from list_artifacts or a receipt.");
  const { bytes, contentType } = await callBytes(url);
  if (bytes.length > 8_000_000) throw new Error(`That file is ${(bytes.length / 1_000_000).toFixed(1)} MB — over the 8 MB independent-read limit. Verify it in smaller pieces.`);
  const text = contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("csv") ? bytes.toString("utf8") : null;
  if (text !== null) return { content: [{ type: "text", text: text.slice(0, 30_000) }] };
  if (/^image\/(png|jpeg|gif|webp)$/.test(contentType)) {
    return { content: [{ type: "image" as const, data: bytes.toString("base64"), mimeType: contentType }] };
  }
  return { content: [{ type: "text", text: `Binary file (${contentType}, ${bytes.length} bytes). Base64:\n${bytes.toString("base64").slice(0, 60_000)}` }] };
});

  server.tool("courier_brief", "The shared mission brief both agents work from: what winning means, who does what, and the reporting rules. Read this first in any new testing session.", {}, async () => {
    const brief = await call("/api/courier/brief");
    return { content: [{ type: "text", text: JSON.stringify(brief, null, 1).slice(0, 4_000) }] };
  });

  server.tool("courier_inbox", "Read messages addressed to you (ChatGPT) from the local builder: fixes shipped, questions, direction. Acknowledge each with courier_ack after acting on it.", {
    unreadOnly: z.boolean().default(true),
  }, async ({ unreadOnly }) => {
    const inbox = await call(`/api/courier/inbox?for=${encodeURIComponent("chatgpt")}&unread=${unreadOnly ? "1" : "0"}`);
    return { content: [{ type: "text", text: JSON.stringify(inbox, null, 1).slice(0, 12_000) }] };
  });

  server.tool("courier_send", "Send a message to the local builder (opencode): one finding or question per message, with run IDs, hashes and bytes as refs. Findings need observed behavior, expected behavior, reproduction, and one acceptance criterion.", {
    kind: z.string().max(24).default("finding"),
    subject: z.string().min(1).max(160),
    body: z.string().min(1).max(12_000),
    refs: z.array(z.string().max(200)).max(20).optional(),
  }, async ({ kind, subject, body, refs }) => {
    const result = await call("/api/courier/messages", { from: "chatgpt", to: "opencode", kind, subject, body, ...(refs ? { refs } : {}) });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("courier_ack", "Acknowledge a courier message after acting on it.", {
    id: z.string(),
  }, async ({ id }) => {
    const result = await call(`/api/courier/messages/${encodeURIComponent(id)}/ack`, { for: "chatgpt" });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 300) }] };
  });

  server.tool("plugin_info", "Non-secret diagnostics: harness version, tool count, effective permissions, server reachability and latency. Backend source/build identity is reported by the server itself (backend.*); harnessCommit is only this harness checkout and is never the staged backend.", {}, async () => {
  const started = Date.now();
  let server: AnyRecord = { reachable: false };
  let backend: AnyRecord = {};
  try {
    const health = await call("/api/healthz") as AnyRecord | null;
    server = { reachable: true, url: base, latencyMs: Date.now() - started };
    if (health && typeof health === "object") {
      backend = { version: health.version ?? null, source: health.source ?? null, frontend: health.frontend ?? null, runtime: health.runtime ?? null };
    }
  } catch (error) {
    server = { reachable: false, url: base, error: error instanceof Error ? error.message : String(error) };
  }
  let build: AnyRecord = { backend };
  try {
    const { execSync } = await import("node:child_process");
    const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as AnyRecord;
    let harnessCommit: string | null = null;
    try { harnessCommit = execSync("git rev-parse --short HEAD", { cwd: repoRoot, timeout: 5_000 }).toString().trim() || null; } catch { harnessCommit = null; }
    build = { version: pkg.version ?? null, harnessCommit, backend };
  } catch {
    build = { backend };
  }
  const info = {
    harness: "openbot-mcp",
    harnessVersion: MCP_VERSION,
    fullAccess: process.env.OPENBOT_MCP_FULL === "1",
    permissions: "owner token, local only; cookie values and secrets are never returned",
    build,
    server,
    capabilities: ["roster", "messaging", "runs", "receipts", "approvals", "groups", "routines", "skills", "browser-live", "browser-takeover(full)", "sign-in-handoff(full)", "imports", "projects", "computer", "screenshots", "tester-browser(full)", "fixtures(full)", "artifacts", "evidence-export", "courier", "test-environment(full, staging only)"],
  };
  return { content: [{ type: "text", text: JSON.stringify(info, null, 1) }] };
});

/** Redact obvious secret material from an evidence export. Host records
 * should never carry secrets, but an export leaves the building — so
 * scrub key-like values rather than trusting every upstream writer. */
function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^(sk-|xox[bap]-|ghp_|gho_|AKIA|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(value.trim()) || value.length > 2_000) {
      return "[redacted: secret-like or oversized value]";
    }
    return value
      .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "[redacted-key]")
      .replace(/(xox[bap]-[A-Za-z0-9-]+)/g, "[redacted-token]")
      .replace(/(["']?(?:password|passwd|secret|api[_-]?key|token)["']?\s*[:=]\s*["']?)([^"'\s,}]+)/gi, "$1[redacted]");
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: AnyRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = /password|secret|api[_-]?key|token/i.test(key) && typeof entry === "string" ? "[redacted]" : redactSecrets(entry);
    }
    return out;
  }
  return value;
}

server.tool("run_export", "Complete redacted evidence pack for one task: run, events (with handoff attribution), receipt, and its conversation slice. Reconstruct and verify a deliverable without trusting any agent's explanation.", {
  runId: z.string(),
  messageLimit: z.number().int().min(1).max(200).default(60),
  tester: z.boolean().default(false).describe("Also attach the tester browser journal (events + compact snapshot) for UI-driven runs."),
  testerSession: z.string().optional().describe("Tester session for the journal; omit for the default session."),
}, async ({ runId, messageLimit, tester, testerSession }) => {
  const run = await call(`/api/runs/${encodeURIComponent(runId)}`) as AnyRecord;
  const [events, receipt] = await Promise.all([
    call(`/api/runs/${encodeURIComponent(runId)}/events?limit=200`),
    call(`/api/runs/${encodeURIComponent(runId)}/receipt`).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })),
  ]);
  const messages = await call(`/api/threads/${encodeURIComponent(str(run.threadId))}/messages?limit=${messageLimit}`) as AnyRecord[];
  // Anchor the run's own trigger and answer inside the slice: the user
  // message that started it and the bot message that carries its run id.
  // Surrounding context stays; the anchor is explicit, not positional.
  const startedAt = Date.parse(str(run.startedAt) || "") || 0;
  const trigger = [...messages].reverse().find((message) => message.senderType === "user" && Date.parse(str(message.createdAt) || "") <= startedAt) || null;
  const answer = messages.find((message) => message.runId === runId) || null;
  const pack = redactSecrets({ run, events, receipt, messages, anchor: { trigger, answer } });
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: JSON.stringify(pack, null, 1).slice(0, 60_000) },
  ];
  if (tester) {
    // The tester journal is structural metadata (already URL-sanitized
    // server-side), not secrets — attach it raw so snapshots are never
    // redacted away.
    const [journal, snapshot] = await Promise.all([
      call(`/api/tester/events?${testerSession ? `sessionId=${encodeURIComponent(testerSession)}&` : ""}limit=200`).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })),
      call(`/api/tester/browser/snapshot?${testerSession ? `sessionId=${encodeURIComponent(testerSession)}&` : ""}compact=1&limit=60`).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })),
    ]);
    content.push({ type: "text", text: `Tester journal (unredacted structural metadata):\n${JSON.stringify({ journal, snapshot }, null, 1).slice(0, 20_000)}` });
    try {
      const shot = await call(`/api/tester/browser/screenshot${testerSession ? `?sessionId=${encodeURIComponent(testerSession)}` : ""}`) as AnyRecord;
      if (typeof shot.pngBase64 === "string" && shot.pngBase64) {
        content.push({ type: "image" as const, data: shot.pngBase64 as string, mimeType: "image/png" });
      }
    } catch {
      content.push({ type: "text", text: "Tester screenshot unavailable (no open session)." });
    }
  }
  return { content };
});

server.tool("list_team_templates", "Starter rosters (Studio/Research/Ops teams) installable in one step.", {}, async () => {
  const templates = await call("/api/team-templates");
  return { content: [{ type: "text", text: JSON.stringify(templates, null, 1).slice(0, 4_000) }] };
});

server.tool("install_team_template", "Install a starter roster as ordinary teammates (no models connected, no access granted).", {
  templateId: z.string(),
}, async ({ templateId }) => {
  const result = await call(`/api/team-templates/${encodeURIComponent(templateId)}/install`, {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 3_000) }] };
});

server.tool("create_routine", "Schedule a paused routine (enabled:false keeps it a draft that never fires — safest for testing).", {
  name: z.string().min(1).max(80),
  botId: z.string(),
  threadId: z.string(),
  prompt: z.string().min(1).max(10_000),
  intervalMinutes: z.number().int().min(5).max(43_200).default(1_440),
  enabled: z.boolean().default(false),
}, async ({ name, botId, threadId, prompt, intervalMinutes, enabled }) => {
  const routine = await call("/api/routines", { name, botId, threadId, prompt, intervalMinutes, enabled });
  return { content: [{ type: "text", text: JSON.stringify(routine, null, 1).slice(0, 3_000) }] };
});

server.tool("propose_skill", "Save a finished task as a receipt-cited skill draft (owner-initiated; nothing writes itself).", {
  runId: z.string(),
}, async ({ runId }) => {
  const result = await call(`/api/runs/${encodeURIComponent(runId)}/skill-draft`, {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
});

server.tool("preview_profile_import", "Dry-run an Hermes/OpenClaw profile import: persona, memories, skills, skips. Changes nothing.", {
  path: z.string().describe("Profile folder, e.g. ~/.hermes/profiles/researcher or ~/.openclaw."),
}, async ({ path: profilePath }) => {
  const plan = await call("/api/imports/profile/preview", { path: profilePath });
  return { content: [{ type: "text", text: JSON.stringify(plan, null, 1).slice(0, 8_000) }] };
});

server.tool("browser_live_frame", "A live JPEG of a teammate's private browser (starts its screencast). Read-only: watch, never type.", {
  botId: z.string(),
}, async ({ botId }) => {
  const { bytes, contentType } = await callBytes(`/api/bots/${encodeURIComponent(botId)}/browser/live-frame`);
  return { content: [{ type: "image" as const, data: bytes.toString("base64"), mimeType: contentType }] };
});

server.tool("review_sign_in_url", "Run OpenBot's real sign-in-address review (embedded credentials, https, punycode, look-alike domains). Advisory only.", {
  url: z.string(),
}, async ({ url }) => {
  return { content: [{ type: "text", text: JSON.stringify(reviewSignInRequest(url), null, 1) }] };
});

server.tool("validate_skill_markdown", "Run OpenBot's real agentskills.io SKILL.md parser: frontmatter name/description, body, start URL.", {
  markdown: z.string().max(256_000),
}, async ({ markdown }) => {
  try {
    const parsed = parseAgentsSkillMarkdown(markdown);
    return { content: [{ type: "text", text: `Valid. ${JSON.stringify(parsed).slice(0, 1_000)}` }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Invalid: ${error instanceof Error ? error.message : String(error)}` }] };
  }
});

server.tool("app_screenshot", "Screenshot the OpenBot app interface itself (home, chat, or any settings panel) and return the PNG as an image you can SEE. Use it to visually verify layouts, check your own work, and report UI issues with evidence.", {
  target: z.enum(["home", "chat", "provider", "connectors", "projects", "bot", "files", "artifacts", "routines", "control", "computer", "teach", "remote", "live", "search"]).describe("Which screen to capture. live is the Activity & recovery drawer."),
  width: z.number().int().min(320).max(1920).default(1440),
  height: z.number().int().min(400).max(1600).default(900),
}, async ({ target, width, height }) => {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const pagePath = target === "home" ? "/" : target === "chat" ? "/studio.html" : `/studio.html?panel=${target}`;
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${base}${pagePath}`);
    await page.waitForTimeout(1_500);
    const png = await page.screenshot({ type: "png" });
    return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
  } finally {
    await browser.close().catch(() => {});
  }
});

const transport = new StdioServerTransport();

// ---- Full-access tools (owner consent via OPENBOT_MCP_FULL=1) ----
if (process.env.OPENBOT_MCP_FULL === "1") {
  server.tool("browser_takeover", "[FULL] Drive a teammate's browser directly: click at viewport coordinates (1280x820), type text, or press a key. Private input — only on the owner's explicit test instruction.", {
    botId: z.string(),
    action: z.enum(["click", "type", "key"]),
    x: z.number().min(0).max(1280).optional(),
    y: z.number().min(0).max(820).optional(),
    value: z.string().max(4_000).optional(),
    replace: z.boolean().default(false),
    key: z.enum(["Enter", "Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]).optional(),
  }, async ({ botId, action, x, y, value, replace, key }) => {
    const body = action === "click" ? { x: x ?? 640, y: y ?? 410 } : action === "type" ? { value: value ?? "", replace } : { key: key ?? "Enter" };
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/browser/takeover/${action}`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
  });

  server.tool("browser_navigate", "[FULL] Navigate a teammate's browser to a URL (subject to their site permissions).", {
    botId: z.string(),
    url: z.string().url(),
  }, async ({ botId, url }) => {
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/browser/open`, { url });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("browser_open_window", "[FULL] Open a teammate's browser as a visible window on the studio Mac.", {
    botId: z.string(),
    url: z.string().url().optional(),
  }, async ({ botId, url }) => {
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/browser/window`, { ...(url ? { url } : {}) });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("signin_control", "[FULL] Private input on a pending sign-in handoff. Each operation validates its own fields so the server never sees a malformed control. Only on the owner's explicit test instruction — never with real credentials unless the owner says so.", {
    approvalId: z.string(),
    operation: z.enum(["view", "click", "type", "key", "press", "scroll"]),
    x: z.number().min(0).max(1280).optional(),
    y: z.number().min(0).max(820).optional(),
    value: z.string().min(1).max(4_000).optional(),
    replace: z.boolean().default(false),
    key: z.string().max(12).regex(/^(?:[ -~]|Enter|Backspace|Delete|Tab|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|F(?:[1-9]|1[0-2]))$/).optional().describe("Single printable character or named key (press), or one of Enter/Tab/Escape/Backspace/Arrows (key op)."),
    deltaY: z.number().min(-3_000).max(3_000).optional(),
  }, async ({ approvalId, operation, x, y, value, replace, key, deltaY }) => {
    if (operation === "click" || operation === "scroll") {
      if (x === undefined || y === undefined) throw new Error(`${operation} needs x and y viewport coordinates (0-1280, 0-820).`);
      if (operation === "scroll" && deltaY === undefined) throw new Error("scroll needs deltaY (negative scrolls up).");
    }
    if (operation === "type" && !value) throw new Error("type needs value.");
    if ((operation === "key" || operation === "press") && !key) throw new Error(`${operation} needs key.`);
    const body: AnyRecord = { operation };
    if (x !== undefined) body.x = x;
    if (y !== undefined) body.y = y;
    if (value !== undefined) body.value = value;
    if (operation === "type") body.replace = replace;
    if (key !== undefined) body.key = key;
    if (deltaY !== undefined) body.deltaY = deltaY;
    const result = await call(`/api/approvals/${encodeURIComponent(approvalId)}/sign-in`, body) as AnyRecord;
    delete result.screenshot;
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("own_browser_open", "[FULL] Open a sign-in page in the owner's real Chrome (first step of the own-browser bridge).", {
    approvalId: z.string(),
  }, async ({ approvalId }) => {
    const result = await call(`/api/approvals/${encodeURIComponent(approvalId)}/own-browser`, { action: "open" });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("own_browser_import", "[FULL] Import the owner's Chrome session into the teammate's browser. Reads the owner's real cookie store (one Keychain approval). Only after the owner signed in and quit Chrome.", {
    approvalId: z.string(),
  }, async ({ approvalId }) => {
    const result = await call(`/api/approvals/${encodeURIComponent(approvalId)}/own-browser`, { action: "import" });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("retire_bot", "[FULL] Retire a teammate (history preserved, restorable).", {
    botId: z.string(),
  }, async ({ botId }) => {
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/retire`, {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("restore_bot", "[FULL] Restore a retired teammate.", {
    botId: z.string(),
  }, async ({ botId }) => {
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/restore`, {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("delete_routine", "[FULL] Delete a routine permanently.", {
    routineId: z.string(),
  }, async ({ routineId }) => {
    const response = await fetch(`${base}/api/routines/${encodeURIComponent(routineId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { content: [{ type: "text", text: `Routine ${routineId} deleted.` }] };
  });

  server.tool("delete_workflow", "[FULL] Delete a skill/workflow permanently (removes its files).", {
    workflowId: z.string(),
  }, async ({ workflowId }) => {
    const response = await fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { content: [{ type: "text", text: `Workflow ${workflowId} deleted.` }] };
  });

  server.tool("set_skill_enabled", "[FULL] Turn a teammate's skill on or off (off removes its files from the harness).", {
    workflowId: z.string(),
    enabled: z.boolean(),
  }, async ({ workflowId, enabled }) => {
    const result = await call(`/api/workflows/${encodeURIComponent(workflowId)}/enabled`, { enabled }, "PATCH");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("update_settings", "[FULL] Change studio settings (e.g. yoloMode). Reversible; say what you changed.", {
    yoloMode: z.boolean().optional(),
    macAccessEnabled: z.boolean().optional(),
    selfExtendEnabled: z.boolean().optional(),
    codingModel: z.string().max(300).nullable().optional(),
    embeddingsProviderInstanceId: z.string().max(80).nullable().optional(),
    embeddingsModel: z.string().max(200).nullable().optional(),
    maxTeammates: z.number().int().min(1).max(100).optional(),
  }, async (patch) => {
    const clean: AnyRecord = {};
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) clean[key] = value;
    if (!Object.keys(clean).length) throw new Error("Choose at least one setting to change.");
    const result = await call("/api/settings", clean, "PATCH");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("clear_browser_site", "[FULL] Sign a teammate's browser out of one site (or everywhere). The owner signs in again afterwards.", {
    botId: z.string(),
    site: z.string().max(200).optional().describe("Omit to sign out everywhere."),
  }, async ({ botId, site }) => {
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/browser/sites/clear`, site ? { site } : {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("create_group", "[FULL] Create a group chat room (1-6 teammates). No delete route exists — name test groups clearly.", {
    title: z.string().min(1).max(48),
    botIds: z.array(z.string()).min(1).max(6),
  }, async ({ title, botIds }) => {
    const thread = await call("/api/threads", { title, botIds });
    return { content: [{ type: "text", text: JSON.stringify(thread, null, 1).slice(0, 2_000) }] };
  });

  server.tool("update_group", "[FULL] Rename a group or change its members (1-6 existing teammates).", {
    threadId: z.string(),
    title: z.string().min(1).max(48).optional(),
    botIds: z.array(z.string()).min(1).max(6).optional(),
  }, async ({ threadId, title, botIds }) => {
    const body: AnyRecord = {};
    if (title !== undefined) body.title = title;
    if (botIds !== undefined) body.botIds = botIds;
    const thread = await call(`/api/threads/${encodeURIComponent(threadId)}/group`, body, "PATCH");
    return { content: [{ type: "text", text: JSON.stringify(thread, null, 1).slice(0, 2_000) }] };
  });

  server.tool("update_routine", "[FULL] Edit a routine (can enable live routines — say what you changed).", {
    routineId: z.string(),
    name: z.string().min(1).max(80).optional(),
    prompt: z.string().min(1).max(10_000).optional(),
    intervalMinutes: z.number().int().min(5).max(43_200).optional(),
    enabled: z.boolean().optional(),
  }, async ({ routineId, ...patch }) => {
    const clean: AnyRecord = {};
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) clean[key] = value;
    const routine = await call(`/api/routines/${encodeURIComponent(routineId)}`, clean, "PATCH");
    return { content: [{ type: "text", text: JSON.stringify(routine, null, 1).slice(0, 3_000) }] };
  });

  server.tool("run_routine", "[FULL] Fire a routine now (performs its real actions — confirm first).", {
    routineId: z.string(),
  }, async ({ routineId }) => {
    const result = await call(`/api/routines/${encodeURIComponent(routineId)}/run`, { confirmed: true });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 3_000) }] };
  });

  server.tool("routine_activity", "[FULL] A routine's past runs and automation events (verify it fired).", {
    routineId: z.string(),
  }, async ({ routineId }) => {
    const [runs, events] = await Promise.all([
      call(`/api/routines/${encodeURIComponent(routineId)}/runs`),
      call(`/api/routines/${encodeURIComponent(routineId)}/events`),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ runs, events }, null, 1).slice(0, 6_000) }] };
  });

  server.tool("create_auto_review_rule", "[FULL] Add an approval-policy rule (always_allow / require_approval, command/prompt/browser scope). Reversible via delete.", {
    effect: z.enum(["always_allow", "require_approval"]),
    scope: z.enum(["command", "prompt", "browser"]),
    pattern: z.string().min(1).max(160),
  }, async ({ effect, scope, pattern }) => {
    const rule = await call("/api/auto-review", { effect, scope, pattern });
    return { content: [{ type: "text", text: JSON.stringify(rule, null, 1).slice(0, 1_000) }] };
  });

  server.tool("delete_auto_review_rule", "[FULL] Delete an approval-policy rule.", {
    ruleId: z.string(),
  }, async ({ ruleId }) => {
    const response = await fetch(`${base}/api/auto-review/${encodeURIComponent(ruleId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { content: [{ type: "text", text: `Rule ${ruleId} deleted.` }] };
  });

  server.tool("apply_profile_import", "[FULL] Apply a previewed Hermes/OpenClaw import as a new teammate (creates bot, memories, skills).", {
    path: z.string().describe("Same profile folder you previewed."),
    name: z.string().max(40).optional(),
  }, async ({ path: profilePath, name }) => {
    const result = await call("/api/imports/profile/apply", { path: profilePath, ...(name ? { name } : {}) });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 3_000) }] };
  });

  server.tool("create_project", "[FULL] Share a local folder as a code project (reversible via disconnect_project).", {
    name: z.string().min(1).max(80),
    rootPath: z.string().min(1).max(1_000),
    botIds: z.array(z.string()).max(50).default([]),
  }, async ({ name, rootPath, botIds }) => {
    const project = await call("/api/code-projects", {
      name, rootPath, access: botIds.map((botId) => ({ botId, canRead: true, canWrite: true, canRun: true })),
    });
    return { content: [{ type: "text", text: JSON.stringify(project, null, 1).slice(0, 3_000) }] };
  });

  server.tool("clone_project", "[FULL] Clone a GitHub repository as a managed code project.", {
    repository: z.string().min(1).max(500).describe("github.com/owner/repo or full URL."),
    botIds: z.array(z.string()).max(50).default([]),
  }, async ({ repository, botIds }) => {
    const project = await call("/api/code-projects/clone", {
      repository, access: botIds.map((botId) => ({ botId, canRead: true, canWrite: true, canRun: true })),
    });
    return { content: [{ type: "text", text: JSON.stringify(project, null, 1).slice(0, 3_000) }] };
  });

  server.tool("set_project_access", "[FULL] Set one teammate's access to a code project (read-only, coding, or none).", {
    projectId: z.string(),
    botId: z.string(),
    level: z.enum(["code", "read", "none"]),
  }, async ({ projectId, botId, level }) => {
    const access = await call(`/api/code-projects/${encodeURIComponent(projectId)}/access/${encodeURIComponent(botId)}`, {
      canRead: level !== "none", canWrite: level === "code", canRun: level === "code",
    }, "PATCH");
    return { content: [{ type: "text", text: JSON.stringify(access, null, 1).slice(0, 1_000) }] };
  });

  server.tool("restore_edit", "[FULL] Restore an agent edit while it is still the newest version of the file.", {
    editId: z.string(),
  }, async ({ editId }) => {
    const result = await call(`/api/code-project-edits/${encodeURIComponent(editId)}/restore`, {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_500) }] };
  });

  server.tool("disconnect_project", "[FULL] Disconnect a code project (files untouched).", {
    projectId: z.string(),
  }, async ({ projectId }) => {
    const response = await fetch(`${base}/api/code-projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { content: [{ type: "text", text: `Project ${projectId} disconnected; files untouched.` }] };
  });

  server.tool("rollback_workflow", "[FULL] Roll a skill back to a saved version.", {
    workflowId: z.string(),
    version: z.number().int().min(1).max(10_000),
  }, async ({ workflowId, version }) => {
    const workflow = await call(`/api/workflows/${encodeURIComponent(workflowId)}/rollback`, { version });
    return { content: [{ type: "text", text: JSON.stringify(workflow, null, 1).slice(0, 2_000) }] };
  });

  server.tool("computer_start", "[FULL] Start a teammate's private computer (Docker work — slow, heavyweight).", {
    botId: z.string(),
  }, async ({ botId }) => {
    const result = await call(`/api/bots/${encodeURIComponent(botId)}/computer/start`, {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
  });

  server.tool("provider_choose", "[FULL] Set the studio's default provider + model.", {
    providerInstanceId: z.string().min(1).max(80),
    model: z.string().min(1).max(300),
  }, async ({ providerInstanceId, model }) => {
    const result = await call("/api/provider/choose", { providerInstanceId, model });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
  });

  server.tool("tester_open_app", "[FULL] Open the dedicated tester browser on the OpenBot studio (its own session — no teammate, no task started). Loopback only.", {
    url: z.string().max(2_048).optional().describe("Studio address; omit for the studio home."),
  }, async ({ url }) => {
    const result = await call("/api/tester/browser/open", url ? { url } : {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("tester_snapshot", "[FULL] Accessibility snapshot of the tester browser's current page (element references included).", {
    sessionId: z.string().optional(),
    compact: z.boolean().default(true).describe("One line per interactive element (default) vs the full raw tree."),
    limit: z.number().int().min(1).max(200).default(120),
    cursor: z.number().int().min(0).default(0),
    ref: z.number().optional().describe("Scope to the subtree under this snapshot node ref."),
    maxDepth: z.number().int().min(1).max(12).optional(),
    interactiveOnly: z.boolean().default(true),
  }, async ({ sessionId, compact, limit, cursor, ref, maxDepth, interactiveOnly }) => {
    const query = new URLSearchParams();
    if (sessionId) query.set("sessionId", sessionId);
    if (compact) query.set("compact", "1");
    query.set("limit", String(limit));
    if (cursor) query.set("cursor", String(cursor));
    if (ref !== undefined) query.set("ref", String(ref));
    if (maxDepth !== undefined) query.set("maxDepth", String(maxDepth));
    if (interactiveOnly) query.set("interactiveOnly", "1");
    const snapshot = await call(`/api/tester/browser/snapshot?${query.toString()}`);
    return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 1).slice(0, 20_000) }] };
  });

  server.tool("tester_screenshot", "[FULL] PNG screenshot of the tester browser's current page, as an image you can SEE. Captures the exact current state — open menus, dialogs, scroll position — without navigating or resetting anything.", {
    sessionId: z.string().optional(),
    fullPage: z.boolean().default(false).describe("Full-page capture (labelled as such; not proof of what was visible)."),
    label: z.string().max(80).optional().describe("Evidence label recorded alongside the shot."),
  }, async ({ sessionId, fullPage, label }) => {
    const query = new URLSearchParams();
    if (sessionId) query.set("sessionId", sessionId);
    if (fullPage) query.set("fullPage", "1");
    if (label) query.set("label", label);
    const shot = await call(`/api/tester/browser/screenshot?${query.toString()}`) as AnyRecord;
    if (typeof shot.pngBase64 !== "string" || !shot.pngBase64) throw new Error("No screenshot was captured.");
    return { content: [{ type: "image" as const, data: shot.pngBase64 as string, mimeType: "image/png" }] };
  });

  server.tool("tester_action", "[FULL] Act on the tester browser page. Prefer snapshot refs or selectors; coordinates are the fallback. Locator actions keep the browser's own actionability checks — obscured/disabled targets fail instead of force-clicking.", {
    kind: z.enum(["click", "dblclick", "rightclick", "hover", "fill", "type", "press", "check", "uncheck", "select", "focus", "clear", "scroll", "drag", "reload", "back", "forward", "goto"]),
    sessionId: z.string().optional(),
    selector: z.string().max(500).optional().describe("CSS selector; preferred over coordinates."),
    ref: z.union([z.string(), z.number()]).optional().describe("Snapshot node ref from tester_snapshot."),
    text: z.string().max(4_000).optional().describe("Text for fill/type. fill replaces, type presses key-by-key."),
    key: z.string().max(32).optional().describe("Key or chord: Enter, Tab, Escape, Meta+A, Meta+V, Shift+Tab, ..."),
    option: z.string().max(500).optional().describe("Dropdown option value or label for select."),
    x: z.number().min(0).max(3840).optional(),
    y: z.number().min(0).max(2160).optional(),
    toX: z.number().min(0).max(3840).optional().describe("Drag destination x."),
    toY: z.number().min(0).max(2160).optional().describe("Drag destination y."),
    deltaX: z.number().min(-5_000).max(5_000).optional(),
    deltaY: z.number().min(-3_000).max(3_000).optional(),
    actionId: z.string().max(80).optional().describe("Caller id echoed in the journal; distinguishes retries from repeats."),
  }, async (input) => {
    const { kind, sessionId, ...rest } = input;
    const body: AnyRecord = { kind, ...(sessionId ? { sessionId } : {}) };
    for (const [key, value] of Object.entries(rest)) if (value !== undefined) body[key] = value;
    const result = await call("/api/tester/browser/act", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
  });

  server.tool("tester_session", "[FULL] Manage isolated tester sessions: separate desktop and narrow/touch-emulated sessions with independent state.", {
    op: z.enum(["create", "list", "activate", "resize", "close"]),
    label: z.string().max(60).optional(),
    width: z.number().int().min(320).max(1920).optional(),
    height: z.number().int().min(400).max(1600).optional(),
    mobile: z.boolean().optional().describe("Touch emulation (labelled as emulation, never as a real device)."),
    sessionId: z.string().optional().describe("For activate(resize/close)."),
    pageIndex: z.number().int().min(0).max(50).optional().describe("Page to activate."),
  }, async ({ op, label, width, height, mobile, sessionId, pageIndex }) => {
    if (op === "list") return { content: [{ type: "text", text: JSON.stringify(await call("/api/tester/sessions"), null, 1).slice(0, 3_000) }] };
    if (op === "create") {
      const created = await call("/api/tester/sessions", { ...(label ? { label } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}), ...(mobile !== undefined ? { mobile } : {}) });
      return { content: [{ type: "text", text: JSON.stringify(created, null, 1).slice(0, 1_000) }] };
    }
    if (!sessionId) throw new Error(`${op} needs sessionId.`);
    if (op === "activate") {
      const result = await call(`/api/tester/sessions/${encodeURIComponent(sessionId)}/activate`, { index: pageIndex ?? 0 });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
    }
    if (op === "resize") {
      if (!width || !height) throw new Error("resize needs width and height.");
      const result = await call(`/api/tester/sessions/${encodeURIComponent(sessionId)}`, { width, height }, "PATCH");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
    }
    const response = await fetch(`${base}/api/tester/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await response.json(), null, 1).slice(0, 500) }] };
  });

  server.tool("stage_fixture", "[FULL] Stage test file bytes outside any conversation (staging is not attaching). Returns a fixture id with byte count and hash.", {
    filename: z.string().min(1).max(160),
    contentBase64: z.string().min(1).max(34_000_000),
    mime: z.string().max(120).optional(),
  }, async ({ filename, contentBase64, mime }) => {
    const result = await call("/api/tester/fixtures/stage", { filename, contentBase64, ...(mime ? { mime } : {}) });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("tester_upload", "[FULL] Upload staged fixtures through the REAL file input of the tester page (default: input[type=file]). Returns selected names, bytes and hashes — the page's own chips, progress and validation are observed via snapshot/screenshot, not bypassed.", {
    sessionId: z.string().optional(),
    selector: z.string().max(500).optional(),
    fixtureIds: z.array(z.string().min(1).max(80)).min(1).max(6),
  }, async ({ sessionId, selector, fixtureIds }) => {
    const result = await call("/api/tester/browser/upload", { ...(sessionId ? { sessionId } : {}), ...(selector ? { selector } : {}), fixtureIds });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 2_000) }] };
  });

  server.tool("tester_download", "[FULL] Downloads captured automatically from the tester browser. get returns the actual file (proves the user's Download control works, not just the backend artifact).", {
    op: z.enum(["list", "get"]),
    sessionId: z.string().optional(),
    id: z.string().optional().describe("Download id for get."),
  }, async ({ op, sessionId, id }) => {
    if (op === "list") {
      const list = await call(`/api/tester/downloads${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`);
      return { content: [{ type: "text", text: JSON.stringify(list, null, 1).slice(0, 4_000) }] };
    }
    if (!id) throw new Error("get needs the download id from list.");
    const response = await fetch(`${base}/api/tester/downloads/${encodeURIComponent(id)}/file`, {
      headers: { Authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const filename = (response.headers.get("content-disposition") || "").slice(0, 200);
    if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("csv")) {
      return { content: [{ type: "text", text: `File ${filename} (${bytes.length} bytes):\n${bytes.toString("utf8").slice(0, 30_000)}` }] };
    }
    return { content: [{ type: "text", text: `Binary file ${filename} (${contentType}, ${bytes.length} bytes). Base64:\n${bytes.toString("base64").slice(0, 60_000)}` }] };
  });

  server.tool("tester_wait", "[FULL] Wait for an observable page condition with a bounded timeout. Timeouts return evidence (current URL), never assumed success.", {
    sessionId: z.string().optional(),
    kind: z.enum(["text", "selector", "enabled", "hidden", "url", "dialog", "download"]),
    value: z.string().max(500).optional(),
    timeoutMs: z.number().int().min(500).max(120_000).default(15_000),
  }, async ({ sessionId, kind, value, timeoutMs }) => {
    const result = await call("/api/tester/browser/wait", { ...(sessionId ? { sessionId } : {}), kind, ...(value !== undefined ? { value } : {}), timeoutMs });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_000) }] };
  });

  server.tool("tester_dialog", "[FULL] List pending browser-native dialogs, then explicitly accept or dismiss one. Nothing is ever auto-accepted.", {
    op: z.enum(["list", "resolve"]),
    sessionId: z.string().optional(),
    id: z.string().optional().describe("Dialog id for resolve."),
    accept: z.boolean().optional(),
    promptText: z.string().max(500).optional(),
  }, async ({ op, sessionId, id, accept, promptText }) => {
    if (op === "list") {
      const list = await call(`/api/tester/dialogs${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`);
      return { content: [{ type: "text", text: JSON.stringify(list, null, 1).slice(0, 3_000) }] };
    }
    if (!id || accept === undefined) throw new Error("resolve needs the dialog id and accept true/false.");
    const result = await call(`/api/tester/dialogs/${encodeURIComponent(id)}`, { ...(sessionId ? { sessionId } : {}), accept, ...(promptText !== undefined ? { promptText } : {}) });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("tester_events", "[FULL] Journaled browser events (console errors, page errors, failed requests, navigations, dialogs, downloads, action timing) with cursor pagination and type filtering.", {
    sessionId: z.string().optional(),
    cursor: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(200).default(100),
    type: z.string().max(40).optional(),
  }, async ({ sessionId, cursor, limit, type }) => {
    const query = new URLSearchParams();
    if (sessionId) query.set("sessionId", sessionId);
    query.set("cursor", String(cursor));
    query.set("limit", String(limit));
    if (type) query.set("type", type);
    const events = await call(`/api/tester/events?${query.toString()}`);
    return { content: [{ type: "text", text: JSON.stringify(events, null, 1).slice(0, 12_000) }] };
  });

  server.tool("fixture_upload", "[FULL] Upload known test data as a conversation attachment (base64). Same pipeline as the app; scoped to one conversation.", {
    threadId: z.string(),
    filename: z.string().min(1).max(160),
    contentBase64: z.string().min(1).max(34_000_000),
    mime: z.string().max(120).optional(),
  }, async ({ threadId, filename, contentBase64, mime }) => {
    const result = await call("/api/tester/fixtures", { threadId, filename, contentBase64, ...(mime ? { mime } : {}) });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 1_500) }] };
  });

  server.tool("fixture_cleanup", "[FULL] Delete an uploaded fixture, but only while it is still unclaimed (no message references it). Claimed files are evidence and stay.", {
    attachmentId: z.string(),
  }, async ({ attachmentId }) => {
    const result = await call(`/api/tester/fixtures/${encodeURIComponent(attachmentId)}`, {}, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 500) }] };
  });

  server.tool("test_environment", "[FULL] Bounded staging controls. reset cancels everything and wipes test activity (threads except team-room/bot rooms, runs, approvals, attachments, drafts, routines, alerts, courier) while keeping bots, providers, settings and skills — staging hosts only, refused elsewhere. Confirm explicitly.", {
    op: z.enum(["reset"]),
    confirm: z.literal(true).describe("Required: acknowledge the wipe."),
  }, async () => {
    const result = await call("/api/tester/environment/reset", { confirm: true });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1).slice(0, 3_000) }] };
  });

  server.tool("wake_builder", "[FULL] Wake the local developer agent (opencode) by continuing its ongoing builder conversation with your instruction — no human relay. Use it when you have findings ready for implementation or need the developer to act, then keep testing. The builder hears you through the courier; do not wake for trivial acknowledgements. Refused if the kill switch is engaged or a wake is already running.", {
    prompt: z.string().min(1).max(20_000).describe("The instruction for the developer, including what to build and how to prove it."),
    reason: z.string().max(240).optional().describe("Short context shown to the owner in logs, e.g. 'UI2 finding H-08 accepted'."),
  }, async ({ prompt, reason }) => {
    const queueDir = path.join(homedir(), ".openbot", "wake-queue");
    const killSwitch = path.join(homedir(), ".openbot", "WAKE_OFF");
    if (existsSync(killSwitch)) {
      return { content: [{ type: "text", text: JSON.stringify({ queued: false, reason: "kill switch engaged (~/.openbot/WAKE_OFF) — the owner has disabled wakes." }, null, 1) }] };
    }
    mkdirSync(queueDir, { recursive: true });
    const id = `wake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const file = path.join(queueDir, `${id}.json`);
    writeFileSync(file, JSON.stringify({ id, prompt, source: reason ? `chatgpt: ${reason}` : "chatgpt", createdAt: new Date().toISOString() }), { mode: 0o600 });
    return { content: [{ type: "text", text: JSON.stringify({ queued: true, id, note: "The local builder will start within ~10 seconds (single-flight; it may wait for an in-progress wake or the cooldown)." }, null, 1) }] };
  });

  server.tool("wake_status", "[FULL] Whether the local builder wake channel is armed: kill switch state, any running wake, and the configured session/model/reasoning effort.", {}, async () => {
    const configFile = path.join(homedir(), ".openbot", "wake-config.json");
    const lockFile = path.join(homedir(), ".openbot", "wake.lock");
    const killSwitch = path.join(homedir(), ".openbot", "WAKE_OFF");
    let config: AnyRecord = {};
    try { config = JSON.parse(readFileSync(configFile, "utf8")); } catch { config = {}; }
    let running: AnyRecord | null = null;
    try {
      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      try { process.kill(lock.pid, 0); running = lock; } catch { running = null; }
    } catch { running = null; }
    return { content: [{ type: "text", text: JSON.stringify({ armed: !existsSync(killSwitch), killSwitch: existsSync(killSwitch), running, config }, null, 1) }] };
  });

  console.error("[openbot mcp] full access enabled (OPENBOT_MCP_FULL=1)");
} else {
  console.error("[openbot mcp] standard tools only — set OPENBOT_MCP_FULL=1 for deletes, settings, and private browser input");
}

await server.connect(transport);
