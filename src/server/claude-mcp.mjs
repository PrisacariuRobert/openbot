#!/usr/bin/env node

import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const endpoint = process.env.OPENBOT_INTERNAL_URL;
const token = process.env.OPENBOT_INTERNAL_TOKEN || "";
const botId = process.env.OPENBOT_BOT_ID;
const runId = process.env.OPENBOT_RUN_ID;
const workspace = process.env.OPENBOT_WORKSPACE;

const tools = [
  { name: "workspace_list", description: "List files in this teammate's private workspace.", local: "list", properties: { path: { type: "string" } }, required: [] },
  { name: "workspace_read", description: "Read a UTF-8 text file from this teammate's private workspace.", local: "read", properties: { path: { type: "string" } }, required: ["path"] },
  { name: "workspace_write", description: "Create or replace a UTF-8 text file inside this teammate's private workspace.", local: "write", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  { name: "workspace_replace", description: "Replace one exact text fragment in a private workspace file.", local: "replace", properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, required: ["path", "oldText", "newText"] },
  { name: "isolated_bash", description: "Run a command inside this teammate's private, persistent container.", action: "bash", properties: { command: { type: "string" } }, required: ["command"] },
  { name: "browser_open", description: "Open a web page in this teammate's private browser.", action: "browser_open", properties: { url: { type: "string" } }, required: ["url"] },
  { name: "browser_snapshot", description: "Read the current browser page as concise accessible text.", action: "browser_snapshot", properties: { note: { type: "string" } }, required: [] },
  { name: "browser_click", description: "Click an element in the current browser by CSS selector.", action: "browser_click", properties: { selector: { type: "string" } }, required: ["selector"] },
  { name: "browser_type", description: "Fill a browser field by CSS selector.", action: "browser_type", properties: { selector: { type: "string" }, value: { type: "string" } }, required: ["selector", "value"] },
  { name: "mac_list", description: "List visible files and folders in the user's Mac home when owner access is enabled.", action: "mac_list", properties: { path: { type: "string" } }, required: [] },
  { name: "mac_read", description: "Read one bounded text file from the user's visible Mac home folders.", action: "mac_read", properties: { path: { type: "string" } }, required: ["path"] },
  { name: "mac_organize", description: "Propose moving regular Mac files into folders. Always waits for owner approval and never deletes or overwrites.", action: "mac_organize", properties: { moves: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"], additionalProperties: false } } }, required: ["moves"] },
  { name: "mac_apps_list", description: "List visible Mac apps and the currently focused window.", action: "mac_apps_list", properties: { note: { type: "string" } }, required: [] },
  { name: "mac_app_inspect", description: "Inspect accessible controls in a visible Mac app immediately before interacting.", action: "mac_app_inspect", properties: { app: { type: "string" }, maxElements: { type: "number", minimum: 1, maximum: 100 } }, required: ["app"] },
  { name: "mac_app_open", description: "Open or focus a Mac app by visible name or bundle identifier.", action: "mac_app_open", properties: { app: { type: "string" } }, required: ["app"] },
  { name: "mac_app_click", description: "Click a control returned by the latest Mac app inspection. Waits for approval.", action: "mac_app_click", properties: { app: { type: "string" }, elementIndex: { type: "string" }, clickCount: { type: "number", minimum: 1, maximum: 2 } }, required: ["app", "elementIndex"] },
  { name: "mac_app_type", description: "Enter text in the focused Mac app control. Waits for approval.", action: "mac_app_type", properties: { app: { type: "string" }, text: { type: "string", maxLength: 8000 }, clear: { type: "boolean" } }, required: ["app", "text"] },
  { name: "mac_app_key", description: "Press a key in a Mac app, optionally with modifiers. Waits for approval.", action: "mac_app_key", properties: { app: { type: "string" }, key: { type: "string" }, modifiers: { type: "array", items: { type: "string" } } }, required: ["app", "key"] },
  { name: "mac_app_scroll", description: "Scroll a visible Mac app a bounded amount; positive moves down and negative moves up.", action: "mac_app_scroll", properties: { app: { type: "string" }, amount: { type: "number", minimum: -20, maximum: 20 } }, required: ["app", "amount"] },
  { name: "gmail_search", description: "Search the connected Gmail inbox with a focused Gmail query.", action: "gmail_search", properties: { query: { type: "string" }, maxResults: { type: "number" } }, required: ["query"] },
  { name: "gmail_read", description: "Read one Gmail message returned by gmail_search.", action: "gmail_read", properties: { messageId: { type: "string" } }, required: ["messageId"] },
  { name: "gmail_send", description: "Prepare a plain-text Gmail message for user approval. This always pauses before sending.", action: "gmail_send", properties: { to: { type: "string" }, cc: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] },
  { name: "google_drive_search", description: "Search the connected Google Drive for relevant files.", action: "google_drive_search", properties: { query: { type: "string" }, maxResults: { type: "number" } }, required: ["query"] },
  { name: "google_drive_read", description: "Read a supported file returned by google_drive_search.", action: "google_drive_read", properties: { fileId: { type: "string" } }, required: ["fileId"] },
  { name: "google_calendar_agenda", description: "Read upcoming events from the connected primary Google Calendar.", action: "google_calendar_agenda", properties: { days: { type: "number" }, maxResults: { type: "number" } }, required: [] },
  { name: "code_projects", description: "List code projects explicitly shared with this teammate and the granted capabilities.", action: "code_projects", properties: { note: { type: "string" } }, required: [] },
  { name: "code_list", description: "List bounded files and folders inside a shared code project.", action: "code_list", properties: { projectId: { type: "string" }, path: { type: "string" } }, required: ["projectId"] },
  { name: "code_search", description: "Search text inside a shared code project.", action: "code_search", properties: { projectId: { type: "string" }, query: { type: "string", maxLength: 240 } }, required: ["projectId", "query"] },
  { name: "code_read", description: "Read one bounded text file from a shared code project.", action: "code_read", properties: { projectId: { type: "string" }, path: { type: "string" } }, required: ["projectId", "path"] },
  { name: "code_write", description: "Create or atomically replace a code file when edit access is granted.", action: "code_write", properties: { projectId: { type: "string" }, path: { type: "string" }, content: { type: "string", maxLength: 1000000 } }, required: ["projectId", "path", "content"] },
  { name: "code_replace", description: "Replace an exact code block only when the expected matches are present.", action: "code_replace", properties: { projectId: { type: "string" }, path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" }, expectedOccurrences: { type: "number", minimum: 1, maximum: 100 } }, required: ["projectId", "path", "oldText", "newText"] },
  { name: "code_status", description: "Review the Git branch and bounded working-tree changes in a shared code project.", action: "code_status", properties: { projectId: { type: "string" } }, required: ["projectId"] },
  { name: "code_diff", description: "Read a bounded diff for visible changed files in a shared Git project.", action: "code_diff", properties: { projectId: { type: "string" } }, required: ["projectId"] },
  { name: "code_branch", description: "Create and switch to a separate branch in a clean shared Git project.", action: "code_branch", properties: { projectId: { type: "string" }, name: { type: "string", maxLength: 120 } }, required: ["projectId", "name"] },
  { name: "code_commit", description: "Commit only exact named files on the current separate branch.", action: "code_commit", properties: { projectId: { type: "string" }, message: { type: "string", maxLength: 120 }, paths: { type: "array", minItems: 1, maxItems: 50, items: { type: "string" } } }, required: ["projectId", "message", "paths"] },
  { name: "code_publish_pr", description: "Publish a tested branch as a GitHub pull request after user approval.", action: "code_publish_pr", properties: { projectId: { type: "string" }, title: { type: "string", maxLength: 160 }, body: { type: "string", maxLength: 10000 }, base: { type: "string", maxLength: 120 }, draft: { type: "boolean" } }, required: ["projectId", "title", "body"] },
  { name: "code_run", description: "Run a focused check in a network-isolated project container.", action: "code_run", properties: { projectId: { type: "string" }, command: { type: "string", maxLength: 4000 } }, required: ["projectId", "command"] },
  { name: "task_plan", description: "Set the outcome, deliverable, approval boundary, and meaningful steps for a multi-step job.", action: "task_plan", properties: { goal: { type: "string", maxLength: 240 }, deliverable: { type: "string", maxLength: 240 }, steps: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 140 } }, requiredApps: { type: "array", maxItems: 8, items: { type: "string", enum: ["gmail", "google-drive", "google-calendar", "browser", "computer", "mac", "code", "teammate"] } }, approvalBoundary: { type: "string", maxLength: 240 } }, required: ["goal", "deliverable", "steps"] },
  { name: "task_progress", description: "Update one meaningful job step when it starts, finishes, is skipped, or is blocked.", action: "task_progress", properties: { stepId: { type: "number", minimum: 1, maximum: 8 }, status: { type: "string", enum: ["active", "completed", "blocked", "skipped"] }, detail: { type: "string", maxLength: 220 } }, required: ["stepId", "status"] },
  { name: "task_verify", description: "Record concrete final checks against the requested outcome before answering.", action: "task_verify", properties: { status: { type: "string", enum: ["passed", "partial", "blocked"] }, summary: { type: "string", maxLength: 500 }, checks: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", properties: { label: { type: "string", maxLength: 180 }, passed: { type: "boolean" } }, required: ["label", "passed"], additionalProperties: false } } }, required: ["status", "summary", "checks"] },
  { name: "routine_create", description: "Create and immediately enable a repeating OpenBot routine in this conversation. Intervals may be any whole number from 5 to 43200 minutes.", action: "routine_create", properties: { name: { type: "string" }, prompt: { type: "string" }, intervalMinutes: { type: "number", minimum: 5, maximum: 43200 }, enabled: { type: "boolean" } }, required: ["name", "prompt", "intervalMinutes"] },
  { name: "remember", description: "Save a stable user preference or fact in durable memory.", action: "remember", properties: { key: { type: "string" }, content: { type: "string" } }, required: ["key", "content"] },
  { name: "handoff", description: "Delegate a focused deliverable to another OpenBot teammate.", action: "handoff", properties: { botId: { type: "string" }, task: { type: "string" }, dedupeKey: { type: "string" } }, required: ["botId", "task", "dedupeKey"] },
  { name: "message_teammate", description: "Send a focused question, update, or finding to another teammate.", action: "message_teammate", properties: { botId: { type: "string" }, message: { type: "string" }, kind: { type: "string", enum: ["message", "question", "finding"] }, expectsReply: { type: "boolean" }, dedupeKey: { type: "string" }, replyToId: { type: "string" } }, required: ["botId", "message", "kind", "expectsReply", "dedupeKey"] },
  { name: "request_approval", description: "Pause and ask the user before a sensitive external action.", action: "request_approval", properties: { reason: { type: "string" }, actionLabel: { type: "string" } }, required: ["reason", "actionLabel"] },
];

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }

async function callTool(tool, args) {
  if (tool.local) return localTool(tool.local, args || {});
  if (!endpoint || !botId || !runId) throw new Error("OpenBot did not provide a valid tool session.");
  const response = await fetch(`${endpoint}/api/internal/tools`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-openbot-token": token },
    body: JSON.stringify({ botId, runId, action: tool.action, args: args || {} }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "OpenBot tool failed.");
  return result;
}

async function workspacePath(relative = "", createParents = false) {
  if (!workspace) throw new Error("OpenBot did not provide a workspace.");
  const raw = String(relative), normalized = path.normalize(raw || ".");
  if (path.isAbsolute(raw) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error("That path is outside this teammate's workspace.");
  const root = await realpath(workspace), target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("That path is outside this teammate's workspace.");
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const parentSegment = index < parts.length - 1;
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Symbolic links are not available to model workspace tools.");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (createParents && parentSegment) await mkdir(current);
    }
  }
  return target;
}

async function localTool(action, args) {
  const target = await workspacePath(args.path || "", action === "write");
  if (action === "list") {
    const entries = await readdir(target, { withFileTypes: true });
    const rows = await Promise.all(entries.filter((entry) => !entry.name.startsWith(".")).map(async (entry) => {
      const info = await stat(path.join(target, entry.name));
      return { name: entry.name, kind: entry.isDirectory() ? "directory" : "file", size: info.size };
    }));
    return rows;
  }
  if (action === "read") return { path: String(args.path), content: (await readFile(target, "utf8")).slice(0, 500_000) };
  if (action === "write") {
    await writeFile(target, String(args.content), "utf8");
    return { saved: true, path: String(args.path), characters: String(args.content).length };
  }
  if (action === "replace") {
    const content = await readFile(target, "utf8"), oldText = String(args.oldText), matches = content.split(oldText).length - 1;
    if (matches !== 1) throw new Error(`Expected exactly one matching fragment, found ${matches}.`);
    const next = content.replace(oldText, String(args.newText));
    await writeFile(target, next, "utf8");
    return { saved: true, path: String(args.path) };
  }
  throw new Error("Unknown workspace action.");
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || message.id === undefined) return;
  try {
    if (message.method === "initialize") {
      return send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params?.protocolVersion || "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "openbot", version: "0.7.0" } } });
    }
    if (message.method === "tools/list") {
      return send({ jsonrpc: "2.0", id: message.id, result: { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: { type: "object", properties: tool.properties, required: tool.required, additionalProperties: false } })) } });
    }
    if (message.method === "tools/call") {
      const tool = tools.find((candidate) => candidate.name === message.params?.name);
      if (!tool) throw new Error("Unknown OpenBot tool.");
      const result = await callTool(tool, message.params?.arguments);
      return send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false } });
    }
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try { void handle(JSON.parse(line)); }
    catch { /* Ignore malformed transport lines and keep the server alive. */ }
  }
});
