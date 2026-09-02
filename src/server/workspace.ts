import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Bot } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

function toolFile(name: string, description: string, fields: string, action: string) {
  return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: ${JSON.stringify(description)},
  args: { ${fields} },
  async execute(args) {
    const response = await fetch(process.env.OPENBOT_INTERNAL_URL + "/api/internal/tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-openbot-token": process.env.OPENBOT_INTERNAL_TOKEN || "" },
      body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action: ${JSON.stringify(action)}, args }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "OpenBot tool failed");
    return JSON.stringify(result, null, 2);
  },
});
`;
}

export function connectedAppsText(db: OpenBotDatabase, bot: Bot) {
  const gmail = db.getBotConnectorAccess(bot.id);
  const drive = db.getBotConnectorAccess(bot.id, "google-drive"), calendar = db.getBotConnectorAccess(bot.id, "google-calendar");
  const googleConnected = Boolean(db.getConnector("google-workspace")?.connected);
  const unavailable = new Set(db.listConnectorServiceErrors().map((item) => item.service));
  const github = db.getBotConnectorAccess(bot.id, "github", "github-cli"), githubConnected = Boolean(db.getConnector("github-cli")?.connected);
  const gmailText = googleConnected && gmail?.canRead && !unavailable.has("gmail")
    ? `- Gmail search and reading are available now.${gmail.canSend ? " You may prepare an email, but gmail_send will always pause for the user to approve the exact recipient and subject." : " Sending is turned off for you."}`
    : unavailable.has("gmail") ? "- Gmail needs its Google API switch turned on. Other connected Google apps may still work." : "- Gmail is not available to you right now. If it would help, ask the user to enable it in Apps & Tools.";
  return [gmailText,
    drive?.canRead && googleConnected && !unavailable.has("google-drive") ? "- Google Drive search and supported document reading are available now. Use returned file links for formats that need a dedicated viewer." : unavailable.has("google-drive") ? "- Google Drive needs its Google API switch turned on. Gmail and Calendar may still work." : "- Google Drive is not available to you right now.",
    calendar?.canRead && googleConnected && !unavailable.has("google-calendar") ? "- Google Calendar agenda reading is available now. Treat event details as current private context." : unavailable.has("google-calendar") ? "- Google Calendar needs its Google API switch turned on. Gmail and Drive may still work." : "- Google Calendar is not available to you right now.",
    githubConnected && github?.canRead ? `- GitHub notifications and issue search are available now.${github.canSend ? " You may prepare a new issue, but creating it always pauses for the user to approve the exact repository and title." : " Creating issues is turned off for you."}` : "- GitHub activity is not available to you right now.",
  ].join("\n");
}

function codeProjectsText(db: OpenBotDatabase, bot: Bot) {
  const projects = db.listCodeProjects(bot.id);
  if (!projects.length) return "- No code project has been shared with you. If coding in a user project would help, ask them to add it under Code projects.";
  return projects.map((project) => {
    const access = project.access.find((item) => item.botId === bot.id)!;
    const abilities = ["read", access.canWrite ? "edit" : null, access.canRun ? "run checks" : null].filter(Boolean).join(", ");
    return `- ${project.name} (${project.id}): ${project.projectKind}; you may ${abilities}. Use the code project tools and relative file paths.`;
  }).join("\n");
}

export function prepareWorkspace(db: OpenBotDatabase, bot: Bot) {
  const root = path.join(db.workspacesDir, bot.id);
  const toolsDir = path.join(root, ".opencode", "tools");
  mkdirSync(toolsDir, { recursive: true });
  const skillSource = path.join(db.rootDir, "skills", "use-mac-apps");
  if (existsSync(skillSource)) {
    for (const destination of [path.join(root, ".opencode", "skills", "use-mac-apps"), path.join(root, ".claude", "skills", "use-mac-apps")]) {
      cpSync(skillSource, destination, { recursive: true, force: true });
    }
  }
  const memories = db.listMemories(bot.id);
  const memoryText = memories.length ? memories.map((memory) => `- **${memory.key}:** ${memory.content}`).join("\n") : "- Nothing saved yet.";
  const workspaceText = connectedAppsText(db, bot);
  const macAccessEnabled = db.getStudioSettings().macAccessEnabled;
  const macText = macAccessEnabled
    ? "- The owner has allowed every studio teammate to use visible Mac files and accessible app controls. You can inspect files and apps immediately. Moving files, clicking controls, entering text, and pressing keys pause for approval."
    : "- Mac files and apps are off for the studio. If the user asks for Desktop, Documents, Downloads, or visible app work, ask them to turn on Files & apps on this Mac in Control center.";
  const profile = `# ${bot.name}

You are ${bot.name}, a persistent OpenBot teammate.

## Role

${bot.role}

## Working style

${bot.instructions}

## Durable memory

${memoryText}

## Connected apps

${workspaceText}

## Files on this Mac

${macText}

## Code projects

${codeProjectsText(db, bot)}

## Operating rules

- Work inside the private workspace by default. Use the dedicated Mac file tools only when Files on this Mac is enabled and the request clearly concerns the user's visible home folders.
- Use the isolated bash tool for terminal work and the browser tools for websites.
- For code inside a shared user project, use code_projects to identify the approved project, then code_list/code_search/code_read before editing. Start a separate code_branch before work; it creates an isolated task workspace that leaves the user's main folder untouched. Use code_replace for focused changes or code_write for complete files, inspect code_diff, run code_run checks, and use code_commit with only the exact changed paths. After task_verify passes, call code_request_review with a different teammate listed by code_projects. Publishing requires that independent review and always pauses for the user's approval. Never use Mac file tools to bypass project permissions.
- Read the project's AGENTS.md or equivalent instructions before changing code. Keep edits focused, inspect the resulting diff/status, and run the smallest relevant checks before task_verify.
- Use the use-mac-apps skill when the user asks to operate a visible app on their real Mac. Inspect the current controls before each approved click, text entry, or key press.
- When the user asks for something to repeat—such as “every 5 minutes,” hourly, daily, or weekly—create an OpenBot routine with routine_create. Use the current conversation and this teammate. Do not refuse ordinary local routines as sensitive automation.
- Interpret “text me” without a named external service as posting the requested text in this OpenBot conversation. Email, SMS, or another external destination still needs the appropriate connected app and approval.
- Save stable user preferences with remember.
- Use message_teammate quietly to ask a focused question or share a useful finding. Request a reply only when it is genuinely needed. When you request a reply, do not give the user a final answer yet: OpenBot will pause you, collect the private result, and resume you so you alone can synthesize one answer.
- Handoff only when another teammate is clearly better suited, and include a specific deliverable. Handoffs happen privately; wait for the result and present it in your own final response instead of making the user read separate teammate replies.
- Team conversations have strict hop and task limits. Never create ping-pong conversations or duplicate work.
- For any request that needs several actions, tools, files, or sources, call task_plan before doing the work. Give the user one concrete outcome, a reviewable deliverable, and three to eight meaningful steps.
- Keep the job card current with task_progress at real milestones. Do not create tiny steps for every click or narrate the tool mechanics.
- Before the final answer, call task_verify. Mark it passed only after checking the actual result against the finish line; otherwise use partial or blocked and say exactly what remains.
- Do not stop at a plan, status update, or draft when the requested deliverable can still be completed safely. Continue through verification and return the finished outcome.
- Never claim an external action succeeded unless a tool confirms it.
- Never say you cannot reach the Desktop when Mac file access is enabled. Inspect it with mac_list, make a clear organization plan, then use mac_organize so the user can approve the exact move.
- When Mac file access is available, use it without narrating capability setup or internal verification. Never say “new capability,” “current OpenBot data,” “read-only live check,” “actual Desktop,” or “isolated-workspace refusal.”
- For file tidying, inspect first and speak in everyday language: briefly say what you found, suggest sensible folders, and ask for approval only when the exact moves are ready.
- Mac file tools protect hidden folders, system folders, aliases, and files outside the user's home. Never try to bypass those boundaries.
- Use connected apps only when they clearly help with the request. Keep private inbox content out of the final answer unless it is necessary to answer the user.
- The Connected apps section is regenerated before every task and is more current than earlier conversation. Never repeat an old “not connected” claim when the current section says an app is available; use the app tool first.
- Gmail search results contain internal message references for follow-up reading. Never show those references to the user.
- Drive search results contain internal file references for follow-up reading. Never show those references; share the normal Drive link when useful.
- GitHub results contain normal browser links. Use them when they help the user open an issue or notification. Never create an issue until github_issue_create has received approval and returned its link.
- Never say an email was sent while gmail_send is waiting for approval. Only confirm sending after the approval result says Gmail accepted it.
- Sensitive, destructive, publishing, purchasing, credential, and communication actions require a persistent approval.
- Write for a non-technical person unless they ask for technical detail. Lead with the useful outcome, then explain only what helps them decide or continue.
- Never expose tool names, request fields, message/run/session IDs, deduplication keys, raw receipts, or JSON in a user-facing reply. Do not say “confirmed sent” or “task complete.”
- After asking a teammate for help, say naturally who you asked and what they are checking. Do not narrate the internal delivery mechanics.
- Keep the final response concise, warm, and specific about what changed.
`;
  writeFileSync(path.join(root, "AGENTS.md"), profile, "utf8");
  writeFileSync(path.join(root, "CLAUDE.md"), profile, "utf8");
  writeFileSync(path.join(root, "opencode.json"), JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    permission: { "*": "allow", external_directory: "deny" },
    instructions: ["AGENTS.md"],
  }, null, 2), "utf8");
  writeFileSync(path.join(toolsDir, "bash.ts"), toolFile("bash", "Run a command inside this bot's persistent, isolated computer.", `command: tool.schema.string().describe("The shell command to run")`, "bash"), "utf8");
  writeFileSync(path.join(toolsDir, "browser_open.ts"), toolFile("browser_open", "Open a web page in this bot's private persistent browser.", `url: tool.schema.string()`, "browser_open"), "utf8");
  writeFileSync(path.join(toolsDir, "browser_snapshot.ts"), toolFile("browser_snapshot", "Read the current browser page as concise accessible text.", `note: tool.schema.string().optional()`, "browser_snapshot"), "utf8");
  writeFileSync(path.join(toolsDir, "browser_click.ts"), toolFile("browser_click", "Click an element in the current browser page by CSS selector.", `selector: tool.schema.string()`, "browser_click"), "utf8");
  writeFileSync(path.join(toolsDir, "browser_type.ts"), toolFile("browser_type", "Fill a field in the current browser page by CSS selector.", `selector: tool.schema.string(), value: tool.schema.string()`, "browser_type"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_list.ts"), toolFile("mac_list", "List visible files and folders in the user's Mac home. Use paths such as Desktop, Documents, or Downloads.", `path: tool.schema.string().optional()`, "mac_list"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_read.ts"), toolFile("mac_read", "Read one bounded text file from the user's visible Mac home folders when owner access is enabled.", `path: tool.schema.string()`, "mac_read"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_organize.ts"), toolFile("mac_organize", "Propose moving regular Mac files into folders. This always waits for user approval and never deletes or overwrites.", `moves: tool.schema.array(tool.schema.object({ from: tool.schema.string(), to: tool.schema.string() }))`, "mac_organize"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_apps_list.ts"), toolFile("mac_apps_list", "List the visible apps on the user's Mac and identify the currently focused window.", `note: tool.schema.string().optional()`, "mac_apps_list"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_app_inspect.ts"), toolFile("mac_app_inspect", "Inspect the current accessible controls in a visible Mac app. Always call this immediately before interacting.", `app: tool.schema.string(), maxElements: tool.schema.number().min(1).max(100).optional()`, "mac_app_inspect"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_app_open.ts"), toolFile("mac_app_open", "Open or focus a Mac app by its visible name or bundle identifier.", `app: tool.schema.string()`, "mac_app_open"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_app_click.ts"), toolFile("mac_app_click", "Click one control returned by the latest mac_app_inspect call. This pauses for user approval.", `app: tool.schema.string(), elementIndex: tool.schema.string(), clickCount: tool.schema.number().min(1).max(2).optional()`, "mac_app_click"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_app_type.ts"), toolFile("mac_app_type", "Enter text in the focused Mac app control. This pauses for user approval.", `app: tool.schema.string(), text: tool.schema.string().max(8000), clear: tool.schema.boolean().optional()`, "mac_app_type"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_app_key.ts"), toolFile("mac_app_key", "Press a key in a Mac app, optionally with modifiers. This pauses for user approval.", `app: tool.schema.string(), key: tool.schema.string(), modifiers: tool.schema.array(tool.schema.string()).optional()`, "mac_app_key"), "utf8");
  writeFileSync(path.join(toolsDir, "mac_app_scroll.ts"), toolFile("mac_app_scroll", "Scroll a visible Mac app a bounded amount. Use a positive amount to move down and a negative amount to move up.", `app: tool.schema.string(), amount: tool.schema.number().min(-20).max(20)`, "mac_app_scroll"), "utf8");
  writeFileSync(path.join(toolsDir, "gmail_search.ts"), toolFile("gmail_search", "Search the connected Gmail inbox. Use Gmail search syntax and keep the query focused.", `query: tool.schema.string(), maxResults: tool.schema.number().optional()`, "gmail_search"), "utf8");
  writeFileSync(path.join(toolsDir, "gmail_read.ts"), toolFile("gmail_read", "Read one Gmail message returned by gmail_search.", `messageId: tool.schema.string()`, "gmail_read"), "utf8");
  writeFileSync(path.join(toolsDir, "gmail_send.ts"), toolFile("gmail_send", "Prepare a plain-text Gmail message for the user to approve. This always pauses before sending.", `to: tool.schema.string(), cc: tool.schema.string().optional(), subject: tool.schema.string(), body: tool.schema.string()`, "gmail_send"), "utf8");
  writeFileSync(path.join(toolsDir, "google_drive_search.ts"), toolFile("google_drive_search", "Search the connected Google Drive for relevant files and documents.", `query: tool.schema.string(), maxResults: tool.schema.number().optional()`, "google_drive_search"), "utf8");
  writeFileSync(path.join(toolsDir, "google_drive_read.ts"), toolFile("google_drive_read", "Read a supported text, Google Docs, or Google Sheets file returned by google_drive_search.", `fileId: tool.schema.string()`, "google_drive_read"), "utf8");
  writeFileSync(path.join(toolsDir, "google_calendar_agenda.ts"), toolFile("google_calendar_agenda", "Read upcoming events from the connected primary Google Calendar.", `days: tool.schema.number().optional(), maxResults: tool.schema.number().optional()`, "google_calendar_agenda"), "utf8");
  writeFileSync(path.join(toolsDir, "github_notifications.ts"), toolFile("github_notifications", "Read recent GitHub notifications for the connected account, with useful repository and browser links.", `maxResults: tool.schema.number().min(1).max(50).optional()`, "github_notifications"), "utf8");
  writeFileSync(path.join(toolsDir, "github_issues.ts"), toolFile("github_issues", "Search GitHub issues the connected account can access. Use normal GitHub search qualifiers when useful.", `query: tool.schema.string().max(300).optional(), maxResults: tool.schema.number().min(1).max(50).optional()`, "github_issues"), "utf8");
  writeFileSync(path.join(toolsDir, "github_issue_create.ts"), toolFile("github_issue_create", "Prepare a GitHub issue for the user to approve. This always pauses before creating it.", `repository: tool.schema.string(), title: tool.schema.string().max(256), body: tool.schema.string().max(20000).optional()`, "github_issue_create"), "utf8");
  writeFileSync(path.join(toolsDir, "code_projects.ts"), toolFile("code_projects", "List the code projects explicitly shared with this teammate and the allowed read, edit, and test capabilities.", `note: tool.schema.string().optional()`, "code_projects"), "utf8");
  writeFileSync(path.join(toolsDir, "code_list.ts"), toolFile("code_list", "List bounded files and folders inside one shared code project.", `projectId: tool.schema.string(), path: tool.schema.string().optional()`, "code_list"), "utf8");
  writeFileSync(path.join(toolsDir, "code_search.ts"), toolFile("code_search", "Search text inside one shared code project before making changes.", `projectId: tool.schema.string(), query: tool.schema.string().max(240)`, "code_search"), "utf8");
  writeFileSync(path.join(toolsDir, "code_read.ts"), toolFile("code_read", "Read one bounded text file using a path relative to a shared code project.", `projectId: tool.schema.string(), path: tool.schema.string()`, "code_read"), "utf8");
  writeFileSync(path.join(toolsDir, "code_write.ts"), toolFile("code_write", "Create or atomically replace one text file in a code project when this teammate has edit access.", `projectId: tool.schema.string(), path: tool.schema.string(), content: tool.schema.string().max(1000000)`, "code_write"), "utf8");
  writeFileSync(path.join(toolsDir, "code_replace.ts"), toolFile("code_replace", "Replace an exact code block only when the expected number of matches is present.", `projectId: tool.schema.string(), path: tool.schema.string(), oldText: tool.schema.string().min(1), newText: tool.schema.string(), expectedOccurrences: tool.schema.number().int().min(1).max(100).optional()`, "code_replace"), "utf8");
  writeFileSync(path.join(toolsDir, "code_status.ts"), toolFile("code_status", "Review the current Git branch and bounded working-tree changes in a shared code project.", `projectId: tool.schema.string()`, "code_status"), "utf8");
  writeFileSync(path.join(toolsDir, "code_diff.ts"), toolFile("code_diff", "Read a bounded Git diff for visible changed files before committing or reporting work.", `projectId: tool.schema.string()`, "code_diff"), "utf8");
  writeFileSync(path.join(toolsDir, "code_branch.ts"), toolFile("code_branch", "Create an isolated Git task branch without changing the user's main project folder.", `projectId: tool.schema.string(), name: tool.schema.string().max(120)`, "code_branch"), "utf8");
  writeFileSync(path.join(toolsDir, "code_commit.ts"), toolFile("code_commit", "Commit only the exact named changed files on a separate branch.", `projectId: tool.schema.string(), message: tool.schema.string().max(120), paths: tool.schema.array(tool.schema.string()).min(1).max(50)`, "code_commit"), "utf8");
  writeFileSync(path.join(toolsDir, "code_request_review.ts"), toolFile("code_request_review", "Privately ask a different teammate to review the exact tested commit, then wait and synthesize their result before publishing.", `projectId: tool.schema.string(), reviewerBotId: tool.schema.string()`, "code_request_review"), "utf8");
  writeFileSync(path.join(toolsDir, "code_review_result.ts"), toolFile("code_review_result", "Record the verdict for an independent code review you were explicitly asked to perform.", `sourceRunId: tool.schema.string(), projectId: tool.schema.string(), headCommit: tool.schema.string(), verdict: tool.schema.enum(["approved", "changes_requested"]), summary: tool.schema.string().max(800), findings: tool.schema.array(tool.schema.string().max(500)).max(12)`, "code_review_result"), "utf8");
  writeFileSync(path.join(toolsDir, "code_publish_pr.ts"), toolFile("code_publish_pr", "Publish the tested, independently reviewed branch as a GitHub pull request. Always pauses for user approval.", `projectId: tool.schema.string(), title: tool.schema.string().max(160), body: tool.schema.string().max(10000), base: tool.schema.string().max(120).optional(), draft: tool.schema.boolean().optional()`, "code_publish_pr"), "utf8");
  writeFileSync(path.join(toolsDir, "code_run.ts"), toolFile("code_run", "Run a focused build, test, lint, or inspection command in a network-isolated project container.", `projectId: tool.schema.string(), command: tool.schema.string().max(4000)`, "code_run"), "utf8");
  writeFileSync(path.join(toolsDir, "task_plan.ts"), toolFile("task_plan", "Set the outcome, deliverable, approval boundary, and meaningful steps for this job before multi-step work begins.", `goal: tool.schema.string().max(240), deliverable: tool.schema.string().max(240), steps: tool.schema.array(tool.schema.string().max(140)).min(1).max(8), requiredApps: tool.schema.array(tool.schema.enum(["gmail", "google-drive", "google-calendar", "github", "browser", "computer", "mac", "code", "teammate"])).max(8).optional(), approvalBoundary: tool.schema.string().max(240).optional()`, "task_plan"), "utf8");
  writeFileSync(path.join(toolsDir, "task_progress.ts"), toolFile("task_progress", "Update one meaningful job step when it starts, finishes, is skipped, or is genuinely blocked.", `stepId: tool.schema.number().int().min(1).max(8), status: tool.schema.enum(["active", "completed", "blocked", "skipped"]), detail: tool.schema.string().max(220).optional()`, "task_progress"), "utf8");
  writeFileSync(path.join(toolsDir, "task_verify.ts"), toolFile("task_verify", "Record concrete final checks against the requested outcome before answering the user.", `status: tool.schema.enum(["passed", "partial", "blocked"]), summary: tool.schema.string().max(500), checks: tool.schema.array(tool.schema.object({ label: tool.schema.string().max(180), passed: tool.schema.boolean() })).min(1).max(8)`, "task_verify"), "utf8");
  writeFileSync(path.join(toolsDir, "routine_create.ts"), toolFile("routine_create", "Create a repeating OpenBot routine in the current conversation. Use intervals from 5 to 43200 minutes and enable it immediately unless the user asks for a draft.", `name: tool.schema.string(), prompt: tool.schema.string(), intervalMinutes: tool.schema.number().min(5).max(43200), enabled: tool.schema.boolean().optional()`, "routine_create"), "utf8");
  writeFileSync(path.join(toolsDir, "remember.ts"), toolFile("remember", "Save a stable preference or fact to this bot's durable memory.", `key: tool.schema.string(), content: tool.schema.string()`, "remember"), "utf8");
  writeFileSync(path.join(toolsDir, "handoff.ts"), toolFile("handoff", "Privately hand a focused part to another teammate; OpenBot pauses you until their result is ready for your final answer.", `botId: tool.schema.string(), task: tool.schema.string(), dedupeKey: tool.schema.string()`, "handoff"), "utf8");
  writeFileSync(path.join(toolsDir, "message_teammate.ts"), toolFile("message_teammate", "Privately send a question, update, or finding to another teammate. A requested reply pauses your final answer until their result is ready.", `botId: tool.schema.string(), message: tool.schema.string(), kind: tool.schema.enum(["message", "question", "finding"]), expectsReply: tool.schema.boolean(), dedupeKey: tool.schema.string(), replyToId: tool.schema.string().optional()`, "message_teammate"), "utf8");
  writeFileSync(path.join(toolsDir, "request_approval.ts"), toolFile("request_approval", "Ask the user for persistent approval before a sensitive action.", `reason: tool.schema.string(), actionLabel: tool.schema.string()`, "request_approval"), "utf8");
  return root;
}
