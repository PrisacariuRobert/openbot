import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Activity,
  AgentMessage,
  AgentMessageKind,
  AppState,
  Approval,
  Attachment,
  AutomationAlert,
  AutomationEvent,
  AutomationEventStatus,
  AutomationTriggerType,
  Bot,
  BotConnectorAccess,
  CodeProject,
  CodeProjectAccess,
  CodeProjectEdit,
  CodeTaskReview,
  CodeTaskWorkspace,
  ConnectorConnection,
  ConnectorEvent,
  ConnectorServiceId,
  GoogleConnectorService,
  MascotKind,
  Message,
  ProviderInstance,
  Routine,
  RoutineTriggerConfig,
  Run,
  RunStatus,
  SkillVersion,
  StudioSettings,
  StudioSearchResult,
  StudioDraft,
  TaskContract,
  TaskStage,
  TaskStep,
  TaskStepStatus,
  TaskVerificationCheck,
  TaskVerificationStatus,
  TaughtWorkflow,
  Thread,
  UsageSummary,
} from "../shared/types.js";
import { SecretVault } from "./vault.js";
import { legacyCadence, normalizeRoutineInterval, routineIntervalMs } from "../shared/routines.js";
import { skillSlug } from "../shared/skills.js";
import type { AttachmentAnalysis } from "./attachments.js";
import { automationRepairHint, normalizedTriggerConfig } from "./automations.js";

type Row = Record<string, string | number | null>;
const now = () => new Date().toISOString();
const DEFAULT_MODEL = "opencode/muse-spark-1.2-contributor-free";
const DEFAULT_OWNER = "local-owner";

function asBoolean(value: string | number | null | undefined): boolean {
  return value === 1 || value === "1";
}

function jsonArray<T>(value: string | number | null | undefined): T[] {
  if (typeof value !== "string" || !value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; }
  catch { return []; }
}

function jsonRecord(value: string | number | null | undefined): Record<string, string | number | boolean> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string | number | boolean> : {};
  } catch { return {}; }
}

function taskGoal(prompt: string): string {
  return prompt.split("\n\nFiles attached by the user")[0]!.replace(/^(?:Handoff|Private teammate message) from [^:]+:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 240) || "Finish the requested work";
}

function shouldTrackTask(prompt: string, relatedRun: boolean): boolean {
  if (relatedRun) return true;
  const text = taskGoal(prompt).toLowerCase();
  if (text.length >= 64) return true;
  return /\b(?:make|create|build|write|draft|prepare|organize|clean|fix|change|update|research|find|search|review|check|verify|test|summari[sz]e|compare|read|open|send|schedule|plan|investigate|email|inbox|calendar|drive|desktop|file|folder|browser|website|report|brief)\b/.test(text);
}

function startingTaskSteps(): TaskStep[] {
  return [
    { id: 1, title: "Understand the outcome", status: "pending", detail: null },
    { id: 2, title: "Complete the work", status: "pending", detail: null },
    { id: 3, title: "Check and deliver the result", status: "pending", detail: null },
  ];
}

export class OpenBotDatabase {
  readonly rootDir: string;
  readonly dataDir: string;
  readonly workspacesDir: string;
  readonly computersDir: string;
  readonly attachmentsDir: string;
  readonly vault: SecretVault;
  private readonly db: DatabaseSync;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.dataDir = process.env.OPENBOT_DATA_DIR || path.join(rootDir, ".openbot");
    this.workspacesDir = path.join(this.dataDir, "workspaces");
    this.computersDir = path.join(this.dataDir, "computers");
    this.attachmentsDir = path.join(this.dataDir, "attachments");
    mkdirSync(this.workspacesDir, { recursive: true });
    mkdirSync(this.computersDir, { recursive: true });
    mkdirSync(this.attachmentsDir, { recursive: true });
    this.vault = new SecretVault(this.dataDir);
    this.db = new DatabaseSync(path.join(this.dataDir, "openbot.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.seed();
  }

  close() {
    this.db.close();
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
    return rows.some((row) => row.name === column);
  }

  private addColumn(table: string, definition: string) {
    const name = definition.trim().split(/\s+/)[0]!;
    if (!this.hasColumn(table, name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_instances (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        runtime TEXT NOT NULL DEFAULT 'opencode',
        env_name TEXT,
        secret_ciphertext TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        client_id TEXT,
        client_secret_ciphertext TEXT,
        access_token_ciphertext TEXT,
        refresh_token_ciphertext TEXT,
        credentials_ciphertext TEXT,
        token_expires_at TEXT,
        scopes_json TEXT NOT NULL DEFAULT '[]',
        account_email TEXT,
        status TEXT NOT NULL DEFAULT 'unconfigured',
        last_error TEXT,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS model_sessions (
        session_id TEXT PRIMARY KEY,
        capability_fingerprint TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connector_service_errors (
        connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
        service TEXT NOT NULL,
        last_error TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(connector_id, service)
      );
      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        color TEXT NOT NULL,
        role TEXT NOT NULL,
        instructions TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active_at TEXT,
        owner_id TEXT,
        provider_instance_id TEXT,
        mascot TEXT NOT NULL DEFAULT 'orbit',
        computer_enabled INTEGER NOT NULL DEFAULT 1,
        browser_enabled INTEGER NOT NULL DEFAULT 1,
        mac_access_enabled INTEGER NOT NULL DEFAULT 0,
        weekly_token_budget INTEGER NOT NULL DEFAULT 250000
      );
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('direct', 'room')),
        bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,
        section_name TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS thread_bots (
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        PRIMARY KEY(thread_id, bot_id)
      );
      CREATE TABLE IF NOT EXISTS thread_drafts (
        thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
        body TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'bot', 'system')),
        sender_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        run_id TEXT,
        reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(message_id, emoji, actor)
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        detected_mime TEXT NOT NULL DEFAULT 'application/octet-stream',
        kind TEXT NOT NULL DEFAULT 'file',
        processing_status TEXT NOT NULL DEFAULT 'ready',
        summary TEXT,
        extracted_text TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        previewable INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'upload',
        artifact_key TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        replaces_attachment_id TEXT,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        approval_reason TEXT,
        started_at TEXT,
        finished_at TEXT,
        summary TEXT,
        error TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        approval_id TEXT,
        partial_text TEXT,
        progress_at TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        parent_run_id TEXT,
        steered_from_run_id TEXT,
        routine_id TEXT,
        automation_event_id TEXT,
        consultation_pending INTEGER NOT NULL DEFAULT 0,
        attachment_ids_json TEXT NOT NULL DEFAULT '[]',
        task_goal TEXT,
        task_deliverable TEXT,
        task_approval_boundary TEXT,
        task_required_apps_json TEXT NOT NULL DEFAULT '[]',
        task_stage TEXT NOT NULL DEFAULT 'queued',
        task_steps_json TEXT NOT NULL DEFAULT '[]',
        verification_status TEXT NOT NULL DEFAULT 'pending',
        verification_summary TEXT,
        verification_checks_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        reason TEXT NOT NULL,
        action_label TEXT NOT NULL,
        action_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        decided_at TEXT
      );
      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        cadence TEXT NOT NULL CHECK(cadence IN ('hourly', 'daily')),
        interval_minutes INTEGER NOT NULL DEFAULT 1440,
        trigger_type TEXT NOT NULL DEFAULT 'schedule',
        trigger_config_json TEXT NOT NULL DEFAULT '{}',
        webhook_secret_ciphertext TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        next_run_at TEXT,
        last_run_at TEXT,
        last_status TEXT NOT NULL DEFAULT 'never',
        run_count INTEGER NOT NULL DEFAULT 0,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        deduplicated_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        paused_reason TEXT,
        last_success_at TEXT,
        last_event_at TEXT
      );
      CREATE TABLE IF NOT EXISTS automation_events (
        id TEXT PRIMARY KEY,
        routine_id TEXT NOT NULL,
        routine_name TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        status TEXT NOT NULL,
        run_id TEXT,
        replay_of_event_id TEXT,
        payload_summary TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        received_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT,
        attempt INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS automation_events_routine_time ON automation_events(routine_id,received_at DESC);
      CREATE INDEX IF NOT EXISTS automation_events_dedupe ON automation_events(routine_id,dedupe_key,received_at DESC);
      CREATE TABLE IF NOT EXISTS automation_alerts (
        id TEXT PRIMARY KEY,
        routine_id TEXT NOT NULL,
        routine_name TEXT NOT NULL,
        run_id TEXT,
        event_id TEXT,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        memory_key TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(bot_id, memory_key)
      );
      CREATE TABLE IF NOT EXISTS taught_workflows (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        start_url TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        skill_path TEXT NOT NULL,
        skill_slug TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'taught',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflow_versions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES taught_workflows(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        instructions TEXT NOT NULL,
        start_url TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(workflow_id, version)
      );
      CREATE TABLE IF NOT EXISTS dedupe_keys (
        dedupe_key TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        from_bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        to_bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        kind TEXT NOT NULL,
        expects_reply INTEGER NOT NULL DEFAULT 0,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        reply_to_id TEXT REFERENCES agent_messages(id) ON DELETE SET NULL,
        hop_count INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bot_connector_access (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
        service TEXT NOT NULL,
        can_read INTEGER NOT NULL DEFAULT 0,
        can_send INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(bot_id, connector_id, service)
      );
      CREATE TABLE IF NOT EXISTS connector_events (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
        bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        git_repository INTEGER NOT NULL DEFAULT 0,
        project_kind TEXT NOT NULL DEFAULT 'Code project',
        remote_url TEXT,
        default_branch TEXT,
        managed_clone INTEGER NOT NULL DEFAULT 0,
        connected INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bot_project_access (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES code_projects(id) ON DELETE CASCADE,
        can_read INTEGER NOT NULL DEFAULT 0,
        can_write INTEGER NOT NULL DEFAULT 0,
        can_run INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(bot_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS code_project_edits (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES code_projects(id) ON DELETE CASCADE,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        operation TEXT NOT NULL,
        additions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        before_content TEXT,
        after_hash TEXT,
        workspace_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
        restored_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_task_workspaces (
        run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES code_projects(id) ON DELETE CASCADE,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        branch TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_task_reviews (
        id TEXT PRIMARY KEY,
        source_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        reviewer_run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES code_projects(id) ON DELETE CASCADE,
        reviewer_bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        verdict TEXT NOT NULL,
        summary TEXT NOT NULL,
        findings_json TEXT NOT NULL DEFAULT '[]',
        head_commit TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_thread_created ON messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS message_reactions_message ON message_reactions(message_id, created_at);
      CREATE INDEX IF NOT EXISTS attachments_message_created ON attachments(message_id, created_at);
      CREATE INDEX IF NOT EXISTS runs_status_created ON runs(status, created_at);
      CREATE INDEX IF NOT EXISTS runs_bot_created ON runs(bot_id, created_at);
      CREATE INDEX IF NOT EXISTS approvals_status_created ON approvals(status, created_at);
      CREATE INDEX IF NOT EXISTS agent_messages_thread_created ON agent_messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS agent_messages_to_created ON agent_messages(to_bot_id, created_at);
      CREATE INDEX IF NOT EXISTS connector_events_created ON connector_events(connector_id, created_at);
      CREATE INDEX IF NOT EXISTS code_project_edits_created ON code_project_edits(project_id, created_at);
      CREATE INDEX IF NOT EXISTS code_task_workspaces_project_updated ON code_task_workspaces(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS code_task_reviews_source_created ON code_task_reviews(source_run_id, created_at);
      CREATE INDEX IF NOT EXISTS workflow_versions_workflow_version ON workflow_versions(workflow_id, version DESC);
    `);

    this.addColumn("bots", "owner_id TEXT");
    this.addColumn("bots", "provider_instance_id TEXT");
    this.addColumn("bots", "mascot TEXT NOT NULL DEFAULT 'orbit'");
    this.addColumn("bots", "computer_enabled INTEGER NOT NULL DEFAULT 1");
    this.addColumn("bots", "browser_enabled INTEGER NOT NULL DEFAULT 1");
    this.addColumn("bots", "mac_access_enabled INTEGER NOT NULL DEFAULT 0");
    this.addColumn("bots", "weekly_token_budget INTEGER NOT NULL DEFAULT 250000");
    this.addColumn("threads", "section_name TEXT");
    this.addColumn("threads", "pinned INTEGER NOT NULL DEFAULT 0");
    this.addColumn("threads", "hidden INTEGER NOT NULL DEFAULT 0");
    this.addColumn("messages", "reply_to_id TEXT");
    this.addColumn("runs", "approval_id TEXT");
    this.addColumn("runs", "partial_text TEXT");
    this.addColumn("runs", "progress_at TEXT");
    this.addColumn("runs", "input_tokens INTEGER NOT NULL DEFAULT 0");
    this.addColumn("runs", "output_tokens INTEGER NOT NULL DEFAULT 0");
    this.addColumn("runs", "reasoning_tokens INTEGER NOT NULL DEFAULT 0");
    this.addColumn("runs", "cache_read_tokens INTEGER NOT NULL DEFAULT 0");
    this.addColumn("runs", "cost REAL NOT NULL DEFAULT 0");
    this.addColumn("runs", "parent_run_id TEXT");
    this.addColumn("runs", "steered_from_run_id TEXT");
    this.addColumn("runs", "routine_id TEXT");
    this.addColumn("runs", "consultation_pending INTEGER NOT NULL DEFAULT 0");
    this.addColumn("runs", "attachment_ids_json TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("runs", "task_goal TEXT");
    this.addColumn("runs", "task_deliverable TEXT");
    this.addColumn("runs", "task_approval_boundary TEXT");
    this.addColumn("runs", "task_required_apps_json TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("runs", "task_stage TEXT NOT NULL DEFAULT 'queued'");
    this.addColumn("runs", "task_steps_json TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("runs", "verification_status TEXT NOT NULL DEFAULT 'pending'");
    this.addColumn("runs", "verification_summary TEXT");
    this.addColumn("runs", "verification_checks_json TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("attachments", "detected_mime TEXT NOT NULL DEFAULT 'application/octet-stream'");
    this.addColumn("attachments", "kind TEXT NOT NULL DEFAULT 'file'");
    this.addColumn("attachments", "processing_status TEXT NOT NULL DEFAULT 'ready'");
    this.addColumn("attachments", "summary TEXT");
    this.addColumn("attachments", "extracted_text TEXT");
    this.addColumn("attachments", "metadata_json TEXT NOT NULL DEFAULT '{}'");
    this.addColumn("attachments", "previewable INTEGER NOT NULL DEFAULT 0");
    this.addColumn("attachments", "source TEXT NOT NULL DEFAULT 'upload'");
    this.addColumn("attachments", "artifact_key TEXT");
    this.addColumn("attachments", "revision INTEGER NOT NULL DEFAULT 1");
    this.addColumn("attachments", "replaces_attachment_id TEXT");
    this.addColumn("routines", "last_status TEXT NOT NULL DEFAULT 'never'");
    this.addColumn("routines", "run_count INTEGER NOT NULL DEFAULT 0");
    this.addColumn("routines", "trigger_type TEXT NOT NULL DEFAULT 'schedule'");
    this.addColumn("routines", "trigger_config_json TEXT NOT NULL DEFAULT '{}'");
    this.addColumn("routines", "webhook_secret_ciphertext TEXT");
    this.addColumn("routines", "consecutive_failures INTEGER NOT NULL DEFAULT 0");
    this.addColumn("routines", "deduplicated_count INTEGER NOT NULL DEFAULT 0");
    this.addColumn("routines", "last_error TEXT");
    this.addColumn("routines", "paused_reason TEXT");
    this.addColumn("routines", "last_success_at TEXT");
    this.addColumn("routines", "last_event_at TEXT");
    this.addColumn("runs", "automation_event_id TEXT");
    this.addColumn("connectors", "credentials_ciphertext TEXT");
    this.addColumn("taught_workflows", "skill_slug TEXT");
    this.addColumn("taught_workflows", "description TEXT NOT NULL DEFAULT ''");
    this.addColumn("taught_workflows", "instructions TEXT NOT NULL DEFAULT ''");
    this.addColumn("taught_workflows", "version INTEGER NOT NULL DEFAULT 1");
    this.addColumn("taught_workflows", "source TEXT NOT NULL DEFAULT 'taught'");
    this.addColumn("taught_workflows", "updated_at TEXT");
    const hadRoutineInterval = this.hasColumn("routines", "interval_minutes");
    this.addColumn("routines", "interval_minutes INTEGER NOT NULL DEFAULT 1440");
    this.addColumn("code_projects", "connected INTEGER NOT NULL DEFAULT 1");
    this.addColumn("code_projects", "remote_url TEXT");
    this.addColumn("code_projects", "default_branch TEXT");
    this.addColumn("code_projects", "managed_clone INTEGER NOT NULL DEFAULT 0");
    this.addColumn("code_project_edits", "before_content TEXT");
    this.addColumn("code_project_edits", "after_hash TEXT");
    this.addColumn("code_project_edits", "workspace_run_id TEXT");
    this.addColumn("code_project_edits", "restored_at TEXT");
    if (!hadRoutineInterval) this.db.exec("UPDATE routines SET interval_minutes=CASE cadence WHEN 'hourly' THEN 60 ELSE 1440 END");
    this.addColumn("provider_instances", "runtime TEXT NOT NULL DEFAULT 'opencode'");
    this.db.exec("UPDATE taught_workflows SET updated_at=created_at WHERE updated_at IS NULL OR updated_at=''");
    this.db.exec(`INSERT OR IGNORE INTO workflow_versions (id,workflow_id,version,name,description,instructions,start_url,steps_json,created_at)
      SELECT lower(hex(randomblob(16))),id,COALESCE(version,1),name,COALESCE(description,''),COALESCE(instructions,''),start_url,steps_json,COALESCE(updated_at,created_at) FROM taught_workflows`);
    this.db.prepare(`
      INSERT OR IGNORE INTO app_settings (setting_key, setting_value, updated_at)
      VALUES ('mac_access_enabled', CASE WHEN EXISTS(SELECT 1 FROM bots WHERE mac_access_enabled=1) THEN '1' ELSE '0' END, ?)
    `).run(now());
    this.db.exec(`UPDATE bots SET mac_access_enabled=CAST((SELECT setting_value FROM app_settings WHERE setting_key='mac_access_enabled') AS INTEGER)`);
  }

  private seed() {
    const createdAt = now();
    this.db.prepare("INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)").run(DEFAULT_OWNER, "Local owner", createdAt);
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_instances
      (id, owner_id, provider, name, auth_mode, runtime, env_name, created_at, updated_at)
      VALUES ('local-opencode', ?, 'opencode', 'My OpenCode', 'cli', 'opencode', NULL, ?, ?)
    `).run(DEFAULT_OWNER, createdAt, createdAt);

    const count = this.db.prepare("SELECT COUNT(*) AS count FROM bots").get() as Row;
    if (Number(count.count) === 0) {
      const bots = [
        {
          id: "nova", name: "Nova", emoji: "✦", mascot: "nova", color: "#6757d9", role: "Researcher",
          instructions: "Find the signal in the noise. Research carefully, keep sources and turn discoveries into clear next steps.",
        },
        {
          id: "pixel", name: "Pixel", emoji: "●", mascot: "blob", color: "#ef6a8a", role: "Maker",
          instructions: "Turn ideas into tangible, polished things. Prefer simple solutions, inspect your work and explain what changed.",
        },
        {
          id: "scout", name: "Scout", emoji: "▲", mascot: "sprout", color: "#27a67a", role: "Operator",
          instructions: "Organize work, notice blockers and carry tasks through. Be calm, practical and explicit about risky actions.",
        },
      ];
      const insertBot = this.db.prepare(`
        INSERT INTO bots
        (id, owner_id, provider_instance_id, name, emoji, mascot, color, role, instructions, model, created_at)
        VALUES (?, ?, 'local-opencode', ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertThread = this.db.prepare(`INSERT INTO threads (id, title, kind, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
      const insertThreadBot = this.db.prepare("INSERT INTO thread_bots (thread_id, bot_id) VALUES (?, ?)");
      this.db.exec("BEGIN");
      try {
        insertThread.run("team-room", "The studio", "room", null, createdAt, createdAt);
        for (const bot of bots) {
          insertBot.run(bot.id, DEFAULT_OWNER, bot.name, bot.emoji, bot.mascot, bot.color, bot.role, bot.instructions, DEFAULT_MODEL, createdAt);
          insertThread.run(`bot-${bot.id}`, bot.name, "direct", bot.id, createdAt, createdAt);
          insertThreadBot.run("team-room", bot.id);
          mkdirSync(path.join(this.workspacesDir, bot.id), { recursive: true });
        }
        this.addMessage({ threadId: "team-room", senderType: "system", senderId: null, body: "Your studio is ready. Pick a teammate or invite several into this room." });
        this.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", body: "Hi, I’m Nova. Give me something tangled and I’ll help you make sense of it." });
        this.addMessage({ threadId: "bot-pixel", senderType: "bot", senderId: "pixel", body: "Ready when you are. We can start scrappy and make it lovely as we go." });
        this.addMessage({ threadId: "bot-scout", senderType: "bot", senderId: "scout", body: "I’m here. Hand me a loose end and I’ll keep it moving." });
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }

    this.db.prepare("UPDATE bots SET owner_id = COALESCE(owner_id, ?), provider_instance_id = COALESCE(provider_instance_id, 'local-opencode')").run(DEFAULT_OWNER);
    const mascotMap: Record<string, MascotKind> = { nova: "nova", pixel: "blob", scout: "sprout" };
    for (const [id, mascot] of Object.entries(mascotMap)) this.db.prepare("UPDATE bots SET mascot = ? WHERE id = ? AND mascot = 'orbit'").run(mascot, id);
    for (const bot of this.listBots()) mkdirSync(path.join(this.workspacesDir, bot.id), { recursive: true });
  }

  private botStatus(row: Row): Bot["status"] {
    if (row.waiting_run) return "waiting";
    if (row.active_run) return "working";
    if (row.latest_status === "failed") return "failed";
    if (row.latest_status === "completed" && row.latest_finished_at && Date.now() - new Date(String(row.latest_finished_at)).getTime() < 12_000) return "celebrating";
    return "ready";
  }

  private botFromRow(row: Row): Bot {
    return {
      id: String(row.id), ownerId: String(row.owner_id || DEFAULT_OWNER),
      providerInstanceId: row.provider_instance_id ? String(row.provider_instance_id) : null,
      name: String(row.name), emoji: String(row.emoji), mascot: String(row.mascot || "orbit") as MascotKind,
      color: String(row.color), role: String(row.role), instructions: String(row.instructions), model: String(row.model),
      status: this.botStatus(row), computerEnabled: asBoolean(row.computer_enabled), browserEnabled: asBoolean(row.browser_enabled), macAccessEnabled: asBoolean(row.mac_access_enabled),
      weeklyTokenBudget: Number(row.weekly_token_budget || 0), tokensUsedThisWeek: Number(row.tokens_used_week || 0),
      createdAt: String(row.created_at), lastActiveAt: row.last_active_at ? String(row.last_active_at) : null,
      threadId: String(row.thread_id),
    };
  }

  private botSelect(where = "", order = "") {
    return `
      SELECT b.*, t.id AS thread_id,
        EXISTS(SELECT 1 FROM runs r WHERE r.bot_id=b.id AND r.status IN ('queued','running')) AS active_run,
        EXISTS(SELECT 1 FROM runs r WHERE r.bot_id=b.id AND r.status IN ('awaiting_approval','waiting_for_teammate')) AS waiting_run,
        (SELECT status FROM runs r WHERE r.bot_id=b.id ORDER BY created_at DESC LIMIT 1) AS latest_status,
        (SELECT finished_at FROM runs r WHERE r.bot_id=b.id ORDER BY created_at DESC LIMIT 1) AS latest_finished_at,
        COALESCE((SELECT SUM(input_tokens+output_tokens+reasoning_tokens) FROM runs r WHERE r.bot_id=b.id AND r.created_at >= datetime('now','-7 days')),0) AS tokens_used_week
      FROM bots b JOIN threads t ON t.bot_id=b.id AND t.kind='direct' ${where} ${order}`;
  }

  listBots(): Bot[] {
    return (this.db.prepare(this.botSelect("", "ORDER BY b.created_at ASC")).all() as Row[]).map((row) => this.botFromRow(row));
  }

  getBot(id: string): Bot | null {
    const row = this.db.prepare(this.botSelect("WHERE b.id = ?")).get(id) as Row | undefined;
    return row ? this.botFromRow(row) : null;
  }

  getStudioSettings(): StudioSettings {
    const row = this.db.prepare("SELECT setting_value FROM app_settings WHERE setting_key='mac_access_enabled'").get() as Row | undefined;
    return { macAccessEnabled: asBoolean(row?.setting_value) };
  }

  updateStudioSettings(patch: Partial<StudioSettings>): StudioSettings {
    const current = this.getStudioSettings();
    const next = { ...current, ...patch };
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE app_settings SET setting_value=?, updated_at=? WHERE setting_key='mac_access_enabled'").run(next.macAccessEnabled ? "1" : "0", now());
      this.db.prepare("UPDATE bots SET mac_access_enabled=?").run(next.macAccessEnabled ? 1 : 0);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getStudioSettings();
  }

  createBot(input: {
    name: string; emoji: string; mascot?: MascotKind; color: string; role: string; instructions: string; model?: string;
    providerInstanceId?: string | null; weeklyTokenBudget?: number;
  }): Bot {
    const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bot"}-${randomUUID().slice(0, 5)}`;
    const threadId = `bot-${id}`;
    const createdAt = now();
    this.db.prepare(`
      INSERT INTO bots
      (id, owner_id, provider_instance_id, name, emoji, mascot, color, role, instructions, model, mac_access_enabled, weekly_token_budget, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, DEFAULT_OWNER, input.providerInstanceId || "local-opencode", input.name, input.emoji, input.mascot || "orbit", input.color, input.role, input.instructions, input.model || DEFAULT_MODEL, this.getStudioSettings().macAccessEnabled ? 1 : 0, input.weeklyTokenBudget || 250000, createdAt);
    this.db.prepare("INSERT INTO threads (id,title,kind,bot_id,created_at,updated_at) VALUES (?,?,'direct',?,?,?)").run(threadId, input.name, id, createdAt, createdAt);
    this.db.prepare("INSERT OR IGNORE INTO thread_bots (thread_id,bot_id) VALUES ('team-room',?)").run(id);
    const google = this.getConnector("google-workspace");
    if (google?.connected) {
      this.setBotConnectorAccess(id, { canRead: true, canSend: true }, "gmail");
      this.setBotConnectorAccess(id, { canRead: true, canSend: false }, "google-drive");
      this.setBotConnectorAccess(id, { canRead: true, canSend: false }, "google-calendar");
    }
    mkdirSync(path.join(this.workspacesDir, id), { recursive: true });
    this.addMessage({ threadId, senderType: "bot", senderId: id, body: `Hi, I’m ${input.name}. ${input.role} mode: on. What should we make together?` });
    return this.getBot(id)!;
  }

  updateBot(id: string, patch: Partial<Pick<Bot, "name" | "role" | "instructions" | "model" | "mascot" | "color" | "computerEnabled" | "browserEnabled" | "weeklyTokenBudget" | "providerInstanceId">>): Bot | null {
    const current = this.getBot(id);
    if (!current) return null;
    this.db.prepare(`UPDATE bots SET name=?, role=?, instructions=?, model=?, mascot=?, color=?, computer_enabled=?, browser_enabled=?, mac_access_enabled=?, weekly_token_budget=?, provider_instance_id=? WHERE id=?`).run(
      patch.name ?? current.name, patch.role ?? current.role, patch.instructions ?? current.instructions, patch.model ?? current.model,
      patch.mascot ?? current.mascot, patch.color ?? current.color, (patch.computerEnabled ?? current.computerEnabled) ? 1 : 0,
      (patch.browserEnabled ?? current.browserEnabled) ? 1 : 0, current.macAccessEnabled ? 1 : 0, patch.weeklyTokenBudget ?? current.weeklyTokenBudget,
      patch.providerInstanceId === undefined ? current.providerInstanceId : patch.providerInstanceId, id,
    );
    if (patch.name) this.db.prepare("UPDATE threads SET title=? WHERE bot_id=?").run(patch.name, id);
    return this.getBot(id);
  }

  duplicateBot(id: string): Bot | null {
    const source = this.getBot(id);
    if (!source) return null;
    const copy = this.createBot({
      name: `${source.name} copy`.slice(0, 30), emoji: source.emoji, mascot: source.mascot, color: source.color,
      role: source.role, instructions: source.instructions, model: source.model, providerInstanceId: source.providerInstanceId,
      weeklyTokenBudget: source.weeklyTokenBudget,
    });
    this.updateBot(copy.id, { computerEnabled: source.computerEnabled, browserEnabled: source.browserEnabled });
    this.db.prepare("DELETE FROM bot_connector_access WHERE bot_id=?").run(copy.id);
    this.db.prepare(`INSERT INTO bot_connector_access (bot_id,connector_id,service,can_read,can_send,created_at,updated_at)
      SELECT ?,connector_id,service,can_read,can_send,?,? FROM bot_connector_access WHERE bot_id=?`).run(copy.id, now(), now(), source.id);
    this.db.prepare(`INSERT INTO bot_project_access (bot_id,project_id,can_read,can_write,can_run,created_at,updated_at)
      SELECT ?,project_id,can_read,can_write,can_run,?,? FROM bot_project_access WHERE bot_id=?`).run(copy.id, now(), now(), source.id);
    const sourceThread = this.getThread(source.threadId);
    if (sourceThread) this.updateThread(copy.threadId, { section: sourceThread.section });
    return this.getBot(copy.id);
  }

  listThreads(): Thread[] {
    return (this.db.prepare("SELECT * FROM threads ORDER BY CASE kind WHEN 'room' THEN 0 ELSE 1 END, pinned DESC, COALESCE(section_name,''), updated_at DESC").all() as Row[]).map((row) => ({
      id: String(row.id), title: String(row.title), kind: row.kind as Thread["kind"], botId: row.bot_id ? String(row.bot_id) : null,
      section: row.section_name ? String(row.section_name) : null, pinned: asBoolean(row.pinned), hidden: asBoolean(row.hidden),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), unreadCount: 0,
    }));
  }

  getThread(id: string): Thread | null {
    return this.listThreads().find((thread) => thread.id === id) || null;
  }

  updateThread(id: string, patch: Partial<Pick<Thread, "section" | "pinned" | "hidden">>): Thread | null {
    const current = this.getThread(id);
    if (!current || current.kind === "room") return null;
    const section = patch.section === undefined ? current.section : patch.section?.replace(/\s+/g, " ").trim().slice(0, 40) || null;
    this.db.prepare("UPDATE threads SET section_name=?,pinned=?,hidden=?,updated_at=? WHERE id=?").run(
      section, (patch.pinned ?? current.pinned) ? 1 : 0, (patch.hidden ?? current.hidden) ? 1 : 0, now(), id,
    );
    return this.getThread(id);
  }

  getDraft(threadId: string): StudioDraft {
    const row = this.db.prepare("SELECT * FROM thread_drafts WHERE thread_id=?").get(threadId) as Row | undefined;
    return row ? {
      threadId: String(row.thread_id),
      body: String(row.body),
      source: row.source === "ios" ? "ios" : "web",
      updatedAt: String(row.updated_at),
    } : { threadId, body: "", source: null, updatedAt: null };
  }

  saveDraft(threadId: string, body: string, source: "web" | "ios"): StudioDraft | null {
    if (!this.getThread(threadId)) return null;
    const updatedAt = now();
    this.db.prepare(`
      INSERT INTO thread_drafts (thread_id,body,source,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(thread_id) DO UPDATE SET body=excluded.body,source=excluded.source,updated_at=excluded.updated_at
    `).run(threadId, body, source, updatedAt);
    return this.getDraft(threadId);
  }

  getThreadBots(threadId: string): Bot[] {
    const thread = this.getThread(threadId);
    if (!thread) return [];
    if (thread.botId) return [this.getBot(thread.botId)].filter((bot): bot is Bot => Boolean(bot));
    const rows = this.db.prepare("SELECT bot_id FROM thread_bots WHERE thread_id=? ORDER BY rowid").all(threadId) as Row[];
    return rows.map((row) => this.getBot(String(row.bot_id))).filter((bot): bot is Bot => Boolean(bot));
  }

  addMessage(input: { threadId: string; senderType: Message["senderType"]; senderId: string | null; body: string; runId?: string | null; replyToId?: string | null }): Message {
    const id = randomUUID();
    const createdAt = now();
    const reply = input.replyToId ? this.getMessage(input.replyToId) : null;
    if (input.replyToId && (!reply || reply.threadId !== input.threadId)) throw new Error("That message is no longer available to reply to.");
    this.db.prepare("INSERT INTO messages (id,thread_id,sender_type,sender_id,body,created_at,run_id,reply_to_id) VALUES (?,?,?,?,?,?,?,?)").run(id, input.threadId, input.senderType, input.senderId, input.body, createdAt, input.runId ?? null, reply?.id || null);
    this.db.prepare("UPDATE threads SET updated_at=? WHERE id=?").run(createdAt, input.threadId);
    return this.getMessage(id)!;
  }

  private messageFromRow(row: Row): Message {
    const senderType = row.sender_type as Message["senderType"];
    return {
      id: String(row.id), threadId: String(row.thread_id), senderType, senderId: row.sender_id ? String(row.sender_id) : null,
      senderName: senderType === "user" ? "You" : senderType === "system" ? "OpenBot" : String(row.bot_name),
      senderEmoji: row.bot_emoji ? String(row.bot_emoji) : null, senderColor: row.bot_color ? String(row.bot_color) : null,
      senderMascot: row.bot_mascot ? String(row.bot_mascot) as MascotKind : null,
      body: String(row.body), createdAt: String(row.created_at), runId: row.run_id ? String(row.run_id) : null,
      replyTo: row.reply_id ? {
        id: String(row.reply_id),
        senderName: row.reply_sender_type === "user" ? "You" : row.reply_sender_type === "system" ? "OpenBot" : String(row.reply_bot_name || "Teammate"),
        body: String(row.reply_body || "").replace(/\s+/g, " ").trim().slice(0, 220),
      } : null,
      reactions: (this.db.prepare("SELECT emoji,COUNT(*) count,MAX(CASE WHEN actor='owner' THEN 1 ELSE 0 END) reacted FROM message_reactions WHERE message_id=? GROUP BY emoji ORDER BY MIN(created_at)").all(String(row.id)) as Row[]).map((reaction) => ({ emoji: String(reaction.emoji), count: Number(reaction.count), reactedByYou: asBoolean(reaction.reacted) })),
      attachments: this.listMessageAttachments(String(row.id)),
    };
  }

  getMessage(id: string): Message | null {
    const row = this.db.prepare(`SELECT m.*,b.name bot_name,b.emoji bot_emoji,b.mascot bot_mascot,b.color bot_color,reply.id reply_id,reply.body reply_body,reply.sender_type reply_sender_type,reply_bot.name reply_bot_name FROM messages m LEFT JOIN bots b ON b.id=m.sender_id LEFT JOIN messages reply ON reply.id=m.reply_to_id LEFT JOIN bots reply_bot ON reply_bot.id=reply.sender_id WHERE m.id=?`).get(id) as Row | undefined;
    return row ? this.messageFromRow(row) : null;
  }

  listMessages(threadId: string, limit = 120): Message[] {
    const rows = this.db.prepare(`SELECT * FROM (SELECT m.*,m.rowid message_rowid,b.name bot_name,b.emoji bot_emoji,b.mascot bot_mascot,b.color bot_color,reply.id reply_id,reply.body reply_body,reply.sender_type reply_sender_type,reply_bot.name reply_bot_name FROM messages m LEFT JOIN bots b ON b.id=m.sender_id LEFT JOIN messages reply ON reply.id=m.reply_to_id LEFT JOIN bots reply_bot ON reply_bot.id=reply.sender_id WHERE m.thread_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?) ORDER BY created_at ASC,message_rowid ASC`).all(threadId, limit) as Row[];
    return rows.map((row) => this.messageFromRow(row));
  }

  toggleMessageReaction(messageId: string, emoji: string): Message | null {
    const message = this.getMessage(messageId);
    if (!message) return null;
    const existing = this.db.prepare("SELECT 1 present FROM message_reactions WHERE message_id=? AND emoji=? AND actor='owner'").get(messageId, emoji) as Row | undefined;
    if (existing) this.db.prepare("DELETE FROM message_reactions WHERE message_id=? AND emoji=? AND actor='owner'").run(messageId, emoji);
    else this.db.prepare("INSERT INTO message_reactions (message_id,emoji,actor,created_at) VALUES (?,?,'owner',?)").run(messageId, emoji, now());
    return this.getMessage(messageId);
  }

  searchStudio(rawQuery: string, limit = 40): StudioSearchResult[] {
    const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, 100);
    if (query.length < 2) return [];
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const results: StudioSearchResult[] = [];
    for (const bot of this.listBots().filter((item) => `${item.name} ${item.role} ${item.instructions}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)) {
      results.push({ id: bot.id, kind: "teammate", title: bot.name, subtitle: bot.role, snippet: bot.instructions.slice(0, 220), threadId: bot.threadId, botId: bot.id, createdAt: bot.lastActiveAt || bot.createdAt });
    }
    const messages = this.db.prepare(`SELECT m.id,m.thread_id,m.body,m.created_at,m.sender_type,b.id bot_id,b.name bot_name,t.title thread_title
      FROM messages m LEFT JOIN bots b ON b.id=m.sender_id JOIN threads t ON t.id=m.thread_id
      WHERE m.body LIKE ? ESCAPE '\\' ORDER BY m.created_at DESC LIMIT 18`).all(pattern) as Row[];
    for (const row of messages) results.push({
      id: String(row.id), kind: "message", title: row.sender_type === "user" ? "You" : row.sender_type === "system" ? "OpenBot" : String(row.bot_name || "Teammate"),
      subtitle: String(row.thread_title), snippet: String(row.body).replace(/\s+/g, " ").trim().slice(0, 220), threadId: String(row.thread_id),
      botId: row.bot_id ? String(row.bot_id) : null, createdAt: String(row.created_at),
    });
    const files = this.db.prepare(`SELECT a.id,a.thread_id,a.name,a.summary,a.extracted_text,a.created_at,t.title thread_title,t.bot_id
      FROM attachments a JOIN threads t ON t.id=a.thread_id
      WHERE a.name LIKE ? ESCAPE '\\' OR COALESCE(a.summary,'') LIKE ? ESCAPE '\\' OR COALESCE(a.extracted_text,'') LIKE ? ESCAPE '\\'
      ORDER BY a.created_at DESC LIMIT 12`).all(pattern, pattern, pattern) as Row[];
    for (const row of files) results.push({
      id: String(row.id), kind: "file", title: String(row.name), subtitle: String(row.thread_title),
      snippet: String(row.summary || row.extracted_text || "Saved file").replace(/\s+/g, " ").trim().slice(0, 220), threadId: String(row.thread_id),
      botId: row.bot_id ? String(row.bot_id) : null, createdAt: String(row.created_at),
    });
    const routines = this.db.prepare(`SELECT r.id,r.name,r.prompt,r.thread_id,r.bot_id,r.last_run_at,r.next_run_at,b.name bot_name
      FROM routines r JOIN bots b ON b.id=r.bot_id WHERE r.name LIKE ? ESCAPE '\\' OR r.prompt LIKE ? ESCAPE '\\'
      ORDER BY COALESCE(r.last_run_at,r.next_run_at) DESC LIMIT 10`).all(pattern, pattern) as Row[];
    for (const row of routines) results.push({ id: String(row.id), kind: "routine", title: String(row.name), subtitle: `${row.bot_name} · Automation`, snippet: String(row.prompt).replace(/\s+/g, " ").trim().slice(0, 220), threadId: String(row.thread_id), botId: String(row.bot_id), createdAt: String(row.last_run_at || row.next_run_at || "1970-01-01T00:00:00.000Z") });
    const skills = this.db.prepare(`SELECT w.id,w.name,w.start_url,w.created_at,w.bot_id,b.name bot_name,t.id thread_id
      FROM taught_workflows w JOIN bots b ON b.id=w.bot_id JOIN threads t ON t.bot_id=b.id AND t.kind='direct'
      WHERE w.name LIKE ? ESCAPE '\\' OR w.start_url LIKE ? ESCAPE '\\' ORDER BY w.created_at DESC LIMIT 10`).all(pattern, pattern) as Row[];
    for (const row of skills) results.push({ id: String(row.id), kind: "skill", title: String(row.name), subtitle: `${row.bot_name} · Learned skill`, snippet: String(row.start_url), threadId: String(row.thread_id), botId: String(row.bot_id), createdAt: String(row.created_at) });
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, Math.max(1, Math.min(limit, 60)));
  }

  createAttachment(input: { threadId: string; messageId?: string | null; name: string; mime: string; size: number; storagePath: string; analysis?: AttachmentAnalysis; source?: Attachment["source"]; artifactKey?: string | null; revision?: number; replacesAttachmentId?: string | null }): Attachment {
    const id = path.basename(path.dirname(input.storagePath));
    const createdAt = now();
    const analysis = input.analysis;
    this.db.prepare("INSERT INTO attachments (id,thread_id,message_id,name,mime,detected_mime,kind,processing_status,summary,extracted_text,metadata_json,previewable,source,artifact_key,revision,replaces_attachment_id,size,storage_path,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, input.threadId, input.messageId ?? null, input.name, input.mime, analysis?.detectedMime || input.mime, analysis?.kind || "file", analysis?.processingStatus || "ready",
      analysis?.summary ?? null, analysis?.extractedText ?? null, JSON.stringify(analysis?.metadata || {}), analysis?.previewable ? 1 : 0, input.source || "upload", input.artifactKey ?? null,
      input.revision || 1, input.replacesAttachmentId ?? null, input.size, input.storagePath, createdAt,
    );
    return this.getAttachment(id)!;
  }

  private attachmentFromRow(row: Row): Attachment {
    const id = String(row.id);
    return {
      id, threadId: String(row.thread_id), messageId: row.message_id ? String(row.message_id) : null,
      name: String(row.name), mime: String(row.mime), detectedMime: String(row.detected_mime || row.mime),
      kind: String(row.kind || "file") as Attachment["kind"], processingStatus: String(row.processing_status || "ready") as Attachment["processingStatus"],
      summary: row.summary ? String(row.summary) : null, previewText: row.extracted_text ? String(row.extracted_text).slice(0, 4_000) : null,
      metadata: jsonRecord(row.metadata_json), previewUrl: asBoolean(row.previewable) ? `/api/attachments/${id}/preview` : null,
      source: String(row.source || "upload") as Attachment["source"], revision: Number(row.revision || 1), replacesAttachmentId: row.replaces_attachment_id ? String(row.replaces_attachment_id) : null,
      size: Number(row.size), url: `/api/attachments/${id}`,
      createdAt: String(row.created_at),
    };
  }

  getAttachment(id: string): Attachment | null {
    const row = this.db.prepare("SELECT * FROM attachments WHERE id=?").get(id) as Row | undefined;
    return row ? this.attachmentFromRow(row) : null;
  }

  attachmentFile(id: string): { attachment: Attachment; storagePath: string } | null {
    const row = this.db.prepare("SELECT * FROM attachments WHERE id=?").get(id) as Row | undefined;
    if (!row) return null;
    return { attachment: this.attachmentFromRow(row), storagePath: String(row.storage_path) };
  }

  attachmentText(id: string): string | null {
    const row = this.db.prepare("SELECT extracted_text FROM attachments WHERE id=?").get(id) as Row | undefined;
    return row?.extracted_text ? String(row.extracted_text) : null;
  }

  latestArtifact(threadId: string, artifactKey: string): { id: string; revision: number } | null {
    const row = this.db.prepare("SELECT id,revision FROM attachments WHERE thread_id=? AND artifact_key=? ORDER BY revision DESC,created_at DESC LIMIT 1").get(threadId, artifactKey) as Row | undefined;
    return row ? { id: String(row.id), revision: Number(row.revision || 1) } : null;
  }

  listMessageAttachments(messageId: string): Attachment[] {
    return (this.db.prepare("SELECT * FROM attachments WHERE message_id=? ORDER BY created_at ASC").all(messageId) as Row[]).map((row) => this.attachmentFromRow(row));
  }

  claimAttachments(ids: string[], messageId: string, threadId: string): Attachment[] {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];
    if (uniqueIds.length > 6) throw new Error("A message can include up to six files.");
    const placeholders = uniqueIds.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT * FROM attachments WHERE id IN (${placeholders}) AND thread_id=? AND message_id IS NULL`).all(...uniqueIds, threadId) as Row[];
    if (rows.length !== uniqueIds.length) throw new Error("One of those files is missing or already attached.");
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`UPDATE attachments SET message_id=? WHERE id IN (${placeholders})`).run(messageId, ...uniqueIds);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listMessageAttachments(messageId);
  }

  createRun(input: { threadId: string; botId: string; prompt: string; status: RunStatus; approvalReason?: string | null; parentRunId?: string | null; steeredFromRunId?: string | null; routineId?: string | null; automationEventId?: string | null; attachmentIds?: string[] }): Run {
    const id = randomUUID();
    const tracked = shouldTrackTask(input.prompt, Boolean(input.parentRunId || input.steeredFromRunId || input.routineId));
    this.db.prepare(`INSERT INTO runs (id,thread_id,bot_id,prompt,status,approval_reason,created_at,parent_run_id,steered_from_run_id,routine_id,automation_event_id,progress_at,attachment_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, input.threadId, input.botId, input.prompt, input.status, input.approvalReason ?? null, now(), input.parentRunId ?? null, input.steeredFromRunId ?? null, input.routineId ?? null, input.automationEventId ?? null, now(), JSON.stringify([...new Set(input.attachmentIds || [])].slice(0, 6)),
    );
    this.db.prepare(`UPDATE runs SET task_goal=?,task_deliverable=?,task_approval_boundary=?,task_required_apps_json='[]',task_stage=?,task_steps_json=?,verification_status='pending',verification_summary=NULL,verification_checks_json='[]' WHERE id=?`).run(
      tracked ? taskGoal(input.prompt) : null, tracked ? "A finished, reviewable result in this conversation" : null, input.approvalReason ?? null,
      input.status === "awaiting_approval" ? "waiting" : "queued", JSON.stringify(tracked ? startingTaskSteps() : []), id,
    );
    if (input.status === "awaiting_approval" && input.approvalReason) {
      const approval = this.createApproval({ runId: id, botId: input.botId, kind: "prompt", reason: input.approvalReason, actionLabel: input.prompt.slice(0, 180), action: { type: "run" } });
      this.db.prepare("UPDATE runs SET approval_id=? WHERE id=?").run(approval.id, id);
    }
    return this.getRun(id)!;
  }

  private runFromRow(row: Row): Run {
    const id = String(row.id);
    const activities = (this.db.prepare("SELECT * FROM activities WHERE run_id=? ORDER BY created_at ASC").all(id) as Row[]).map((activity) => ({
      id: String(activity.id), runId: String(activity.run_id), botId: String(activity.bot_id), kind: activity.kind as Activity["kind"],
      label: String(activity.label), detail: activity.detail ? String(activity.detail) : null, createdAt: String(activity.created_at),
    }));
    const steps = jsonArray<TaskStep>(row.task_steps_json).filter((step) => Number.isInteger(step.id) && typeof step.title === "string");
    const task: TaskContract = {
      tracked: Boolean(row.task_goal),
      goal: row.task_goal ? String(row.task_goal) : taskGoal(String(row.prompt)),
      deliverable: row.task_deliverable ? String(row.task_deliverable) : "A useful result in this conversation",
      approvalBoundary: row.task_approval_boundary ? String(row.task_approval_boundary) : null,
      requiredApps: jsonArray<string>(row.task_required_apps_json).filter((item) => typeof item === "string"),
      stage: (row.task_stage || "queued") as TaskStage,
      steps,
      verificationStatus: (row.verification_status || "pending") as TaskVerificationStatus,
      verificationSummary: row.verification_summary ? String(row.verification_summary) : null,
      verificationChecks: jsonArray<TaskVerificationCheck>(row.verification_checks_json).filter((check) => typeof check.label === "string" && typeof check.passed === "boolean"),
    };
    return {
      id, threadId: String(row.thread_id), botId: String(row.bot_id), botName: String(row.bot_name), botEmoji: String(row.bot_emoji),
      botMascot: String(row.bot_mascot || "orbit") as MascotKind, botColor: String(row.bot_color), parentRunId: row.parent_run_id ? String(row.parent_run_id) : null,
      steeredFromRunId: row.steered_from_run_id ? String(row.steered_from_run_id) : null, routineId: row.routine_id ? String(row.routine_id) : null,
      automationEventId: row.automation_event_id ? String(row.automation_event_id) : null,
      consultationPending: asBoolean(row.consultation_pending),
      attachmentIds: jsonArray<string>(row.attachment_ids_json).filter((id) => typeof id === "string"),
      prompt: String(row.prompt), status: row.status as RunStatus,
      approvalReason: row.approval_reason ? String(row.approval_reason) : null, approvalId: row.approval_id ? String(row.approval_id) : null,
      partialText: row.partial_text ? String(row.partial_text) : null, startedAt: row.started_at ? String(row.started_at) : null,
      finishedAt: row.finished_at ? String(row.finished_at) : null, progressAt: row.progress_at ? String(row.progress_at) : null,
      summary: row.summary ? String(row.summary) : null, error: row.error ? String(row.error) : null,
      inputTokens: Number(row.input_tokens || 0), outputTokens: Number(row.output_tokens || 0), reasoningTokens: Number(row.reasoning_tokens || 0),
      cacheReadTokens: Number(row.cache_read_tokens || 0), cost: Number(row.cost || 0), activities, task,
    };
  }

  private runSelect(where: string) {
    return `SELECT r.*,b.name bot_name,b.emoji bot_emoji,b.mascot bot_mascot,b.color bot_color FROM runs r JOIN bots b ON b.id=r.bot_id ${where}`;
  }

  getRun(id: string): Run | null {
    const row = this.db.prepare(this.runSelect("WHERE r.id=?")).get(id) as Row | undefined;
    return row ? this.runFromRow(row) : null;
  }

  listRuns(threadId: string): Run[] {
    const rows = this.db.prepare(this.runSelect("WHERE r.thread_id=? ORDER BY r.created_at DESC LIMIT 40")).all(threadId) as Row[];
    return rows.map((row) => this.runFromRow(row));
  }

  listStudioRuns(limit = 30): Run[] {
    const rows = this.db.prepare(this.runSelect(`WHERE r.status IN ('queued','running','awaiting_approval','waiting_for_teammate','failed') OR r.finished_at>=datetime('now','-1 day') ORDER BY CASE r.status WHEN 'awaiting_approval' THEN 0 WHEN 'waiting_for_teammate' THEN 1 WHEN 'running' THEN 2 WHEN 'queued' THEN 3 WHEN 'failed' THEN 4 ELSE 5 END,r.created_at DESC LIMIT ?`)).all(Math.max(1, Math.min(limit, 80))) as Row[];
    return rows.map((row) => this.runFromRow(row));
  }

  runningRun(threadId: string, botId: string): Run | null {
    const row = this.db.prepare(this.runSelect("WHERE r.thread_id=? AND r.bot_id=? AND r.status IN ('running','waiting_for_teammate') ORDER BY r.created_at DESC LIMIT 1")).get(threadId, botId) as Row | undefined;
    return row ? this.runFromRow(row) : null;
  }

  nextQueuedRun(excludedBotIds: string[]): Run | null {
    const placeholders = excludedBotIds.length ? excludedBotIds.map(() => "?").join(",") : "''";
    const row = this.db.prepare(this.runSelect(`WHERE r.status='queued' AND r.bot_id NOT IN (${placeholders}) ORDER BY r.created_at ASC LIMIT 1`)).get(...excludedBotIds) as Row | undefined;
    return row ? this.runFromRow(row) : null;
  }

  updateRun(id: string, patch: Partial<{
    status: RunStatus; approvalReason: string | null; approvalId: string | null; startedAt: string | null; finishedAt: string | null;
    progressAt: string | null; partialText: string | null; summary: string | null; error: string | null; sessionId: string | null;
    inputTokens: number; outputTokens: number; reasoningTokens: number; cacheReadTokens: number; cost: number; taskStage: TaskStage;
  }>) {
    const current = this.db.prepare("SELECT * FROM runs WHERE id=?").get(id) as Row | undefined;
    if (!current) return;
    const value = <K extends keyof typeof patch>(key: K, column: string) => patch[key] === undefined ? current[column] : patch[key];
    this.db.prepare(`UPDATE runs SET status=?,approval_reason=?,approval_id=?,started_at=?,finished_at=?,progress_at=?,partial_text=?,summary=?,error=?,session_id=?,input_tokens=?,output_tokens=?,reasoning_tokens=?,cache_read_tokens=?,cost=?,task_stage=? WHERE id=?`).run(
      value("status", "status"), value("approvalReason", "approval_reason"), value("approvalId", "approval_id"), value("startedAt", "started_at"),
      value("finishedAt", "finished_at"), value("progressAt", "progress_at"), value("partialText", "partial_text"), value("summary", "summary"),
      value("error", "error"), value("sessionId", "session_id"), value("inputTokens", "input_tokens"), value("outputTokens", "output_tokens"),
      value("reasoningTokens", "reasoning_tokens"), value("cacheReadTokens", "cache_read_tokens"), value("cost", "cost"), value("taskStage", "task_stage"), id,
    );
    if (patch.status === "running" || patch.status === "completed") this.db.prepare("UPDATE bots SET last_active_at=? WHERE id=?").run(now(), current.bot_id);
    const statusChanged = patch.status !== undefined && patch.status !== current.status;
    if (statusChanged && current.automation_event_id) {
      const eventStatus: AutomationEventStatus | null = patch.status === "awaiting_approval" ? "waiting" : ["queued", "running", "completed", "failed", "cancelled"].includes(patch.status!) ? patch.status as AutomationEventStatus : null;
      if (eventStatus) this.db.prepare("UPDATE automation_events SET status=?,finished_at=?,error=? WHERE id=?").run(
        eventStatus, ["completed", "failed", "cancelled"].includes(eventStatus) ? (patch.finishedAt || now()) : null,
        eventStatus === "failed" ? (patch.error || null) : null, current.automation_event_id,
      );
    }
    if (statusChanged && (patch.status === "completed" || patch.status === "failed") && current.routine_id) {
      if (patch.status === "completed") {
        this.db.prepare("UPDATE routines SET last_status='completed',run_count=run_count+1,consecutive_failures=0,last_error=NULL,last_success_at=? WHERE id=?").run(patch.finishedAt || now(), current.routine_id);
        this.db.prepare("UPDATE automation_alerts SET resolved_at=? WHERE routine_id=? AND resolved_at IS NULL AND kind IN ('failure','approval')").run(now(), current.routine_id);
      } else {
        const routine = this.getRoutine(String(current.routine_id));
        const failures = (routine?.consecutiveFailures || 0) + 1;
        const error = patch.error || "The automation stopped before it could finish.";
        const pause = failures >= 3;
        this.db.prepare("UPDATE routines SET last_status='failed',run_count=run_count+1,consecutive_failures=?,last_error=?,enabled=CASE WHEN ? THEN 0 ELSE enabled END,next_run_at=CASE WHEN ? THEN NULL ELSE next_run_at END,paused_reason=CASE WHEN ? THEN ? ELSE paused_reason END WHERE id=?").run(
          failures, error, pause ? 1 : 0, pause ? 1 : 0, pause ? 1 : 0, pause ? "Paused after three consecutive failures" : null, current.routine_id,
        );
        this.createAutomationAlert({
          routineId: String(current.routine_id), runId: id, eventId: current.automation_event_id ? String(current.automation_event_id) : null, kind: "failure",
          message: pause ? `${routine?.name || "This automation"} was paused after three failed attempts.` : `${routine?.name || "This automation"} needs another try: ${error}`,
        });
      }
    }
    if (statusChanged && patch.status === "awaiting_approval" && current.routine_id) {
      const routine = this.getRoutine(String(current.routine_id));
      this.createAutomationAlert({ routineId: String(current.routine_id), runId: id, eventId: current.automation_event_id ? String(current.automation_event_id) : null, kind: "approval", message: `${routine?.name || "An automation"} is waiting for your approval.` });
    }
  }

  setRunPrompt(id: string, prompt: string) {
    this.db.prepare("UPDATE runs SET prompt=?,progress_at=? WHERE id=?").run(prompt, now(), id);
  }

  markRunConsultationPending(id: string) {
    this.db.prepare("UPDATE runs SET consultation_pending=1,progress_at=? WHERE id=?").run(now(), id);
  }

  pauseRunForConsultation(id: string): Run | null {
    this.db.prepare("UPDATE runs SET status='waiting_for_teammate',task_stage='waiting',partial_text=NULL,summary=NULL,error=NULL,finished_at=NULL,progress_at=? WHERE id=? AND consultation_pending=1").run(now(), id);
    return this.getRun(id);
  }

  listChildRuns(parentRunId: string): Run[] {
    return (this.db.prepare(this.runSelect("WHERE r.parent_run_id=? ORDER BY r.created_at ASC")).all(parentRunId) as Row[]).map((row) => this.runFromRow(row));
  }

  hasPendingChildRuns(parentRunId: string): boolean {
    const row = this.db.prepare("SELECT EXISTS(SELECT 1 FROM runs WHERE parent_run_id=? AND status IN ('queued','running','awaiting_approval','waiting_for_teammate')) present").get(parentRunId) as Row | undefined;
    return asBoolean(row?.present);
  }

  readyConsultationCoordinators(): Run[] {
    const rows = this.db.prepare(this.runSelect("WHERE r.status='waiting_for_teammate' AND r.consultation_pending=1 AND NOT EXISTS(SELECT 1 FROM runs child WHERE child.parent_run_id=r.id AND child.status IN ('queued','running','awaiting_approval','waiting_for_teammate')) ORDER BY r.created_at ASC")).all() as Row[];
    return rows.map((row) => this.runFromRow(row));
  }

  resumeRunAfterConsultation(id: string, prompt: string): Run | null {
    this.db.prepare("UPDATE runs SET prompt=?,status='queued',consultation_pending=0,task_stage='working',partial_text=NULL,summary=NULL,error=NULL,finished_at=NULL,progress_at=? WHERE id=? AND status='waiting_for_teammate'").run(prompt, now(), id);
    return this.getRun(id);
  }

  startRunTask(id: string): TaskContract | null {
    const run = this.getRun(id);
    if (!run) return null;
    const steps = run.task.steps.length ? run.task.steps : startingTaskSteps();
    if (!steps.some((step) => step.status === "active")) {
      const first = steps.find((step) => step.status === "pending");
      if (first) first.status = "active";
    }
    const stage: TaskStage = run.task.stage === "queued" ? "planning" : run.task.stage === "waiting" ? "working" : run.task.stage;
    this.db.prepare("UPDATE runs SET task_stage=?,task_steps_json=?,progress_at=? WHERE id=?").run(stage, JSON.stringify(steps), now(), id);
    return this.getRun(id)!.task;
  }

  setRunTaskPlan(id: string, input: { goal: string; deliverable: string; approvalBoundary?: string | null; requiredApps?: string[]; steps: string[] }): TaskContract | null {
    if (!this.getRun(id)) return null;
    const titles = input.steps.map((item) => item.replace(/\s+/g, " ").trim().slice(0, 140)).filter(Boolean).slice(0, 8);
    if (!titles.length) throw new Error("Add at least one meaningful step.");
    const steps: TaskStep[] = titles.map((title, index) => ({ id: index + 1, title, status: index === 0 ? "active" : "pending", detail: null }));
    const requiredApps = [...new Set((input.requiredApps || []).map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    this.db.prepare(`UPDATE runs SET task_goal=?,task_deliverable=?,task_approval_boundary=?,task_required_apps_json=?,task_stage='working',task_steps_json=?,verification_status='pending',verification_summary=NULL,verification_checks_json='[]',progress_at=? WHERE id=?`).run(
      input.goal.replace(/\s+/g, " ").trim().slice(0, 240), input.deliverable.replace(/\s+/g, " ").trim().slice(0, 240),
      input.approvalBoundary?.replace(/\s+/g, " ").trim().slice(0, 240) || null, JSON.stringify(requiredApps), JSON.stringify(steps), now(), id,
    );
    return this.getRun(id)!.task;
  }

  updateRunTaskStep(id: string, stepId: number, status: TaskStepStatus, detail?: string | null): TaskContract | null {
    const run = this.getRun(id);
    if (!run) return null;
    const steps = run.task.steps.map((step) => ({ ...step }));
    const step = steps.find((item) => item.id === stepId);
    if (!step) throw new Error("That task step does not exist.");
    if (status === "active") for (const item of steps) if (item.status === "active") item.status = "pending";
    step.status = status;
    step.detail = detail?.replace(/\s+/g, " ").trim().slice(0, 220) || null;
    let stage: TaskStage = status === "blocked" ? "blocked" : "working";
    if (status === "completed" && !steps.some((item) => item.status === "active")) {
      const next = steps.find((item) => item.status === "pending");
      if (next) next.status = "active";
    }
    if (steps.every((item) => ["completed", "skipped"].includes(item.status))) stage = "checking";
    this.db.prepare("UPDATE runs SET task_steps_json=?,task_stage=?,progress_at=? WHERE id=?").run(JSON.stringify(steps), stage, now(), id);
    return this.getRun(id)!.task;
  }

  verifyRunTask(id: string, input: { status: TaskVerificationStatus; summary: string; checks: TaskVerificationCheck[] }): TaskContract | null {
    const run = this.getRun(id);
    if (!run) return null;
    const checks = input.checks.map((check) => ({ label: check.label.replace(/\s+/g, " ").trim().slice(0, 180), passed: check.passed })).filter((check) => check.label).slice(0, 8);
    const status: TaskVerificationStatus = input.status === "passed" && checks.some((check) => !check.passed) ? "partial" : input.status;
    const steps = run.task.steps.map((step) => status === "passed" && !["blocked", "skipped"].includes(step.status) ? { ...step, status: "completed" as const } : step);
    const stage: TaskStage = status === "blocked" ? "blocked" : "checking";
    this.db.prepare("UPDATE runs SET verification_status=?,verification_summary=?,verification_checks_json=?,task_steps_json=?,task_stage=?,progress_at=? WHERE id=?").run(
      status, input.summary.replace(/\s+/g, " ").trim().slice(0, 500), JSON.stringify(checks), JSON.stringify(steps), stage, now(), id,
    );
    return this.getRun(id)!.task;
  }

  finishRunTask(id: string, outcome: "completed" | "failed" | "cancelled", detail?: string | null): TaskContract | null {
    const run = this.getRun(id);
    if (!run) return null;
    const steps = run.task.steps.map((step) => ({ ...step }));
    let verificationStatus = run.task.verificationStatus;
    let verificationSummary = run.task.verificationSummary;
    let checks = run.task.verificationChecks;
    let stage: TaskStage = "done";
    if (outcome === "completed") {
      if (verificationStatus === "pending") {
        verificationStatus = "partial";
        verificationSummary = "The result is ready, but it could not be fully checked automatically.";
        checks = [{ label: "A result was created", passed: true }, { label: "Final checks completed", passed: false }];
      }
      for (const step of steps) {
        if (step.status === "active") step.status = "completed";
        else if (step.status === "pending") step.status = verificationStatus === "passed" ? "completed" : "skipped";
      }
    } else {
      stage = "blocked";
      if (verificationStatus === "pending") {
        verificationStatus = "blocked";
        verificationSummary = outcome === "cancelled" ? "Stopped by the user." : (detail || "The work stopped before it could be checked.").slice(0, 500);
        checks = [];
      }
      const active = steps.find((step) => step.status === "active");
      if (active) { active.status = "blocked"; active.detail = verificationSummary; }
    }
    this.db.prepare("UPDATE runs SET task_stage=?,task_steps_json=?,verification_status=?,verification_summary=?,verification_checks_json=?,progress_at=? WHERE id=?").run(
      stage, JSON.stringify(steps), verificationStatus, verificationSummary, JSON.stringify(checks), now(), id,
    );
    return this.getRun(id)!.task;
  }

  addActivity(input: Omit<Activity, "id" | "createdAt">): Activity {
    const activity: Activity = { ...input, id: randomUUID(), createdAt: now() };
    this.db.prepare("INSERT INTO activities (id,run_id,bot_id,kind,label,detail,created_at) VALUES (?,?,?,?,?,?,?)").run(activity.id, activity.runId, activity.botId, activity.kind, activity.label, activity.detail, activity.createdAt);
    this.db.prepare("UPDATE runs SET progress_at=? WHERE id=?").run(activity.createdAt, activity.runId);
    return activity;
  }

  botSessionFingerprint(botId: string): string {
    const bot = this.getBot(botId);
    const connectors = this.listConnectors().map((connection) => ({
      id: connection.id, connected: connection.connected, accountEmail: connection.accountEmail, scopes: [...connection.scopes].sort(),
      access: this.listBotConnectorAccess(connection.id).filter((item) => item.botId === botId).map((item) => ({ service: item.service, canRead: item.canRead, canSend: item.canSend })),
    }));
    const codeProjects = this.listCodeProjects(botId).map((project) => ({ id: project.id, canRead: true, access: project.access.find((item) => item.botId === botId) || null }));
    const serviceErrors = this.listConnectorServiceErrors().map((item) => item.service).sort();
    return JSON.stringify({
      bot: bot ? { name: bot.name, role: bot.role, instructions: bot.instructions, model: bot.model, providerInstanceId: bot.providerInstanceId, computerEnabled: bot.computerEnabled, browserEnabled: bot.browserEnabled } : null,
      macAccessEnabled: this.getStudioSettings().macAccessEnabled,
      connectors, serviceErrors,
      codeProjects,
    });
  }

  rememberSessionCapabilities(sessionId: string, capabilityFingerprint: string) {
    this.db.prepare(`INSERT INTO model_sessions (session_id,capability_fingerprint,updated_at) VALUES (?,?,?)
      ON CONFLICT(session_id) DO UPDATE SET capability_fingerprint=excluded.capability_fingerprint,updated_at=excluded.updated_at`).run(sessionId, capabilityFingerprint, now());
  }

  previousSession(threadId: string, botId: string, capabilityFingerprint?: string): string | null {
    const row = capabilityFingerprint
      ? this.db.prepare(`SELECT r.session_id FROM runs r JOIN model_sessions s ON s.session_id=r.session_id
          WHERE r.thread_id=? AND r.bot_id=? AND r.session_id IS NOT NULL AND s.capability_fingerprint=? ORDER BY r.created_at DESC LIMIT 1`).get(threadId, botId, capabilityFingerprint) as Row | undefined
      : this.db.prepare("SELECT session_id FROM runs WHERE thread_id=? AND bot_id=? AND session_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(threadId, botId) as Row | undefined;
    return row?.session_id ? String(row.session_id) : null;
  }

  createApproval(input: { runId: string; botId: string; kind: Approval["kind"]; reason: string; actionLabel: string; action?: unknown }): Approval {
    const id = randomUUID();
    const run = this.getRun(input.runId);
    this.db.prepare("INSERT INTO approvals (id,run_id,bot_id,kind,reason,action_label,action_json,status,created_at) VALUES (?,?,?,?,?,?,?,'pending',?)").run(
      id, input.runId, input.botId, input.kind, input.reason, input.actionLabel, input.action ? JSON.stringify(input.action) : null, now(),
    );
    this.db.prepare("UPDATE runs SET status='awaiting_approval',approval_reason=?,approval_id=?,task_stage='waiting',progress_at=? WHERE id=?").run(input.reason, id, now(), input.runId);
    if (run?.automationEventId) this.db.prepare("UPDATE automation_events SET status='waiting' WHERE id=?").run(run.automationEventId);
    if (run?.routineId) this.createAutomationAlert({ routineId: run.routineId, runId: run.id, eventId: run.automationEventId, kind: "approval", message: `${this.getRoutine(run.routineId)?.name || "An automation"} is waiting for your approval.` });
    return this.getApproval(id)!;
  }

  private approvalFromRow(row: Row): Approval {
    return {
      id: String(row.id), runId: String(row.run_id), botId: String(row.bot_id), botName: String(row.bot_name), kind: row.kind as Approval["kind"],
      reason: String(row.reason), actionLabel: String(row.action_label), status: row.status as Approval["status"],
      createdAt: String(row.created_at), decidedAt: row.decided_at ? String(row.decided_at) : null,
    };
  }

  getApproval(id: string): Approval | null {
    const row = this.db.prepare("SELECT a.*,b.name bot_name FROM approvals a JOIN bots b ON b.id=a.bot_id WHERE a.id=?").get(id) as Row | undefined;
    return row ? this.approvalFromRow(row) : null;
  }

  getApprovalAction(id: string): unknown {
    const row = this.db.prepare("SELECT action_json FROM approvals WHERE id=?").get(id) as Row | undefined;
    if (!row?.action_json) return null;
    try { return JSON.parse(String(row.action_json)); } catch { return null; }
  }

  listApprovals(): Approval[] {
    return (this.db.prepare("SELECT a.*,b.name bot_name FROM approvals a JOIN bots b ON b.id=a.bot_id WHERE a.status='pending' ORDER BY a.created_at ASC").all() as Row[]).map((row) => this.approvalFromRow(row));
  }

  decideApproval(id: string, decision: "approved" | "denied"): Approval | null {
    const approval = this.getApproval(id);
    if (!approval || approval.status !== "pending") return null;
    this.db.prepare("UPDATE approvals SET status=?,decided_at=? WHERE id=?").run(decision, now(), id);
    if (decision === "approved") {
      this.updateRun(approval.runId, { status: "queued", approvalReason: null, taskStage: "working", progressAt: now() });
      this.db.prepare("UPDATE automation_alerts SET resolved_at=? WHERE run_id=? AND kind='approval' AND resolved_at IS NULL").run(now(), approval.runId);
    }
    else {
      this.updateRun(approval.runId, { status: "cancelled", finishedAt: now(), taskStage: "blocked", progressAt: now() });
      this.finishRunTask(approval.runId, "cancelled");
    }
    return this.getApproval(id);
  }

  cancelRun(id: string): Run | null {
    const run = this.getRun(id);
    if (!run || ["completed", "failed", "cancelled"].includes(run.status)) return null;
    const approval = run.approvalId ? this.getApproval(run.approvalId) : null;
    if (approval?.status === "pending") this.decideApproval(approval.id, "denied");
    else {
      this.updateRun(run.id, { status: "cancelled", finishedAt: now(), taskStage: "blocked" });
      this.finishRunTask(run.id, "cancelled");
    }
    return this.getRun(id);
  }

  listProviders(): ProviderInstance[] {
    return (this.db.prepare("SELECT * FROM provider_instances ORDER BY created_at ASC").all() as Row[]).map((row) => ({
      id: String(row.id), ownerId: String(row.owner_id), provider: row.provider as ProviderInstance["provider"], name: String(row.name),
      authMode: row.auth_mode as ProviderInstance["authMode"], envName: row.env_name ? String(row.env_name) : null,
      runtime: (row.runtime || "opencode") as ProviderInstance["runtime"], hasSecret: Boolean(row.secret_ciphertext),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
  }

  getProvider(id: string): ProviderInstance | null {
    return this.listProviders().find((provider) => provider.id === id) || null;
  }

  providerForBot(botId: string): ProviderInstance | null {
    const bot = this.getBot(botId);
    return bot?.providerInstanceId ? this.getProvider(bot.providerInstanceId) : null;
  }

  upsertProvider(input: { id?: string; name: string; provider?: ProviderInstance["provider"]; authMode: ProviderInstance["authMode"]; runtime?: ProviderInstance["runtime"]; envName?: string | null; secret?: string | null }): ProviderInstance {
    const id = input.id || randomUUID();
    const existing = this.db.prepare("SELECT * FROM provider_instances WHERE id=?").get(id) as Row | undefined;
    const encrypted = input.secret ? this.vault.encrypt(input.secret) : existing?.secret_ciphertext || null;
    const at = now();
    this.db.prepare(`INSERT INTO provider_instances (id,owner_id,provider,name,auth_mode,runtime,env_name,secret_ciphertext,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,provider=excluded.provider,auth_mode=excluded.auth_mode,runtime=excluded.runtime,env_name=excluded.env_name,secret_ciphertext=excluded.secret_ciphertext,updated_at=excluded.updated_at`).run(
      id, DEFAULT_OWNER, input.provider || "custom", input.name, input.authMode, input.runtime || "opencode", input.envName || null, encrypted, existing?.created_at || at, at,
    );
    return this.listProviders().find((provider) => provider.id === id)!;
  }

  providerEnvironment(botId: string): Record<string, string> {
    const row = this.db.prepare(`SELECT p.env_name,p.secret_ciphertext FROM bots b JOIN provider_instances p ON p.id=b.provider_instance_id WHERE b.id=?`).get(botId) as Row | undefined;
    if (!row?.env_name || !row.secret_ciphertext) return {};
    return { [String(row.env_name)]: this.vault.decrypt(String(row.secret_ciphertext)) };
  }

  providerEnvironmentById(providerId: string): Record<string, string> {
    const row = this.db.prepare("SELECT env_name,secret_ciphertext FROM provider_instances WHERE id=?").get(providerId) as Row | undefined;
    if (!row?.env_name || !row.secret_ciphertext) return {};
    return { [String(row.env_name)]: this.vault.decrypt(String(row.secret_ciphertext)) };
  }

  private connectorFromRow(row: Row): ConnectorConnection {
    let scopes: string[] = [];
    try { scopes = JSON.parse(String(row.scopes_json || "[]")) as string[]; } catch { /* keep an empty scope list */ }
    return {
      id: String(row.id), ownerId: String(row.owner_id), kind: row.kind as ConnectorConnection["kind"], name: String(row.name),
      configured: Boolean(row.client_id), connected: row.status === "connected" && (row.kind === "github_cli" || Boolean(row.credentials_ciphertext || row.access_token_ciphertext || row.refresh_token_ciphertext)),
      accountEmail: row.account_email ? String(row.account_email) : null, scopes, status: row.status as ConnectorConnection["status"],
      lastError: row.last_error ? String(row.last_error) : null, lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  listConnectors(): ConnectorConnection[] {
    return (this.db.prepare("SELECT * FROM connectors ORDER BY created_at ASC").all() as Row[]).map((row) => this.connectorFromRow(row));
  }

  getConnector(id: string): ConnectorConnection | null {
    const row = this.db.prepare("SELECT * FROM connectors WHERE id=?").get(id) as Row | undefined;
    return row ? this.connectorFromRow(row) : null;
  }

  configureOAuthConnector(input: { id: "slack" | "notion"; kind: "slack_oauth" | "notion_oauth"; name: string; clientId: string; clientSecret: string }): ConnectorConnection {
    const existing = this.db.prepare("SELECT * FROM connectors WHERE id=?").get(input.id) as Row | undefined;
    const changedClient = Boolean(existing?.client_id && String(existing.client_id) !== input.clientId);
    const at = now(), encryptedSecret = this.vault.encrypt(input.clientSecret);
    const status = changedClient || !existing?.credentials_ciphertext ? "configured" : String(existing.status || "configured");
    this.db.prepare(`INSERT INTO connectors
      (id,owner_id,kind,name,client_id,client_secret_ciphertext,credentials_ciphertext,scopes_json,account_email,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,NULL,'[]',NULL,?,?,?)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,client_id=excluded.client_id,client_secret_ciphertext=excluded.client_secret_ciphertext,
      credentials_ciphertext=CASE WHEN ? THEN NULL ELSE connectors.credentials_ciphertext END,
      scopes_json=CASE WHEN ? THEN '[]' ELSE connectors.scopes_json END,account_email=CASE WHEN ? THEN NULL ELSE connectors.account_email END,
      status=?,last_error=NULL,updated_at=excluded.updated_at`).run(
      input.id, DEFAULT_OWNER, input.kind, input.name, input.clientId, encryptedSecret, status, existing?.created_at || at, at,
      changedClient ? 1 : 0, changedClient ? 1 : 0, changedClient ? 1 : 0, status,
    );
    return this.getConnector(input.id)!;
  }

  oauthConnectorCredentials<T extends Record<string, unknown> = Record<string, unknown>>(id: "slack" | "notion"): { clientId: string; clientSecret: string; credentials: T | null } | null {
    const row = this.db.prepare("SELECT client_id,client_secret_ciphertext,credentials_ciphertext FROM connectors WHERE id=?").get(id) as Row | undefined;
    if (!row?.client_id || !row.client_secret_ciphertext) return null;
    let credentials: T | null = null;
    if (row.credentials_ciphertext) {
      try { credentials = JSON.parse(this.vault.decrypt(String(row.credentials_ciphertext))) as T; } catch { credentials = null; }
    }
    return { clientId: String(row.client_id), clientSecret: this.vault.decrypt(String(row.client_secret_ciphertext)), credentials };
  }

  completeOAuthConnector(id: "slack" | "notion", credentials: Record<string, unknown>, accountName: string, scopes: string[]): ConnectorConnection {
    if (!this.getConnector(id)) throw new Error(`Configure ${id === "slack" ? "Slack" : "Notion"} before connecting it.`);
    this.db.prepare("UPDATE connectors SET credentials_ciphertext=?,account_email=?,scopes_json=?,status='connected',last_error=NULL,last_used_at=?,updated_at=? WHERE id=?").run(
      this.vault.encrypt(JSON.stringify(credentials)), accountName.slice(0, 200), JSON.stringify([...new Set(scopes)]), now(), now(), id,
    );
    return this.getConnector(id)!;
  }

  updateOAuthConnectorCredentials(id: "slack" | "notion", credentials: Record<string, unknown>): ConnectorConnection {
    this.db.prepare("UPDATE connectors SET credentials_ciphertext=?,status='connected',last_error=NULL,last_used_at=?,updated_at=? WHERE id=?").run(
      this.vault.encrypt(JSON.stringify(credentials)), now(), now(), id,
    );
    const connector = this.getConnector(id);
    if (!connector) throw new Error("That connector is not configured.");
    return connector;
  }

  disconnectOAuthConnector(id: "slack" | "notion"): ConnectorConnection | null {
    this.db.prepare("UPDATE connectors SET credentials_ciphertext=NULL,scopes_json='[]',account_email=NULL,status=CASE WHEN client_id IS NULL THEN 'unconfigured' ELSE 'configured' END,last_error=NULL,updated_at=? WHERE id=?").run(now(), id);
    return this.getConnector(id);
  }

  configureGoogleConnector(input: { clientId: string; clientSecret?: string | null }): ConnectorConnection {
    const id = "google-workspace", existing = this.db.prepare("SELECT * FROM connectors WHERE id=?").get(id) as Row | undefined;
    const changedClient = Boolean(existing?.client_id && String(existing.client_id) !== input.clientId);
    const encryptedSecret = input.clientSecret ? this.vault.encrypt(input.clientSecret) : changedClient ? null : existing?.client_secret_ciphertext || null;
    const at = now(), status = changedClient || !existing?.access_token_ciphertext ? "configured" : existing.status || "configured";
    this.db.prepare(`INSERT INTO connectors
      (id,owner_id,kind,name,client_id,client_secret_ciphertext,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,scopes_json,account_email,status,last_error,last_used_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,NULL,NULL,NULL,'[]',NULL,?,NULL,NULL,?,?)
      ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,client_secret_ciphertext=excluded.client_secret_ciphertext,
      access_token_ciphertext=CASE WHEN ? THEN NULL ELSE connectors.access_token_ciphertext END,
      refresh_token_ciphertext=CASE WHEN ? THEN NULL ELSE connectors.refresh_token_ciphertext END,
      token_expires_at=CASE WHEN ? THEN NULL ELSE connectors.token_expires_at END,
      scopes_json=CASE WHEN ? THEN '[]' ELSE connectors.scopes_json END,
      account_email=CASE WHEN ? THEN NULL ELSE connectors.account_email END,status=?,last_error=NULL,updated_at=excluded.updated_at`).run(
      id, DEFAULT_OWNER, "google_workspace", "Google Workspace", input.clientId, encryptedSecret, status, existing?.created_at || at, at,
      changedClient ? 1 : 0, changedClient ? 1 : 0, changedClient ? 1 : 0, changedClient ? 1 : 0, changedClient ? 1 : 0, status,
    );
    return this.getConnector(id)!;
  }

  googleConnectorCredentials(): { clientId: string; clientSecret: string | null; accessToken: string | null; refreshToken: string | null; expiresAt: string | null } | null {
    const row = this.db.prepare("SELECT * FROM connectors WHERE id='google-workspace'").get() as Row | undefined;
    if (!row?.client_id) return null;
    const decrypt = (value: string | number | null | undefined) => value ? this.vault.decrypt(String(value)) : null;
    return {
      clientId: String(row.client_id), clientSecret: decrypt(row.client_secret_ciphertext), accessToken: decrypt(row.access_token_ciphertext),
      refreshToken: decrypt(row.refresh_token_ciphertext), expiresAt: row.token_expires_at ? String(row.token_expires_at) : null,
    };
  }

  completeGoogleConnector(input: { accessToken: string; refreshToken?: string | null; expiresAt: string; scopes: string[]; accountEmail: string }): ConnectorConnection {
    const existing = this.db.prepare("SELECT refresh_token_ciphertext FROM connectors WHERE id='google-workspace'").get() as Row | undefined;
    if (!existing) throw new Error("Configure Google Workspace before connecting it.");
    const refresh = input.refreshToken ? this.vault.encrypt(input.refreshToken) : existing.refresh_token_ciphertext;
    this.db.prepare(`UPDATE connectors SET access_token_ciphertext=?,refresh_token_ciphertext=?,token_expires_at=?,scopes_json=?,account_email=?,status='connected',last_error=NULL,last_used_at=?,updated_at=? WHERE id='google-workspace'`).run(
      this.vault.encrypt(input.accessToken), refresh, input.expiresAt, JSON.stringify([...new Set(input.scopes)]), input.accountEmail, now(), now(),
    );
    for (const bot of this.listBots()) {
      this.setBotConnectorAccess(bot.id, { canRead: true, canSend: true }, "gmail");
      this.setBotConnectorAccess(bot.id, { canRead: true, canSend: false }, "google-drive");
      this.setBotConnectorAccess(bot.id, { canRead: true, canSend: false }, "google-calendar");
    }
    this.clearConnectorServiceError("gmail");
    return this.getConnector("google-workspace")!;
  }

  updateGoogleAccessToken(accessToken: string, expiresAt: string, refreshToken?: string | null) {
    const existing = this.db.prepare("SELECT refresh_token_ciphertext FROM connectors WHERE id='google-workspace'").get() as Row | undefined;
    if (!existing) throw new Error("Google Workspace is not configured.");
    const refresh = refreshToken ? this.vault.encrypt(refreshToken) : existing.refresh_token_ciphertext;
    this.db.prepare(`UPDATE connectors SET access_token_ciphertext=?,refresh_token_ciphertext=?,token_expires_at=?,status='connected',last_error=NULL,last_used_at=?,updated_at=? WHERE id='google-workspace'`).run(
      this.vault.encrypt(accessToken), refresh, expiresAt, now(), now(),
    );
  }

  markConnectorUsed(id: string) {
    this.db.prepare("UPDATE connectors SET last_used_at=?,updated_at=? WHERE id=?").run(now(), now(), id);
  }

  markConnectorError(id: string, error: string) {
    this.db.prepare("UPDATE connectors SET status='needs_attention',last_error=?,updated_at=? WHERE id=?").run(error.slice(0, 600), now(), id);
  }

  markConnectorHealthy(id: string) {
    this.db.prepare("UPDATE connectors SET status='connected',last_error=NULL,last_used_at=?,updated_at=? WHERE id=? AND credentials_ciphertext IS NOT NULL").run(now(), now(), id);
    return this.getConnector(id);
  }

  restoreGoogleConnectorAfterStaleCallback(): ConnectorConnection | null {
    this.db.prepare(`UPDATE connectors SET status='connected',last_error=NULL,updated_at=?
      WHERE id='google-workspace' AND status='needs_attention' AND last_error LIKE 'That Google sign-in expired.%'
      AND account_email IS NOT NULL AND (access_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)`).run(now());
    return this.getConnector("google-workspace");
  }

  restoreGoogleConnectorAfterServiceError(): ConnectorConnection | null {
    this.db.prepare(`UPDATE connectors SET status='connected',last_error=NULL,updated_at=?
      WHERE id='google-workspace' AND status='needs_attention'
      AND last_error LIKE '%API has not been used in project%before or it is disabled%'
      AND account_email IS NOT NULL AND (access_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)`).run(now());
    return this.getConnector("google-workspace");
  }

  markConnectorServiceError(service: GoogleConnectorService, error: string, connectorId = "google-workspace") {
    this.db.prepare(`INSERT INTO connector_service_errors (connector_id,service,last_error,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(connector_id,service) DO UPDATE SET last_error=excluded.last_error,updated_at=excluded.updated_at`).run(connectorId, service, error.slice(0, 600), now());
  }

  clearConnectorServiceError(service: GoogleConnectorService, connectorId = "google-workspace") {
    this.db.prepare("DELETE FROM connector_service_errors WHERE connector_id=? AND service=?").run(connectorId, service);
  }

  listConnectorServiceErrors(connectorId = "google-workspace"): Array<{ service: GoogleConnectorService; error: string }> {
    return (this.db.prepare("SELECT service,last_error FROM connector_service_errors WHERE connector_id=? ORDER BY updated_at DESC").all(connectorId) as Row[]).map((row) => ({ service: row.service as GoogleConnectorService, error: String(row.last_error) }));
  }

  disconnectGoogleConnector(): ConnectorConnection | null {
    this.db.prepare(`UPDATE connectors SET access_token_ciphertext=NULL,refresh_token_ciphertext=NULL,token_expires_at=NULL,scopes_json='[]',account_email=NULL,status=CASE WHEN client_id IS NULL THEN 'unconfigured' ELSE 'configured' END,last_error=NULL,updated_at=? WHERE id='google-workspace'`).run(now());
    this.db.prepare("DELETE FROM connector_service_errors WHERE connector_id='google-workspace'").run();
    return this.getConnector("google-workspace");
  }

  ensureLocalConnector(id: string, kind: ConnectorConnection["kind"], name: string, connected: boolean, accountLogin: string | null = null): ConnectorConnection {
    const existing = this.getConnector(id), expectedStatus = connected ? "connected" : "configured";
    if (existing && existing.kind === kind && existing.name === name && existing.status === expectedStatus && existing.accountEmail === accountLogin) return existing;
    const at = now();
    this.db.prepare(`INSERT INTO connectors
      (id,owner_id,kind,name,client_id,scopes_json,account_email,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'[]',?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,account_email=excluded.account_email,status=excluded.status,updated_at=excluded.updated_at`).run(
      id, DEFAULT_OWNER, kind, name, "local-cli", accountLogin, expectedStatus, at, at,
    );
    return this.getConnector(id)!;
  }

  listBotConnectorAccess(connectorId = "google-workspace"): BotConnectorAccess[] {
    return (this.db.prepare("SELECT * FROM bot_connector_access WHERE connector_id=? ORDER BY rowid").all(connectorId) as Row[]).map((row) => ({
      botId: String(row.bot_id), connectorId: String(row.connector_id), service: row.service as ConnectorServiceId, canRead: asBoolean(row.can_read),
      canSend: asBoolean(row.can_send), updatedAt: String(row.updated_at),
    }));
  }

  getBotConnectorAccess(botId: string, service: ConnectorServiceId = "gmail", connectorId = "google-workspace"): BotConnectorAccess | null {
    return this.listBotConnectorAccess(connectorId).find((access) => access.botId === botId && access.service === service) || null;
  }

  setBotConnectorAccess(botId: string, input: { canRead: boolean; canSend: boolean }, service: ConnectorServiceId = "gmail", connectorId = "google-workspace"): BotConnectorAccess {
    if (!this.getBot(botId) || !this.getConnector(connectorId)) throw new Error("Choose a valid teammate and connector.");
    const at = now();
    this.db.prepare(`INSERT INTO bot_connector_access (bot_id,connector_id,service,can_read,can_send,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(bot_id,connector_id,service) DO UPDATE SET can_read=excluded.can_read,can_send=excluded.can_send,updated_at=excluded.updated_at`).run(
      botId, connectorId, service, input.canRead ? 1 : 0, input.canSend ? 1 : 0, at, at,
    );
    return this.getBotConnectorAccess(botId, service, connectorId)!;
  }

  addConnectorEvent(input: { connectorId?: string; botId?: string | null; action: string; status: ConnectorEvent["status"]; summary: string }): ConnectorEvent {
    const event: ConnectorEvent = {
      id: randomUUID(), connectorId: input.connectorId || "google-workspace", botId: input.botId || null,
      botName: input.botId ? this.getBot(input.botId)?.name || null : null, action: input.action, status: input.status,
      summary: input.summary.slice(0, 300), createdAt: now(),
    };
    this.db.prepare("INSERT INTO connector_events (id,connector_id,bot_id,action,status,summary,created_at) VALUES (?,?,?,?,?,?,?)").run(
      event.id, event.connectorId, event.botId, event.action, event.status, event.summary, event.createdAt,
    );
    return event;
  }

  listConnectorEvents(connectorId = "google-workspace", limit = 20): ConnectorEvent[] {
    return (this.db.prepare(`SELECT e.*,b.name bot_name FROM connector_events e LEFT JOIN bots b ON b.id=e.bot_id WHERE e.connector_id=? ORDER BY e.created_at DESC LIMIT ?`).all(connectorId, Math.max(1, Math.min(limit, 100))) as Row[]).map((row) => ({
      id: String(row.id), connectorId: String(row.connector_id), botId: row.bot_id ? String(row.bot_id) : null,
      botName: row.bot_name ? String(row.bot_name) : null, action: String(row.action), status: row.status as ConnectorEvent["status"],
      summary: String(row.summary), createdAt: String(row.created_at),
    }));
  }

  listCodeProjectAccess(projectId?: string): CodeProjectAccess[] {
    const rows = projectId
      ? this.db.prepare("SELECT * FROM bot_project_access WHERE project_id=? ORDER BY rowid").all(projectId) as Row[]
      : this.db.prepare("SELECT * FROM bot_project_access ORDER BY rowid").all() as Row[];
    return rows.map((row) => ({
      botId: String(row.bot_id), projectId: String(row.project_id), canRead: asBoolean(row.can_read), canWrite: asBoolean(row.can_write),
      canRun: asBoolean(row.can_run), updatedAt: String(row.updated_at),
    }));
  }

  private codeProjectFromRow(row: Row): CodeProject {
    const id = String(row.id);
    return {
      id, ownerId: String(row.owner_id), name: String(row.name), rootPath: String(row.root_path),
      gitRepository: asBoolean(row.git_repository), projectKind: String(row.project_kind), remoteUrl: row.remote_url ? String(row.remote_url) : null,
      defaultBranch: row.default_branch ? String(row.default_branch) : null, managedClone: asBoolean(row.managed_clone), access: this.listCodeProjectAccess(id),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  listCodeProjects(botId?: string): CodeProject[] {
    const rows = botId
      ? this.db.prepare(`SELECT p.* FROM code_projects p JOIN bot_project_access a ON a.project_id=p.id WHERE p.connected=1 AND a.bot_id=? AND a.can_read=1 ORDER BY p.updated_at DESC`).all(botId) as Row[]
      : this.db.prepare("SELECT * FROM code_projects WHERE connected=1 ORDER BY updated_at DESC").all() as Row[];
    return rows.map((row) => this.codeProjectFromRow(row));
  }

  getCodeProject(id: string): CodeProject | null {
    const row = this.db.prepare("SELECT * FROM code_projects WHERE id=? AND connected=1").get(id) as Row | undefined;
    return row ? this.codeProjectFromRow(row) : null;
  }

  getCodeProjectForBot(botId: string, projectId: string, capability: "read" | "write" | "run" = "read"): CodeProject | null {
    const project = this.getCodeProject(projectId), access = project?.access.find((item) => item.botId === botId);
    if (!project || !access?.canRead) return null;
    if (capability === "write" && !access.canWrite) return null;
    if (capability === "run" && !access.canRun) return null;
    return project;
  }

  createCodeProject(input: { name: string; rootPath: string; gitRepository: boolean; projectKind: string; remoteUrl?: string | null; defaultBranch?: string | null; managedClone?: boolean; access: Array<{ botId: string; canRead: boolean; canWrite: boolean; canRun: boolean }> }): CodeProject {
    const existing = this.db.prepare("SELECT * FROM code_projects WHERE root_path=?").get(input.rootPath) as Row | undefined;
    if (existing && asBoolean(existing.connected)) throw new Error("That project folder is already connected.");
    const id = existing ? String(existing.id) : randomUUID(), at = now();
    this.db.exec("BEGIN");
    try {
      if (existing) {
        this.db.prepare("UPDATE code_projects SET name=?,git_repository=?,project_kind=?,remote_url=?,default_branch=?,managed_clone=?,connected=1,updated_at=? WHERE id=?").run(input.name, input.gitRepository ? 1 : 0, input.projectKind, input.remoteUrl || null, input.defaultBranch || null, input.managedClone ? 1 : 0, at, id);
        this.db.prepare("DELETE FROM bot_project_access WHERE project_id=?").run(id);
      } else {
        this.db.prepare("INSERT INTO code_projects (id,owner_id,name,root_path,git_repository,project_kind,remote_url,default_branch,managed_clone,connected,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)").run(
          id, DEFAULT_OWNER, input.name, input.rootPath, input.gitRepository ? 1 : 0, input.projectKind, input.remoteUrl || null, input.defaultBranch || null, input.managedClone ? 1 : 0, at, at,
        );
      }
      for (const grant of input.access) {
        if (!this.getBot(grant.botId)) continue;
        this.db.prepare("INSERT INTO bot_project_access (bot_id,project_id,can_read,can_write,can_run,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(
          grant.botId, id, grant.canRead ? 1 : 0, grant.canWrite && grant.canRead ? 1 : 0, grant.canRun && grant.canRead ? 1 : 0, at, at,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCodeProject(id)!;
  }

  setCodeProjectAccess(projectId: string, botId: string, input: { canRead: boolean; canWrite: boolean; canRun: boolean }): CodeProjectAccess {
    if (!this.getCodeProject(projectId) || !this.getBot(botId)) throw new Error("Choose a valid code project and teammate.");
    const at = now();
    this.db.prepare(`INSERT INTO bot_project_access (bot_id,project_id,can_read,can_write,can_run,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(bot_id,project_id) DO UPDATE SET can_read=excluded.can_read,can_write=excluded.can_write,can_run=excluded.can_run,updated_at=excluded.updated_at`).run(
      botId, projectId, input.canRead ? 1 : 0, input.canWrite && input.canRead ? 1 : 0, input.canRun && input.canRead ? 1 : 0, at, at,
    );
    return this.listCodeProjectAccess(projectId).find((item) => item.botId === botId)!;
  }

  deleteCodeProject(id: string): boolean {
    if (!this.getCodeProject(id)) return false;
    const at = now();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE code_projects SET connected=0,updated_at=? WHERE id=?").run(at, id);
      this.db.prepare("DELETE FROM bot_project_access WHERE project_id=?").run(id);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recordCodeProjectEdit(input: { projectId: string; botId: string; path: string; operation: "created" | "updated"; additions: number; deletions: number; beforeContent: string | null; afterHash: string; workspaceRunId?: string | null }): CodeProjectEdit {
    const id = randomUUID(), createdAt = now();
    this.db.prepare("INSERT INTO code_project_edits (id,project_id,bot_id,path,operation,additions,deletions,before_content,after_hash,workspace_run_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      id, input.projectId, input.botId, input.path, input.operation, input.additions, input.deletions, input.beforeContent, input.afterHash, input.workspaceRunId || null, createdAt,
    );
    const bot = this.getBot(input.botId)!;
    return { id, projectId: input.projectId, botId: input.botId, botName: bot.name, path: input.path, operation: input.operation, additions: input.additions, deletions: input.deletions, workspaceRunId: input.workspaceRunId || null, reversible: true, restoredAt: null, createdAt };
  }

  listCodeProjectEdits(projectId?: string, limit = 30): CodeProjectEdit[] {
    const rows = projectId
      ? this.db.prepare(`SELECT e.*,b.name bot_name FROM code_project_edits e JOIN bots b ON b.id=e.bot_id WHERE e.project_id=? ORDER BY e.created_at DESC LIMIT ?`).all(projectId, limit) as Row[]
      : this.db.prepare(`SELECT e.*,b.name bot_name FROM code_project_edits e JOIN bots b ON b.id=e.bot_id ORDER BY e.created_at DESC LIMIT ?`).all(limit) as Row[];
    return rows.map((row) => ({ id: String(row.id), projectId: String(row.project_id), botId: String(row.bot_id), botName: String(row.bot_name), path: String(row.path), operation: row.operation as CodeProjectEdit["operation"], additions: Number(row.additions), deletions: Number(row.deletions), workspaceRunId: row.workspace_run_id ? String(row.workspace_run_id) : null, reversible: Boolean(row.after_hash) && !row.restored_at, restoredAt: row.restored_at ? String(row.restored_at) : null, createdAt: String(row.created_at) }));
  }

  getCodeProjectEdit(id: string): ({ beforeContent: string | null; afterHash: string } & CodeProjectEdit) | null {
    const row = this.db.prepare(`SELECT e.*,b.name bot_name FROM code_project_edits e JOIN bots b ON b.id=e.bot_id WHERE e.id=?`).get(id) as Row | undefined;
    if (!row) return null;
    return { id: String(row.id), projectId: String(row.project_id), botId: String(row.bot_id), botName: String(row.bot_name), path: String(row.path), operation: row.operation as CodeProjectEdit["operation"], additions: Number(row.additions), deletions: Number(row.deletions), workspaceRunId: row.workspace_run_id ? String(row.workspace_run_id) : null, reversible: Boolean(row.after_hash) && !row.restored_at, restoredAt: row.restored_at ? String(row.restored_at) : null, createdAt: String(row.created_at), beforeContent: row.before_content === null || row.before_content === undefined ? null : String(row.before_content), afterHash: String(row.after_hash || "") };
  }

  markCodeProjectEditRestored(id: string) {
    this.db.prepare("UPDATE code_project_edits SET restored_at=? WHERE id=? AND restored_at IS NULL").run(now(), id);
  }

  createCodeTaskWorkspace(input: { runId: string; projectId: string; botId: string; branch: string; rootPath: string }): CodeTaskWorkspace {
    const at = now();
    this.db.prepare("INSERT INTO code_task_workspaces (run_id,project_id,bot_id,branch,root_path,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)").run(input.runId, input.projectId, input.botId, input.branch, input.rootPath, at, at);
    return this.getCodeTaskWorkspace(input.runId)!;
  }

  private codeTaskWorkspaceFromRow(row: Row): CodeTaskWorkspace {
    return { runId: String(row.run_id), projectId: String(row.project_id), projectName: String(row.project_name), botId: String(row.bot_id), botName: String(row.bot_name), branch: String(row.branch), rootPath: String(row.root_path), status: row.status as CodeTaskWorkspace["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  getCodeTaskWorkspace(runId: string): CodeTaskWorkspace | null {
    const row = this.db.prepare(`SELECT w.*,p.name project_name,b.name bot_name FROM code_task_workspaces w JOIN code_projects p ON p.id=w.project_id JOIN bots b ON b.id=w.bot_id WHERE w.run_id=?`).get(runId) as Row | undefined;
    return row ? this.codeTaskWorkspaceFromRow(row) : null;
  }

  listCodeTaskWorkspaces(projectId?: string): CodeTaskWorkspace[] {
    const rows = (projectId
      ? this.db.prepare(`SELECT w.*,p.name project_name,b.name bot_name FROM code_task_workspaces w JOIN code_projects p ON p.id=w.project_id JOIN bots b ON b.id=w.bot_id WHERE w.project_id=? ORDER BY w.updated_at DESC`).all(projectId)
      : this.db.prepare(`SELECT w.*,p.name project_name,b.name bot_name FROM code_task_workspaces w JOIN code_projects p ON p.id=w.project_id JOIN bots b ON b.id=w.bot_id ORDER BY w.updated_at DESC`).all()) as Row[];
    return rows.map((row) => this.codeTaskWorkspaceFromRow(row));
  }

  updateCodeTaskWorkspaceStatus(runId: string, status: CodeTaskWorkspace["status"]) {
    this.db.prepare("UPDATE code_task_workspaces SET status=?,updated_at=? WHERE run_id=?").run(status, now(), runId);
  }

  recordCodeTaskReview(input: { sourceRunId: string; reviewerRunId: string; projectId: string; reviewerBotId: string; verdict: CodeTaskReview["verdict"]; summary: string; findings: string[]; headCommit: string }): CodeTaskReview {
    const id = randomUUID(), createdAt = now();
    this.db.prepare("INSERT INTO code_task_reviews (id,source_run_id,reviewer_run_id,project_id,reviewer_bot_id,verdict,summary,findings_json,head_commit,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      id, input.sourceRunId, input.reviewerRunId, input.projectId, input.reviewerBotId, input.verdict, input.summary, JSON.stringify(input.findings), input.headCommit, createdAt,
    );
    return this.getCodeTaskReviewByReviewerRun(input.reviewerRunId)!;
  }

  private codeTaskReviewFromRow(row: Row): CodeTaskReview {
    return {
      id: String(row.id), sourceRunId: String(row.source_run_id), reviewerRunId: String(row.reviewer_run_id), projectId: String(row.project_id),
      reviewerBotId: String(row.reviewer_bot_id), reviewerBotName: String(row.reviewer_bot_name), verdict: row.verdict as CodeTaskReview["verdict"],
      summary: String(row.summary), findings: jsonArray<string>(row.findings_json).filter((finding) => typeof finding === "string"), headCommit: String(row.head_commit), createdAt: String(row.created_at),
    };
  }

  getCodeTaskReviewByReviewerRun(runId: string): CodeTaskReview | null {
    const row = this.db.prepare(`SELECT r.*,b.name reviewer_bot_name FROM code_task_reviews r JOIN bots b ON b.id=r.reviewer_bot_id WHERE r.reviewer_run_id=?`).get(runId) as Row | undefined;
    return row ? this.codeTaskReviewFromRow(row) : null;
  }

  latestCodeTaskReview(sourceRunId: string): CodeTaskReview | null {
    const row = this.db.prepare(`SELECT r.*,b.name reviewer_bot_name FROM code_task_reviews r JOIN bots b ON b.id=r.reviewer_bot_id WHERE r.source_run_id=? ORDER BY r.created_at DESC LIMIT 1`).get(sourceRunId) as Row | undefined;
    return row ? this.codeTaskReviewFromRow(row) : null;
  }

  listCodeTaskReviews(projectId?: string): CodeTaskReview[] {
    const rows = (projectId
      ? this.db.prepare(`SELECT r.*,b.name reviewer_bot_name FROM code_task_reviews r JOIN bots b ON b.id=r.reviewer_bot_id WHERE r.project_id=? ORDER BY r.created_at DESC`).all(projectId)
      : this.db.prepare(`SELECT r.*,b.name reviewer_bot_name FROM code_task_reviews r JOIN bots b ON b.id=r.reviewer_bot_id ORDER BY r.created_at DESC`).all()) as Row[];
    return rows.map((row) => this.codeTaskReviewFromRow(row));
  }

  remember(botId: string, key: string, content: string) {
    this.db.prepare(`INSERT INTO memories (id,bot_id,memory_key,content,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(bot_id,memory_key) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at`).run(randomUUID(), botId, key, content, now());
  }

  listMemories(botId: string): Array<{ key: string; content: string }> {
    return (this.db.prepare("SELECT memory_key,content FROM memories WHERE bot_id=? ORDER BY updated_at DESC LIMIT 30").all(botId) as Row[]).map((row) => ({ key: String(row.memory_key), content: String(row.content) }));
  }

  claimDedupe(key: string): boolean {
    try { this.db.prepare("INSERT INTO dedupe_keys (dedupe_key,created_at) VALUES (?,?)").run(key, now()); return true; } catch { return false; }
  }

  runDepth(runId: string): number {
    const row = this.db.prepare(`WITH RECURSIVE chain(id,parent_run_id,depth) AS (
      SELECT id,parent_run_id,0 FROM runs WHERE id=?
      UNION ALL SELECT r.id,r.parent_run_id,chain.depth+1 FROM runs r JOIN chain ON r.id=chain.parent_run_id WHERE chain.depth<20
    ) SELECT MAX(depth) depth FROM chain`).get(runId) as Row | undefined;
    return Number(row?.depth || 0);
  }

  rootRunId(runId: string): string {
    const row = this.db.prepare(`WITH RECURSIVE chain(id,parent_run_id,depth) AS (
      SELECT id,parent_run_id,0 FROM runs WHERE id=?
      UNION ALL SELECT r.id,r.parent_run_id,chain.depth+1 FROM runs r JOIN chain ON r.id=chain.parent_run_id WHERE chain.depth<20
    ) SELECT id FROM chain ORDER BY depth DESC LIMIT 1`).get(runId) as Row | undefined;
    return row?.id ? String(row.id) : runId;
  }

  descendantRunCount(runId: string): number {
    const root = this.rootRunId(runId);
    const row = this.db.prepare(`WITH RECURSIVE tree(id) AS (
      SELECT id FROM runs WHERE id=?
      UNION ALL SELECT r.id FROM runs r JOIN tree ON r.parent_run_id=tree.id
    ) SELECT COUNT(*) count FROM tree`).get(root) as Row | undefined;
    return Number(row?.count || 0);
  }

  addAgentMessage(input: {
    threadId: string; fromBotId: string; toBotId: string; body: string; kind: AgentMessageKind; expectsReply: boolean;
    runId: string; replyToId?: string | null; hopCount: number; dedupeKey: string;
  }): AgentMessage | null {
    const id = randomUUID();
    try {
      this.db.prepare(`INSERT INTO agent_messages (id,thread_id,from_bot_id,to_bot_id,body,kind,expects_reply,run_id,reply_to_id,hop_count,dedupe_key,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.threadId, input.fromBotId, input.toBotId, input.body, input.kind, input.expectsReply ? 1 : 0, input.runId, input.replyToId || null, input.hopCount, input.dedupeKey, now());
    } catch { return null; }
    return this.getAgentMessage(id);
  }

  private agentMessageSelect(where: string) {
    return `SELECT am.*,fb.name from_name,fb.mascot from_mascot,fb.color from_color,tb.name to_name,tb.mascot to_mascot,tb.color to_color
      FROM agent_messages am JOIN bots fb ON fb.id=am.from_bot_id JOIN bots tb ON tb.id=am.to_bot_id ${where}`;
  }

  private agentMessageFromRow(row: Row): AgentMessage {
    return {
      id: String(row.id), threadId: String(row.thread_id), fromBotId: String(row.from_bot_id), fromBotName: String(row.from_name),
      fromBotMascot: String(row.from_mascot) as MascotKind, fromBotColor: String(row.from_color), toBotId: String(row.to_bot_id),
      toBotName: String(row.to_name), toBotMascot: String(row.to_mascot) as MascotKind, toBotColor: String(row.to_color),
      body: String(row.body), kind: row.kind as AgentMessageKind, expectsReply: asBoolean(row.expects_reply), runId: String(row.run_id),
      replyToId: row.reply_to_id ? String(row.reply_to_id) : null, hopCount: Number(row.hop_count || 0), createdAt: String(row.created_at),
    };
  }

  getAgentMessage(id: string): AgentMessage | null {
    const row = this.db.prepare(this.agentMessageSelect("WHERE am.id=?")).get(id) as Row | undefined;
    return row ? this.agentMessageFromRow(row) : null;
  }

  listAgentMessages(threadId?: string, limit = 40): AgentMessage[] {
    const rows = threadId
      ? this.db.prepare(`SELECT * FROM (${this.agentMessageSelect("WHERE am.thread_id=? ORDER BY am.created_at DESC LIMIT ?")}) ORDER BY created_at ASC`).all(threadId, limit) as Row[]
      : this.db.prepare(`SELECT * FROM (${this.agentMessageSelect("ORDER BY am.created_at DESC LIMIT ?")}) ORDER BY created_at ASC`).all(limit) as Row[];
    return rows.map((row) => this.agentMessageFromRow(row));
  }

  listAgentInbox(botId: string, threadId: string, limit = 8): AgentMessage[] {
    const rows = this.db.prepare(`${this.agentMessageSelect("WHERE am.to_bot_id=? AND am.thread_id=? ORDER BY am.created_at DESC LIMIT ?")}`).all(botId, threadId, limit) as Row[];
    return rows.reverse().map((row) => this.agentMessageFromRow(row));
  }

  hasAgentMessage(runId: string, fromBotId: string, toBotId: string): boolean {
    const row = this.db.prepare("SELECT EXISTS(SELECT 1 FROM agent_messages WHERE run_id=? AND from_bot_id=? AND to_bot_id=?) present").get(runId, fromBotId, toBotId) as Row | undefined;
    return asBoolean(row?.present);
  }

  createRoutine(input: { name: string; botId: string; threadId: string; prompt: string; intervalMinutes: number; enabled?: boolean; triggerType?: AutomationTriggerType; triggerConfig?: RoutineTriggerConfig; webhookSecret?: string | null }): Routine {
    const id = randomUUID();
    const intervalMinutes = normalizeRoutineInterval(input.intervalMinutes);
    const triggerType = input.triggerType || "schedule";
    const triggerConfig = normalizedTriggerConfig(triggerType, input.triggerConfig);
    const enabled = input.enabled !== false;
    const nextRunAt = enabled && triggerType === "schedule" ? new Date(Date.now() + routineIntervalMs(intervalMinutes)).toISOString() : null;
    this.db.prepare("INSERT INTO routines (id,name,bot_id,thread_id,prompt,cadence,interval_minutes,trigger_type,trigger_config_json,webhook_secret_ciphertext,enabled,next_run_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, input.name, input.botId, input.threadId, input.prompt, legacyCadence(intervalMinutes), intervalMinutes, triggerType, JSON.stringify(triggerConfig), input.webhookSecret ? this.vault.encrypt(input.webhookSecret) : null, enabled ? 1 : 0, nextRunAt);
    return this.getRoutine(id)!;
  }

  private routineFromRow(row: Row): Routine {
    return {
      id: String(row.id), name: String(row.name), botId: String(row.bot_id), botName: String(row.bot_name), botEmoji: String(row.bot_emoji),
      threadId: String(row.thread_id), prompt: String(row.prompt), cadence: row.cadence as Routine["cadence"], intervalMinutes: normalizeRoutineInterval(Number(row.interval_minutes || (row.cadence === "hourly" ? 60 : 1440))), enabled: asBoolean(row.enabled),
      triggerType: String(row.trigger_type || "schedule") as AutomationTriggerType, triggerConfig: jsonRecord(row.trigger_config_json) as RoutineTriggerConfig,
      hasWebhookSecret: Boolean(row.webhook_secret_ciphertext),
      nextRunAt: row.next_run_at ? String(row.next_run_at) : null, lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
      lastStatus: (row.last_status || "never") as Routine["lastStatus"], runCount: Number(row.run_count || 0),
      consecutiveFailures: Number(row.consecutive_failures || 0), deduplicatedCount: Number(row.deduplicated_count || 0),
      lastError: row.last_error ? String(row.last_error) : null, pausedReason: row.paused_reason ? String(row.paused_reason) : null,
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null, lastEventAt: row.last_event_at ? String(row.last_event_at) : null,
    };
  }

  getRoutine(id: string): Routine | null {
    const row = this.db.prepare("SELECT r.*,b.name bot_name,b.emoji bot_emoji FROM routines r JOIN bots b ON b.id=r.bot_id WHERE r.id=?").get(id) as Row | undefined;
    return row ? this.routineFromRow(row) : null;
  }

  listRoutines(): Routine[] {
    return (this.db.prepare("SELECT r.*,b.name bot_name,b.emoji bot_emoji FROM routines r JOIN bots b ON b.id=r.bot_id ORDER BY r.rowid DESC").all() as Row[]).map((row) => this.routineFromRow(row));
  }

  updateRoutine(id: string, input: { name: string; botId: string; threadId: string; prompt: string; intervalMinutes: number; enabled: boolean; triggerType?: AutomationTriggerType; triggerConfig?: RoutineTriggerConfig; webhookSecret?: string | null }): Routine | null {
    const routine = this.getRoutine(id);
    if (!routine) return null;
    const intervalMinutes = normalizeRoutineInterval(input.intervalMinutes);
    const triggerType = input.triggerType || routine.triggerType;
    const triggerConfig = normalizedTriggerConfig(triggerType, input.triggerConfig ?? routine.triggerConfig);
    const scheduleChanged = routine.intervalMinutes !== intervalMinutes || routine.enabled !== input.enabled || routine.triggerType !== triggerType;
    const nextRunAt = input.enabled && triggerType === "schedule" ? (scheduleChanged || !routine.nextRunAt ? new Date(Date.now() + routineIntervalMs(intervalMinutes)).toISOString() : routine.nextRunAt) : null;
    const secret = input.webhookSecret ? this.vault.encrypt(input.webhookSecret) : undefined;
    this.db.prepare("UPDATE routines SET name=?,bot_id=?,thread_id=?,prompt=?,cadence=?,interval_minutes=?,trigger_type=?,trigger_config_json=?,webhook_secret_ciphertext=COALESCE(?,webhook_secret_ciphertext),enabled=?,next_run_at=?,paused_reason=CASE WHEN ? THEN NULL ELSE paused_reason END WHERE id=?").run(
      input.name, input.botId, input.threadId, input.prompt, legacyCadence(intervalMinutes), intervalMinutes, triggerType, JSON.stringify(triggerConfig), secret ?? null, input.enabled ? 1 : 0, nextRunAt, input.enabled ? 1 : 0, id,
    );
    return this.getRoutine(id);
  }

  deleteRoutine(id: string): boolean {
    return this.db.prepare("DELETE FROM routines WHERE id=?").run(id).changes > 0;
  }

  listRoutineRuns(id: string, limit = 20): Run[] {
    const rows = this.db.prepare(this.runSelect("WHERE r.routine_id=? ORDER BY r.created_at DESC LIMIT ?")).all(id, Math.max(1, Math.min(limit, 100))) as Row[];
    return rows.map((row) => this.runFromRow(row));
  }

  toggleRoutine(id: string, enabled: boolean): Routine | null {
    const routine = this.getRoutine(id);
    if (!routine) return null;
    const delay = routineIntervalMs(routine.intervalMinutes);
    this.db.prepare("UPDATE routines SET enabled=?,next_run_at=?,paused_reason=CASE WHEN ? THEN NULL ELSE paused_reason END WHERE id=?").run(enabled ? 1 : 0, enabled && routine.triggerType === "schedule" ? new Date(Date.now() + delay).toISOString() : null, enabled ? 1 : 0, id);
    return this.getRoutine(id);
  }

  dueRoutines(): Routine[] {
    return (this.db.prepare("SELECT r.*,b.name bot_name,b.emoji bot_emoji FROM routines r JOIN bots b ON b.id=r.bot_id WHERE r.enabled=1 AND r.trigger_type='schedule' AND r.next_run_at IS NOT NULL AND r.next_run_at<=?").all(now()) as Row[]).map((row) => this.routineFromRow(row));
  }

  markRoutineRan(routine: Routine) {
    this.markRoutineDispatched(routine, true);
  }

  markRoutineDispatched(routine: Routine, advanceSchedule: boolean) {
    const ranAt = now();
    const delay = routineIntervalMs(routine.intervalMinutes);
    const nextRunAt = advanceSchedule && routine.enabled && routine.triggerType === "schedule" ? new Date(Date.now() + delay).toISOString() : routine.nextRunAt;
    this.db.prepare("UPDATE routines SET last_run_at=?,last_event_at=?,next_run_at=? WHERE id=?").run(ranAt, ranAt, nextRunAt, routine.id);
  }

  listCalendarRoutines(): Routine[] {
    return this.listRoutines().filter((routine) => routine.enabled && routine.triggerType === "calendar");
  }

  routineWebhookSecret(id: string): string | null {
    const row = this.db.prepare("SELECT webhook_secret_ciphertext FROM routines WHERE id=?").get(id) as Row | undefined;
    return row?.webhook_secret_ciphertext ? this.vault.decrypt(String(row.webhook_secret_ciphertext)) : null;
  }

  receiveAutomationEvent(input: { routine: Routine; source: AutomationEvent["source"]; externalId: string; dedupeKey: string; payloadSummary: string; payload: unknown; replayOfEventId?: string | null; attempt?: number; dedupeWindowMs?: number; rateLimit?: number; bypassDedupe?: boolean }): { event: AutomationEvent; duplicate: boolean; rateLimited: boolean } {
    const cutoff = new Date(Date.now() - (input.dedupeWindowMs ?? 7 * 86_400_000)).toISOString();
    if (!input.bypassDedupe) {
      const existing = this.db.prepare("SELECT * FROM automation_events WHERE routine_id=? AND dedupe_key=? AND received_at>=? AND status!='rate_limited' ORDER BY received_at DESC LIMIT 1").get(input.routine.id, input.dedupeKey, cutoff) as Row | undefined;
      if (existing) {
        this.db.prepare("UPDATE routines SET deduplicated_count=deduplicated_count+1 WHERE id=?").run(input.routine.id);
        return { event: this.automationEventFromRow(existing), duplicate: true, rateLimited: false };
      }
    }
    const rateCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const recent = this.db.prepare("SELECT COUNT(*) count FROM automation_events WHERE routine_id=? AND received_at>=? AND status!='rate_limited'").get(input.routine.id, rateCutoff) as Row;
    const rateLimited = Number(recent.count || 0) >= (input.rateLimit ?? 10);
    const id = randomUUID(), receivedAt = now(), status: AutomationEventStatus = rateLimited ? "rate_limited" : "queued";
    const serializedPayload = JSON.stringify(input.payload) || "{}";
    const payloadJson = serializedPayload.length <= 20_000 ? serializedPayload : JSON.stringify({ truncated: true, preview: serializedPayload.slice(0, 19_000) });
    this.db.prepare("INSERT INTO automation_events (id,routine_id,routine_name,bot_id,bot_name,source,external_id,dedupe_key,status,replay_of_event_id,payload_summary,payload_json,received_at,attempt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, input.routine.id, input.routine.name, input.routine.botId, input.routine.botName, input.source, input.externalId, input.dedupeKey, status,
      input.replayOfEventId || null, input.payloadSummary.slice(0, 500), payloadJson, receivedAt, input.attempt || 1,
    );
    this.db.prepare("UPDATE routines SET last_event_at=? WHERE id=?").run(receivedAt, input.routine.id);
    if (rateLimited) this.createAutomationAlert({ routineId: input.routine.id, eventId: id, kind: "rate_limit", message: `${input.routine.name} received too many events and paused this one safely.` });
    return { event: this.getAutomationEvent(id)!, duplicate: false, rateLimited };
  }

  private automationEventFromRow(row: Row): AutomationEvent {
    const error = row.error ? String(row.error) : null;
    return {
      id: String(row.id), routineId: String(row.routine_id), routineName: String(row.routine_name), botId: String(row.bot_id), botName: String(row.bot_name),
      source: String(row.source) as AutomationEvent["source"], externalId: String(row.external_id), status: String(row.status) as AutomationEventStatus,
      runId: row.run_id ? String(row.run_id) : null, replayOfEventId: row.replay_of_event_id ? String(row.replay_of_event_id) : null,
      payloadSummary: String(row.payload_summary), receivedAt: String(row.received_at), finishedAt: row.finished_at ? String(row.finished_at) : null,
      error, attempt: Number(row.attempt || 1), repairHint: automationRepairHint(error),
    };
  }

  getAutomationEvent(id: string): AutomationEvent | null {
    const row = this.db.prepare("SELECT * FROM automation_events WHERE id=?").get(id) as Row | undefined;
    return row ? this.automationEventFromRow(row) : null;
  }

  automationEventPayload(id: string): unknown {
    const row = this.db.prepare("SELECT payload_json FROM automation_events WHERE id=?").get(id) as Row | undefined;
    if (!row?.payload_json) return {};
    try { return JSON.parse(String(row.payload_json)); } catch { return {}; }
  }

  listAutomationEvents(routineId?: string, limit = 80): AutomationEvent[] {
    const rows = routineId
      ? this.db.prepare("SELECT * FROM automation_events WHERE routine_id=? ORDER BY received_at DESC LIMIT ?").all(routineId, Math.max(1, Math.min(limit, 200))) as Row[]
      : this.db.prepare("SELECT * FROM automation_events ORDER BY received_at DESC LIMIT ?").all(Math.max(1, Math.min(limit, 200))) as Row[];
    return rows.map((row) => this.automationEventFromRow(row));
  }

  linkAutomationEvent(eventId: string, runId: string, status: "queued" | "waiting" = "queued") {
    this.db.prepare("UPDATE automation_events SET run_id=?,status=? WHERE id=?").run(runId, status, eventId);
  }

  createAutomationAlert(input: { routineId: string; runId?: string | null; eventId?: string | null; kind: AutomationAlert["kind"]; message: string }): AutomationAlert {
    const routine = this.getRoutine(input.routineId);
    const existing = this.db.prepare("SELECT * FROM automation_alerts WHERE routine_id=? AND kind=? AND COALESCE(run_id,'')=COALESCE(?,'') AND COALESCE(event_id,'')=COALESCE(?,'') AND resolved_at IS NULL LIMIT 1").get(input.routineId, input.kind, input.runId || null, input.eventId || null) as Row | undefined;
    if (existing) return this.automationAlertFromRow(existing);
    const id = randomUUID();
    this.db.prepare("INSERT INTO automation_alerts (id,routine_id,routine_name,run_id,event_id,kind,message,created_at) VALUES (?,?,?,?,?,?,?,?)").run(
      id, input.routineId, routine?.name || "Deleted automation", input.runId || null, input.eventId || null, input.kind, input.message.slice(0, 1_000), now(),
    );
    return this.listAutomationAlerts().find((alert) => alert.id === id)!;
  }

  private automationAlertFromRow(row: Row): AutomationAlert {
    const event = row.event_id ? this.getAutomationEvent(String(row.event_id)) : null;
    const error = event?.error || String(row.message || "");
    return {
      id: String(row.id), routineId: String(row.routine_id), routineName: String(row.routine_name), runId: row.run_id ? String(row.run_id) : null,
      eventId: row.event_id ? String(row.event_id) : null, kind: String(row.kind) as AutomationAlert["kind"], message: String(row.message),
      repairHint: automationRepairHint(error), createdAt: String(row.created_at), resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    };
  }

  listAutomationAlerts(includeResolved = false): AutomationAlert[] {
    const rows = this.db.prepare(`SELECT * FROM automation_alerts ${includeResolved ? "" : "WHERE resolved_at IS NULL"} ORDER BY created_at DESC LIMIT 100`).all() as Row[];
    return rows.map((row) => this.automationAlertFromRow(row));
  }

  resolveAutomationAlert(id: string): boolean {
    return this.db.prepare("UPDATE automation_alerts SET resolved_at=? WHERE id=? AND resolved_at IS NULL").run(now(), id).changes > 0;
  }

  nextWorkflowSlug(botId: string, name: string, excludedId?: string): string {
    const base = skillSlug(name), used = new Set(this.listWorkflows().filter((workflow) => workflow.id !== excludedId).map((workflow) => workflow.skillSlug));
    if (!used.has(base)) return base;
    const bot = this.getBot(botId), botSuffix = skillSlug(bot?.name || botId);
    if (!used.has(`${base}-${botSuffix}`)) return `${base}-${botSuffix}`;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  saveWorkflow(input: { botId: string; name: string; description?: string; instructions?: string; startUrl: string; steps: unknown[]; skillPath: string; skillSlug: string; source?: TaughtWorkflow["source"] }): TaughtWorkflow {
    const id = randomUUID(), createdAt = now();
    const description = input.description?.trim() || `Repeat the saved ${input.name} workflow.`;
    const instructions = input.instructions?.trim() || `Start at ${input.startUrl}, follow the demonstrated steps, and verify the result.`;
    this.db.prepare("INSERT INTO taught_workflows (id,bot_id,name,description,instructions,start_url,steps_json,skill_path,skill_slug,version,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)").run(
      id, input.botId, input.name, description, instructions, input.startUrl, JSON.stringify(input.steps), input.skillPath, input.skillSlug, input.source || "taught", createdAt, createdAt,
    );
    this.db.prepare("INSERT INTO workflow_versions (id,workflow_id,version,name,description,instructions,start_url,steps_json,created_at) VALUES (?,?,1,?,?,?,?,?,?)").run(
      randomUUID(), id, input.name, description, instructions, input.startUrl, JSON.stringify(input.steps), createdAt,
    );
    return this.listWorkflows(input.botId).find((workflow) => workflow.id === id)!;
  }

  private workflowFromRow(row: Row): TaughtWorkflow {
    return {
      id: String(row.id), botId: String(row.bot_id), botName: String(row.bot_name), name: String(row.name),
      skillSlug: row.skill_slug ? String(row.skill_slug) : skillSlug(String(row.name)),
      description: String(row.description || `Repeat the saved ${row.name} workflow.`),
      instructions: String(row.instructions || `Start at ${row.start_url}, follow the demonstrated steps, and verify the result.`),
      startUrl: String(row.start_url), stepCount: jsonArray<unknown>(row.steps_json).length, version: Number(row.version || 1),
      source: (["taught", "imported", "template", "assigned"].includes(String(row.source)) ? String(row.source) : "taught") as TaughtWorkflow["source"],
      createdAt: String(row.created_at), updatedAt: String(row.updated_at || row.created_at),
    };
  }

  listWorkflows(botId?: string): TaughtWorkflow[] {
    const rows = botId
      ? this.db.prepare("SELECT w.*,b.name bot_name FROM taught_workflows w JOIN bots b ON b.id=w.bot_id WHERE w.bot_id=? ORDER BY w.updated_at DESC,w.created_at DESC").all(botId) as Row[]
      : this.db.prepare("SELECT w.*,b.name bot_name FROM taught_workflows w JOIN bots b ON b.id=w.bot_id ORDER BY w.updated_at DESC,w.created_at DESC").all() as Row[];
    return rows.map((row) => this.workflowFromRow(row));
  }

  getWorkflowRecord(id: string): { workflow: TaughtWorkflow; steps: unknown[]; skillPath: string } | null {
    const row = this.db.prepare("SELECT w.*,b.name bot_name FROM taught_workflows w JOIN bots b ON b.id=w.bot_id WHERE w.id=?").get(id) as Row | undefined;
    if (!row) return null;
    return { workflow: this.workflowFromRow(row), steps: jsonArray<unknown>(row.steps_json), skillPath: String(row.skill_path) };
  }

  reviseWorkflowRecord(id: string, input: { name: string; description: string; instructions: string; startUrl: string; steps: unknown[]; skillSlug: string; skillPath: string }): TaughtWorkflow | null {
    const current = this.getWorkflowRecord(id);
    if (!current) return null;
    const version = current.workflow.version + 1, updatedAt = now();
    this.db.prepare("UPDATE taught_workflows SET name=?,description=?,instructions=?,start_url=?,steps_json=?,skill_slug=?,skill_path=?,version=?,updated_at=? WHERE id=?").run(
      input.name, input.description, input.instructions, input.startUrl, JSON.stringify(input.steps), input.skillSlug, input.skillPath, version, updatedAt, id,
    );
    this.db.prepare("INSERT INTO workflow_versions (id,workflow_id,version,name,description,instructions,start_url,steps_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
      randomUUID(), id, version, input.name, input.description, input.instructions, input.startUrl, JSON.stringify(input.steps), updatedAt,
    );
    return this.getWorkflowRecord(id)?.workflow || null;
  }

  updateWorkflowRecord(id: string, input: { name: string; description?: string; instructions?: string; startUrl: string; skillSlug: string; skillPath: string }): TaughtWorkflow | null {
    const current = this.getWorkflowRecord(id);
    if (!current) return null;
    return this.reviseWorkflowRecord(id, {
      ...input, description: input.description?.trim() || current.workflow.description,
      instructions: input.instructions?.trim() || current.workflow.instructions, steps: current.steps,
    });
  }

  listWorkflowVersions(workflowId: string): SkillVersion[] {
    const rows = this.db.prepare("SELECT * FROM workflow_versions WHERE workflow_id=? ORDER BY version DESC").all(workflowId) as Row[];
    return rows.map((row) => ({
      id: String(row.id), workflowId: String(row.workflow_id), version: Number(row.version), name: String(row.name),
      description: String(row.description), instructions: String(row.instructions), startUrl: String(row.start_url),
      stepCount: jsonArray<unknown>(row.steps_json).length, createdAt: String(row.created_at),
    }));
  }

  getWorkflowVersion(workflowId: string, version: number): (SkillVersion & { steps: unknown[] }) | null {
    const row = this.db.prepare("SELECT * FROM workflow_versions WHERE workflow_id=? AND version=?").get(workflowId, version) as Row | undefined;
    if (!row) return null;
    return {
      id: String(row.id), workflowId: String(row.workflow_id), version: Number(row.version), name: String(row.name),
      description: String(row.description), instructions: String(row.instructions), startUrl: String(row.start_url),
      stepCount: jsonArray<unknown>(row.steps_json).length, steps: jsonArray<unknown>(row.steps_json), createdAt: String(row.created_at),
    };
  }

  deleteWorkflowRecord(id: string): { skillPath: string; botId: string } | null {
    const row = this.db.prepare("SELECT skill_path,bot_id FROM taught_workflows WHERE id=?").get(id) as Row | undefined;
    if (!row) return null;
    this.db.prepare("DELETE FROM taught_workflows WHERE id=?").run(id);
    return { skillPath: String(row.skill_path), botId: String(row.bot_id) };
  }

  getUsageSummary(): UsageSummary {
    const row = this.db.prepare(`SELECT COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(reasoning_tokens),0) reasoning_tokens,COALESCE(SUM(cache_read_tokens),0) cache_read_tokens,COALESCE(SUM(cost),0) cost,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed_runs,SUM(CASE WHEN status IN ('queued','running','awaiting_approval','waiting_for_teammate') THEN 1 ELSE 0 END) active_runs FROM runs WHERE created_at>=datetime('now','-7 days')`).get() as Row;
    const inputTokens = Number(row.input_tokens || 0), outputTokens = Number(row.output_tokens || 0), reasoningTokens = Number(row.reasoning_tokens || 0), cacheReadTokens = Number(row.cache_read_tokens || 0);
    return { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, totalTokens: inputTokens + outputTokens + reasoningTokens, cost: Number(row.cost || 0), completedRuns: Number(row.completed_runs || 0), activeRuns: Number(row.active_runs || 0) };
  }

  budgetAvailable(botId: string): { allowed: boolean; used: number; budget: number } {
    const bot = this.getBot(botId);
    if (!bot) return { allowed: false, used: 0, budget: 0 };
    return { allowed: bot.weeklyTokenBudget <= 0 || bot.tokensUsedThisWeek < bot.weeklyTokenBudget, used: bot.tokensUsedThisWeek, budget: bot.weeklyTokenBudget };
  }

  getState(threadId?: string): AppState {
    const threads = this.listThreads();
    const activeThreadId = threadId && threads.some((thread) => thread.id === threadId) ? threadId : threads[0]?.id || "team-room";
    return { bots: this.listBots(), threads, messages: this.listMessages(activeThreadId), runs: this.listRuns(activeThreadId), studioRuns: this.listStudioRuns(), routines: this.listRoutines(), automationEvents: this.listAutomationEvents(), automationAlerts: this.listAutomationAlerts(), workflows: this.listWorkflows(), approvals: this.listApprovals(), agentMessages: this.listAgentMessages(activeThreadId), providers: this.listProviders(), settings: this.getStudioSettings(), draft: this.getDraft(activeThreadId), usage: this.getUsageSummary(), activeThreadId };
  }
}
