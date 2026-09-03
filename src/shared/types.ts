export type BotStatus = "ready" | "working" | "waiting" | "offline" | "failed" | "celebrating";
export type MascotKind = "nova" | "blob" | "sprout" | "orbit" | "pebble" | "sunny";
export type RunStatus =
  | "awaiting_approval"
  | "waiting_for_teammate"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStage = "queued" | "planning" | "working" | "checking" | "waiting" | "done" | "blocked";
export type TaskStepStatus = "pending" | "active" | "completed" | "blocked" | "skipped";
export type TaskVerificationStatus = "pending" | "passed" | "partial" | "blocked";

export interface TaskStep {
  id: number;
  title: string;
  status: TaskStepStatus;
  detail: string | null;
}

export interface TaskVerificationCheck {
  label: string;
  passed: boolean;
}

export interface TaskContract {
  tracked: boolean;
  goal: string;
  deliverable: string;
  approvalBoundary: string | null;
  requiredApps: string[];
  stage: TaskStage;
  steps: TaskStep[];
  verificationStatus: TaskVerificationStatus;
  verificationSummary: string | null;
  verificationChecks: TaskVerificationCheck[];
}

export interface Bot {
  id: string;
  ownerId: string;
  providerInstanceId: string | null;
  name: string;
  emoji: string;
  mascot: MascotKind;
  color: string;
  role: string;
  instructions: string;
  model: string;
  status: BotStatus;
  computerEnabled: boolean;
  browserEnabled: boolean;
  macAccessEnabled: boolean;
  weeklyTokenBudget: number;
  tokensUsedThisWeek: number;
  createdAt: string;
  lastActiveAt: string | null;
  threadId: string;
}

export interface Thread {
  id: string;
  title: string;
  kind: "direct" | "room";
  botId: string | null;
  section: string | null;
  pinned: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
}

export interface MessageReplyPreview {
  id: string;
  senderName: string;
  body: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByYou: boolean;
}

export interface Message {
  id: string;
  threadId: string;
  senderType: "user" | "bot" | "system";
  senderId: string | null;
  senderName: string;
  senderEmoji: string | null;
  senderMascot: MascotKind | null;
  senderColor: string | null;
  body: string;
  createdAt: string;
  runId: string | null;
  replyTo: MessageReplyPreview | null;
  reactions: MessageReaction[];
  attachments: Attachment[];
}

export interface StudioSearchResult {
  id: string;
  kind: "message" | "file" | "routine" | "skill" | "teammate";
  title: string;
  subtitle: string;
  snippet: string;
  threadId: string;
  botId: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  threadId: string;
  messageId: string | null;
  name: string;
  mime: string;
  detectedMime: string;
  kind: "text" | "document" | "spreadsheet" | "presentation" | "image" | "audio" | "video" | "archive" | "file";
  processingStatus: "ready" | "partial" | "unsupported" | "failed";
  summary: string | null;
  previewText: string | null;
  metadata: Record<string, string | number | boolean>;
  previewUrl: string | null;
  source: "upload" | "artifact";
  revision: number;
  replacesAttachmentId: string | null;
  size: number;
  url: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  runId: string;
  botId: string;
  kind: "thought" | "tool" | "file" | "status" | "error" | "handoff" | "message";
  label: string;
  detail: string | null;
  createdAt: string;
}

export type AgentMessageKind = "message" | "question" | "finding" | "handoff";

export interface AgentMessage {
  id: string;
  threadId: string;
  fromBotId: string;
  fromBotName: string;
  fromBotMascot: MascotKind;
  fromBotColor: string;
  toBotId: string;
  toBotName: string;
  toBotMascot: MascotKind;
  toBotColor: string;
  body: string;
  kind: AgentMessageKind;
  expectsReply: boolean;
  runId: string;
  replyToId: string | null;
  hopCount: number;
  createdAt: string;
}

export interface Run {
  id: string;
  threadId: string;
  botId: string;
  botName: string;
  botEmoji: string;
  botMascot: MascotKind;
  botColor: string;
  parentRunId: string | null;
  steeredFromRunId: string | null;
  routineId: string | null;
  automationEventId: string | null;
  attemptCount: number;
  recoveredAt: string | null;
  consultationPending: boolean;
  attachmentIds: string[];
  prompt: string;
  status: RunStatus;
  approvalReason: string | null;
  approvalId: string | null;
  partialText: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  progressAt: string | null;
  summary: string | null;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cost: number;
  activities: Activity[];
  task: TaskContract;
}

export interface Approval {
  id: string;
  runId: string;
  botId: string;
  botName: string;
  kind: "prompt" | "terminal" | "browser" | "external";
  reason: string;
  actionLabel: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  decidedAt: string | null;
}

export type AutomationTriggerType = "schedule" | "webhook" | "github" | "calendar";

export interface RoutineTriggerConfig {
  eventName?: string;
  githubEvent?: string;
  githubAction?: string;
  repository?: string;
  titleContains?: string;
  minutesBefore?: number;
}

export interface Routine {
  id: string;
  name: string;
  botId: string;
  botName: string;
  botEmoji: string;
  threadId: string;
  prompt: string;
  cadence: "hourly" | "daily";
  intervalMinutes: number;
  triggerType: AutomationTriggerType;
  triggerConfig: RoutineTriggerConfig;
  hasWebhookSecret: boolean;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "never" | "completed" | "failed";
  runCount: number;
  consecutiveFailures: number;
  deduplicatedCount: number;
  lastError: string | null;
  pausedReason: string | null;
  lastSuccessAt: string | null;
  lastEventAt: string | null;
}

export type AutomationEventStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "rate_limited";

export interface AutomationEvent {
  id: string;
  routineId: string;
  routineName: string;
  botId: string;
  botName: string;
  source: AutomationTriggerType | "manual";
  externalId: string;
  status: AutomationEventStatus;
  runId: string | null;
  replayOfEventId: string | null;
  payloadSummary: string;
  receivedAt: string;
  finishedAt: string | null;
  error: string | null;
  attempt: number;
  repairHint: string | null;
}

export interface AutomationAlert {
  id: string;
  routineId: string;
  routineName: string;
  runId: string | null;
  eventId: string | null;
  kind: "missed" | "failure" | "approval" | "rate_limit";
  message: string;
  repairHint: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type RunnerStatus = "online" | "recovering" | "offline";
export type BackgroundServiceStatus = "installed" | "not_installed" | "unsupported";

export interface RunnerHealth {
  status: RunnerStatus;
  mode: "foreground" | "background";
  instanceId: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  lastCycleAt: string | null;
  recoveredRuns: number;
  dispatchedRuns: number;
  queuedRuns: number;
  runningRuns: number;
  waitingRuns: number;
  nextRoutineAt: string | null;
  lastError: string | null;
  backgroundService: BackgroundServiceStatus;
  backgroundServiceDetail: string;
}

export type ProviderKind = "opencode" | "claude" | "openai" | "github-copilot" | "gitlab" | "xai" | "custom";
export type ProviderRuntime = "opencode" | "claude_code";

export interface ProviderInstance {
  id: string;
  ownerId: string;
  provider: ProviderKind;
  name: string;
  authMode: "cli" | "subscription" | "api_key";
  runtime: ProviderRuntime;
  envName: string | null;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
  connected?: boolean;
  models?: string[];
  defaultModel?: string;
  note?: string;
}

export interface ProviderCatalogEntry {
  id: Exclude<ProviderKind, "custom">;
  name: string;
  shortName: string;
  description: string;
  badge: string;
  connected: boolean;
  installed: boolean;
  canConnect: boolean;
  connectionId: string | null;
  models: string[];
  note: string;
}

export interface ProviderLoginAttempt {
  id: string;
  providerId: string;
  status: "waiting" | "connected" | "failed";
  url: string | null;
  callbackMode: "auto" | "code" | null;
  instructions: string;
  error: string | null;
}

export interface ProviderStatus {
  id: "opencode";
  name: string;
  connected: boolean;
  cliAvailable: boolean;
  version: string | null;
  defaultModel: string;
  models: string[];
  note: string;
  instances: ProviderInstance[];
  catalog: ProviderCatalogEntry[];
  loginAttempts: ProviderLoginAttempt[];
}

export type ConnectorKind = "google_workspace" | "github_cli" | "slack_oauth" | "notion_oauth";
export type ConnectorServiceId = "gmail" | "google-drive" | "google-calendar" | "slack" | "notion" | "github";
export type GoogleConnectorService = "gmail" | "google-drive" | "google-calendar";

export interface ConnectorManifest {
  schemaVersion: 1;
  connectorId: string;
  service: ConnectorServiceId;
  name: string;
  description: string;
  auth: "oauth" | "local_cli";
  readCapability: string;
  writeCapability: string | null;
  writeRequiresApproval: boolean;
  dataBoundary: string;
  docsUrl: string;
}

export interface ConnectorConnection {
  id: string;
  ownerId: string;
  kind: ConnectorKind;
  name: string;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  status: "unconfigured" | "configured" | "connected" | "needs_attention";
  lastError: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BotConnectorAccess {
  botId: string;
  connectorId: string;
  service: ConnectorServiceId;
  canRead: boolean;
  canSend: boolean;
  updatedAt: string;
}

export interface ConnectorEvent {
  id: string;
  connectorId: string;
  botId: string | null;
  botName: string | null;
  action: string;
  status: "completed" | "failed" | "waiting";
  summary: string;
  createdAt: string;
}

export interface ConnectorCatalogEntry {
  id: ConnectorServiceId;
  connectorId?: string;
  manifestVersion?: 1;
  name: string;
  description: string;
  badge: string;
  availability: "live" | "next";
  connected: boolean;
  writeRequiresApproval?: boolean;
  capabilities: string[];
}

export interface OAuthConnectorStatus {
  connectorId: "slack" | "notion";
  configured: boolean;
  connected: boolean;
  managedClient: boolean;
  oauthInProgress: boolean;
  callbackUrl: string;
  accountName: string | null;
  lastError: string | null;
}

export interface SlackMessageSummary {
  channelId: string;
  channelName: string;
  timestamp: string;
  threadTimestamp: string | null;
  author: string;
  text: string;
  permalink: string | null;
}

export interface SlackConversationResult {
  channelId: string;
  messages: SlackMessageSummary[];
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
  lastEditedAt: string;
}

export interface NotionPageDetail extends NotionPageSummary {
  content: string;
  truncated: boolean;
}

export interface GoogleApiRecovery {
  service: "gmail" | "google-drive" | "google-calendar";
  serviceName: string;
  projectId: string;
  enableUrl: string;
}

export interface ConnectorStatus {
  connection: ConnectorConnection | null;
  connections: ConnectorConnection[];
  manifests: ConnectorManifest[];
  callbackUrl: string;
  managedGoogleClient: boolean;
  oauthInProgress: boolean;
  googleProjectId: string | null;
  googleApiRecovery: GoogleApiRecovery | null;
  googleApiRecoveries: GoogleApiRecovery[];
  github: GitHubConnectorStatus;
  slack: OAuthConnectorStatus;
  notion: OAuthConnectorStatus;
  catalog: ConnectorCatalogEntry[];
  access: BotConnectorAccess[];
  events: ConnectorEvent[];
}

export interface GitHubConnectorStatus {
  installed: boolean;
  connected: boolean;
  connecting: boolean;
  accountLogin: string | null;
  lastError: string | null;
}

export interface GitHubNotificationSummary {
  id: string;
  repository: string;
  title: string;
  type: string;
  reason: string;
  unread: boolean;
  updatedAt: string;
  url: string | null;
}

export interface GitHubIssueSummary {
  id: string;
  number: number;
  repository: string;
  title: string;
  state: "open" | "closed";
  author: string | null;
  labels: string[];
  updatedAt: string;
  url: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  body: string;
}

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  size: number | null;
}

export interface DriveFileDetail extends DriveFileSummary {
  content: string;
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  webLink: string;
  attendeeCount: number;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
  completedRuns: number;
  activeRuns: number;
}

export interface ComputerStatus {
  botId: string;
  container: "ready" | "stopped" | "unavailable";
  browser: "ready" | "stopped" | "unavailable";
  currentUrl: string | null;
  title: string | null;
  screenshot: string | null;
  updatedAt: string;
}

export interface TaughtWorkflow {
  id: string;
  botId: string;
  botName: string;
  name: string;
  skillSlug: string;
  description: string;
  instructions: string;
  startUrl: string;
  stepCount: number;
  version: number;
  source: "taught" | "imported" | "template" | "assigned";
  createdAt: string;
  updatedAt: string;
}

export interface SkillStep {
  type: "navigate" | "click" | "input" | "submit";
  url: string;
  selector?: string;
  value?: string;
  label?: string;
}

export interface SkillVersion {
  id: string;
  workflowId: string;
  version: number;
  name: string;
  description: string;
  instructions: string;
  startUrl: string;
  stepCount: number;
  createdAt: string;
}

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  instructions: string;
  startUrl: string;
  category: string;
  stepCount: number;
}

export interface CodeProjectAccess {
  botId: string;
  projectId: string;
  canRead: boolean;
  canWrite: boolean;
  canRun: boolean;
  updatedAt: string;
}

export interface CodeProject {
  id: string;
  ownerId: string;
  name: string;
  rootPath: string;
  gitRepository: boolean;
  projectKind: string;
  remoteUrl: string | null;
  defaultBranch: string | null;
  managedClone: boolean;
  access: CodeProjectAccess[];
  createdAt: string;
  updatedAt: string;
}

export interface CodeProjectEdit {
  id: string;
  projectId: string;
  botId: string;
  botName: string;
  path: string;
  operation: "created" | "updated";
  additions: number;
  deletions: number;
  workspaceRunId: string | null;
  reversible: boolean;
  restoredAt: string | null;
  createdAt: string;
}

export interface CodeTaskWorkspace {
  runId: string;
  projectId: string;
  projectName: string;
  botId: string;
  botName: string;
  branch: string;
  rootPath: string;
  status: "active" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface CodeTaskReview {
  id: string;
  sourceRunId: string;
  reviewerRunId: string;
  projectId: string;
  reviewerBotId: string;
  reviewerBotName: string;
  verdict: "approved" | "changes_requested";
  summary: string;
  findings: string[];
  headCommit: string;
  createdAt: string;
}

export interface CodeProjectReview {
  projectId: string;
  gitRepository: boolean;
  branch: string | null;
  defaultBranch: string | null;
  remoteUrl: string | null;
  workspace: CodeTaskWorkspace | null;
  changes: string[];
  diff: string;
  truncated: boolean;
}

export interface CodeProjectSuggestion {
  name: string;
  rootPath: string;
  gitRepository: boolean;
  projectKind: string;
}

export interface WorkspaceFile {
  path: string;
  size: number;
  modifiedAt: string;
  kind: "file" | "directory";
}

export interface StudioSettings {
  macAccessEnabled: boolean;
}

export interface StudioDraft {
  threadId: string;
  body: string;
  source: "web" | "ios" | null;
  updatedAt: string | null;
}

export interface AppState {
  bots: Bot[];
  threads: Thread[];
  messages: Message[];
  runs: Run[];
  studioRuns: Run[];
  routines: Routine[];
  automationEvents: AutomationEvent[];
  automationAlerts: AutomationAlert[];
  runner: RunnerHealth;
  workflows: TaughtWorkflow[];
  approvals: Approval[];
  agentMessages: AgentMessage[];
  providers: ProviderInstance[];
  settings: StudioSettings;
  draft: StudioDraft;
  usage: UsageSummary;
  activeThreadId: string;
}
