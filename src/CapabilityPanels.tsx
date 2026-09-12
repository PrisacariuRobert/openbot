import { ExtensionsPanel } from "./components/ExtensionsPanel";
import { WorkflowChecksPanel } from "./components/WorkflowChecksPanel";
import { WorkSourcesPanel } from "./components/WorkSourcesPanel";
import { WorkFollowupsPanel } from "./components/WorkFollowupsPanel";
import { RecipeLibraryPanel } from "./components/RecipeLibraryPanel";
import type { RoutineSchedule } from "./shared/calendar-schedule";
import { AwayAccessPanel } from "./components/AwayAccessPanel";
import { DirectScreen, type DirectOp } from "./studio/DirectScreen";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Brain,
  ArrowUp,
  AtSign,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock3,
  Code2,
  Coins,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Flame,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  GitPullRequest,
  Globe2,
  HardDrive,
  KeyRound,
  Layers3,
  Keyboard,
  LoaderCircle,
  Menu,
  MonitorPlay,
  MoreHorizontal,
  Inbox,
  Mail,
  MessageCircleReply,
  Mic,
  MicOff,
  MousePointer2,
  PanelTop,
  Paperclip,
  Pin,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  EyeOff,
  Presentation,
  RotateCcw,
  Terminal,
  Trash2,
  Users,
  WandSparkles,
  Webhook,
  Wifi,
  WifiOff,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import type {
  AppState,
  Attachment,
  AutomationAlert,
  AutomationEvent,
  AutomationTriggerType,
  Bot,
  BotStatus,
  CalendarEventSummary,
  CodeProject,
  CodeProjectEdit,
  CodeProjectReview,
  CodeProjectSuggestion,
  CodeTaskReview,
  CodeTaskWorkspace,
  ComputerStatus,
  ConnectorStatus,
  DriveFileSummary,
  DropboxFileSummary,
  GmailMessageSummary,
  GitHubIssueSummary,
  GitHubNotificationSummary,
  GoogleConnectorService,
  MascotKind,
  Message,
  NotionPageSummary,
  TodoistTaskSummary,
  ProviderCatalogEntry,
  ProviderKind,
  ProviderLoginAttempt,
  ProviderStatus,
  Readiness,
  Routine,
  RunnerCareStatus,
  RunnerHealth,
  Run,
  RunReceipt,
  SlackMessageSummary,
  SkillTemplate,
  SkillVersion,
  StudioDraft,
  StudioSearchResult,
  TaughtWorkflow,
  Thread,
  WorkspaceFile,
  ArtifactSummary,
} from "./shared/types";
import { mentionedBotIds, mentionSlug } from "./shared/routing";
import { presentBotMessage, signalKindLabels } from "./shared/presentation";
import { routineScheduleLabel, routineStartsInLabel } from "./shared/routines";
import { ProviderIcon } from "./ProviderIcon";
import { useModalFocus } from "./components/useModalFocus";
import { ConnectorIcon } from "./ConnectorIcon";

import { Character } from "./studio/Character";
import { AppearancePicker } from "./studio/AppearancePicker";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const CalendarScheduleFields = lazy(() => import("./components/CalendarScheduleFields").then((module) => ({ default: module.CalendarScheduleFields })));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new ApiError(body.error || "Something went wrong.", response.status);
  return body;
}

function relativeTime(value: string | null) {
  if (!value) return "New";
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 45) return "Now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function compactDuration(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}
function shortModel(model: string) {
  // Custom model IDs are user-entered labels, not generated connection names.
  if (/^openbot-[^/]+\//.test(model)) return model.slice(model.indexOf("/") + 1);
  return model
    .replace(
      /^(opencode|opencode-go|claude-code|openai|github-copilot|gitlab|xai)\//,
      "",
    )
    .replace(/-contributor-free$/, " free")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const GOOGLE_API_SETUP = [
  { id: "gmail" as const, name: "Gmail", api: "gmail.googleapis.com" },
  { id: "google-drive" as const, name: "Drive", api: "drive.googleapis.com" },
  {
    id: "google-calendar" as const,
    name: "Calendar",
    api: "calendar-json.googleapis.com",
  },
];

type MascotBot = {
  id?: string;
  name: string;
  color: string;
  mascot: MascotKind;
  status?: BotStatus;
};
function Mascot({ bot, size = "medium", state }: { bot: MascotBot; size?: "tiny" | "small" | "medium" | "large"; state?: BotStatus }) { return <Character name={bot.name} color={bot.color} variant={bot.mascot} status={state || bot.status} size={{ tiny: 28, small: 38, medium: 52, large: 84 }[size]} />; }

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-orbit brand-orbit-a" />
      <span className="brand-orbit brand-orbit-b" />
      <span className="brand-dot" />
    </div>
  );
}

function RoomCluster({
  bots,
  large = false,
  hero = false,
}: {
  bots: MascotBot[];
  large?: boolean;
  hero?: boolean;
}) {
  return (
    <div
      className={`room-cluster room-cluster-motion ${large ? "room-cluster-large" : ""} ${hero ? "room-cluster-hero" : ""}`}
      aria-label={`${bots
        .slice(0, 3)
        .map((bot) => bot.name)
        .join(", ")} are here`}
    >
      {bots.slice(0, 3).map((bot) => (
        <Mascot
          key={bot.id || bot.name}
          bot={bot}
          size={hero ? "large" : large ? "medium" : "tiny"}
        />
      ))}
    </div>
  );
}

const taskStageLabels: Record<Run["task"]["stage"], string> = {
  queued: "Waiting for a turn",
  planning: "Setting the finish line",
  working: "Working through the job",
  checking: "Checking the result",
  waiting: "Waiting for your okay",
  done: "Finished",
  blocked: "Needs attention",
};

export function ControlPanel({
  state,
  onNotify,
  onOpenProvider,
  onOpenRemote,
  onOpenConnectors,
  onOpenProjects,
  onOpenSkills,
  onSetMacAccess,
  onSetSelfExtend,
  onSetCodingModel,
  onSetEmbeddings,
  onRecallDelegation,
  onSetMaxTeammates,
  onRestoreTeammate,
  onSetYoloMode,
  onImportTeammate,
}: {
  state: AppState;
  onNotify: () => void;
  onOpenProvider: () => void;
  onOpenRemote: () => void;
  onOpenConnectors: () => void;
  onOpenProjects: () => void;
  onOpenSkills: () => void;
  onSetMacAccess: (enabled: boolean) => Promise<void>;
  onSetSelfExtend: (enabled: boolean) => Promise<void>;
  onSetCodingModel: (model: string | null) => Promise<void>;
  onSetEmbeddings: (providerInstanceId: string | null, model: string | null) => Promise<void>;
  onRecallDelegation: (runId: string) => Promise<void>;
  onSetMaxTeammates: (max: number) => Promise<void>;
  onRestoreTeammate: (id: string) => Promise<void>;
  onSetYoloMode: (enabled: boolean) => Promise<void>;
  onImportTeammate: (bundle: unknown) => Promise<{ name: string; skills: number; routines: number }>;
}) {
  const active = state.bots.filter((bot) =>
    ["working", "waiting"].includes(bot.status),
  );
  const codingChoices = [
    ...new Set(
      state.bots.map((bot) => bot.model).filter((model): model is string => Boolean(model)),
    ),
  ];
  const embeddingConnections = state.providers.filter(
    (provider) => provider.authMode === "api_key",
  );
  const embeddingsActive = Boolean(
    state.settings.embeddingsProviderInstanceId && state.settings.embeddingsModel,
  );
  const [embeddingsModelDraft, setEmbeddingsModelDraft] = useState(
    state.settings.embeddingsModel || "",
  );
  const teammateImportInput = useRef<HTMLInputElement>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/readiness", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Readiness is unavailable.");
        const result = (await response.json()) as Readiness;
        if (!abort.signal.aborted) setReadiness(result);
      })
      .catch(() => { if (!abort.signal.aborted) setReadiness(null); });
    return () => abort.abort();
  }, [state.bots.length, state.providers.length]);
  const signals = (state.agentMessages || []).slice(-6).reverse();
  return (
    <div className="control-panel">
      <div className="control-hero">
        <div>
          <span className="control-kicker">
            <Sparkles size={13} /> Your local studio
          </span>
          <h3>
            {active.length
              ? `${active.length} teammate${active.length > 1 ? "s" : ""} in motion`
              : "Everything is calm"}
          </h3>
          <p>One place to see progress, permissions and usage.</p>
        </div>
        <div className="hero-orb">
          <Logo />
        </div>
      </div>
      <div className="stat-grid">
        <div>
          <Coins size={17} />
          <strong>{compactNumber(state.usage.totalTokens)}</strong>
          <span>tokens · 7 days</span>
        </div>
        <div>
          <Check size={17} />
          <strong>{state.usage.completedRuns}</strong>
          <span>finished tasks</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <strong>{state.approvals.length}</strong>
          <span>waiting approvals</span>
        </div>
      </div>
      {readiness && !readiness.ready && (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Get set up</h3>
              <p>Three steps to your first teammate</p>
            </div>
          </div>
          <div className="setup-checklist">
            {readiness.steps.map((step) => (
              <div key={step.id} className={step.ready ? "done" : ""}>
                {step.ready ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
                {!step.ready && step.id !== "teammate" && (
                  <a href="/?panel=provider">Set up</a>
                )}
                {!step.ready && step.id === "teammate" && (
                  <a href="/?thread=team-room">Create</a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Studio access</h3>
            <p>One clear permission shared by every teammate</p>
          </div>
          <span
            className={`studio-access-state ${state.settings.macAccessEnabled ? "on" : ""}`}
          >
            <i />
            {state.settings.macAccessEnabled
              ? "Available to everyone"
              : "Off for everyone"}
          </span>
        </div>
        <label className="studio-access-card">
          <span className="studio-access-icon">
            <HardDrive size={20} />
          </span>
          <span>
            <strong>Files & apps on this Mac</strong>
            <small>
              Every current and future teammate can inspect visible files and
              accessible app controls, plus read Calendar and Mail with macOS Automation consent. File moves, clicks and typing still wait
              for your okay.
            </small>
          </span>
          <input
            aria-label="Mac access for every teammate"
            type="checkbox"
            checked={state.settings.macAccessEnabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              if (
                !enabled ||
                window.confirm(
                  "Let every teammate inspect visible files and accessible app controls on this Mac? Actions such as moving files, clicking and typing will still ask first.",
                )
              )
                void onSetMacAccess(enabled);
            }}
          />
        </label>
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Self-extending studio</h3>
            <p>When a teammate hits a capability it does not have</p>
          </div>
          <span
            className={`studio-access-state ${state.settings.selfExtendEnabled ? "on" : ""}`}
          >
            <i />
            {state.settings.selfExtendEnabled ? "On" : "Off"}
          </span>
        </div>
        <label className="studio-access-card">
          <span className="studio-access-icon">
            <Wrench size={20} />
          </span>
          <span>
            <strong>Let teammates write their own tools</strong>
            <small>
              When something is missing, the teammate asks first and shows its
              exact plan. Approving restarts the same task with your coding
              model. New tools stay in the teammate's private workspace and you
              can delete them in Files.
            </small>
          </span>
          <input
            aria-label="Let teammates write their own tools"
            type="checkbox"
            checked={state.settings.selfExtendEnabled}
            onChange={(event) => {
              void onSetSelfExtend(event.target.checked);
            }}
          />
        </label>
        {state.settings.selfExtendEnabled && (
          <label className="field">
            <span>Coding model for self-built tools</span>
            <select
              value={state.settings.codingModel || ""}
              onChange={(event) => {
                void onSetCodingModel(event.target.value || null);
              }}
            >
              <option value="">Same model as the teammate</option>
              {codingChoices.map((value) => (
                <option key={value} value={value}>
                  {shortModel(value)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Memory with meaning</h3>
            <p>Let teammates recall notes by meaning, not just shared words</p>
          </div>
          <span
            className={`studio-access-state ${embeddingsActive ? "on" : ""}`}
          >
            <i />
            {embeddingsActive ? "On" : "Keyword only"}
          </span>
        </div>
        <label className="studio-access-card">
          <span className="studio-access-icon">
            <Brain size={20} />
          </span>
          <span>
            <strong>Understand saved notes by meaning</strong>
            <small>
              Pick a key-based or local model connection and an embedding
              model. Teammates then match memories by meaning first, wording
              second. Anything the connection cannot reach falls back to
              keyword search automatically.
            </small>
          </span>
          <input
            aria-label="Understand saved notes by meaning"
            type="checkbox"
            checked={embeddingsActive}
            disabled={!embeddingsActive && embeddingConnections.length === 0}
            onChange={(event) => {
              if (!event.target.checked)
                void onSetEmbeddings(null, null);
              else if (embeddingConnections[0])
                void onSetEmbeddings(
                  embeddingConnections[0].id,
                  embeddingsModelDraft || null,
                );
            }}
          />
        </label>
        <label className="field">
          <span>Embeddings connection</span>
          <select
            value={state.settings.embeddingsProviderInstanceId || ""}
            onChange={(event) => {
              void onSetEmbeddings(event.target.value || null, null);
            }}
          >
            <option value="">Keyword search only</option>
            {embeddingConnections.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        {state.settings.embeddingsProviderInstanceId && (
          <label className="field">
            <span>Embedding model</span>
            <input
              key={state.settings.embeddingsModel || ""}
              defaultValue={embeddingsModelDraft}
              placeholder="text-embedding-3-small"
              maxLength={200}
              onChange={(event) => setEmbeddingsModelDraft(event.target.value)}
              onBlur={(event) => {
                const model = event.target.value.trim();
                if (model && model !== state.settings.embeddingsModel)
                  void onSetEmbeddings(
                    state.settings.embeddingsProviderInstanceId,
                    model,
                  );
              }}
            />
          </label>
        )}
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Teammates</h3>
            <p>
              {state.bots.length} of {state.settings.maxTeammates} seat
              {state.settings.maxTeammates === 1 ? "" : "s"} in use
            </p>
          </div>
        </div>
        <label className="field">
          <span>Teammate limit</span>
          <input
            key={state.settings.maxTeammates}
            type="number"
            min={1}
            max={100}
            defaultValue={state.settings.maxTeammates}
            onBlur={(event) => {
              const max = Math.max(1, Math.min(100, Math.floor(Number(event.target.value)) || state.settings.maxTeammates));
              if (max !== state.settings.maxTeammates) void onSetMaxTeammates(max);
            }}
          />
        </label>
        <div className="delegation-actions">
          <input
            ref={teammateImportInput}
            type="file"
            className="visually-hidden"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (teammateImportInput.current) teammateImportInput.current.value = "";
              if (!file) return;
              void (async () => {
                if (file.size > 256_000) throw new Error("That teammate file is too large. Choose one under 256 KB.");
                const bundle = JSON.parse(await file.text()) as unknown;
                const imported = await onImportTeammate(bundle);
                window.alert(`Imported ${imported.name} as a new teammate${imported.routines ? ` with ${imported.routines} paused routine${imported.routines === 1 ? "" : "s"}` : ""}. Choose an AI connection for them before starting work.`);
              })().catch((error: Error) => window.alert(error instanceof SyntaxError ? "That file is not an OpenBot teammate file." : error.message || "This teammate could not be imported."));
            }}
          />
          <button type="button" onClick={() => teammateImportInput.current?.click()}>
            <Download size={15} /> Import teammate
          </button>
        </div>
        {state.retiredBots.length > 0 && (
          <div className="signal-list">
            {state.retiredBots.map((bot) => (
              <article key={bot.id}>
                <div className="signal-route">
                  <Mascot
                    bot={{ name: bot.name, mascot: bot.mascot, color: bot.color }}
                    size="tiny"
                  />
                  <span>{bot.name}</span>
                  <b>retired</b>
                </div>
                <p>{bot.role}</p>
                <div className="delegation-actions">
                  <button onClick={() => { void onRestoreTeammate(bot.id); }}>
                    Restore
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>YOLO mode</h3>
            <p>Skip every approval. Nothing pauses.</p>
          </div>
          <span
            className={`studio-access-state ${state.settings.yoloMode ? "on" : ""}`}
          >
            <i />
            {state.settings.yoloMode ? "On — nothing pauses" : "Off"}
          </span>
        </div>
        <label className="studio-access-card">
          <span className="studio-access-icon">
            <Flame size={20} />
          </span>
          <span>
            <strong>Let teammates act without asking</strong>
            <small>
              Sends, publishes, file moves, browser clicks and code runs go
              through immediately — including anything your Auto Review rules
              would stop. Every auto-decision is still recorded. Access grants
              stay exactly as they are.
            </small>
          </span>
          <input
            aria-label="Let teammates act without asking"
            type="checkbox"
            checked={state.settings.yoloMode}
            onChange={(event) => {
              const enabled = event.target.checked;
              if (
                !enabled ||
                window.confirm(
                  "Turn on YOLO mode? Teammates will send, publish, move files and run commands without asking first — including actions your Auto Review rules would normally stop. Every auto-decision is still recorded, and access grants do not change.",
                )
              )
                void onSetYoloMode(enabled);
            }}
          />
        </label>
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Right now</h3>
            <p>Real activity from every teammate</p>
          </div>
        </div>
        {active.length ? (
          <div className="now-list">
            {active.map((bot) => (
              <div key={bot.id}>
                <Mascot bot={bot} size="medium" />
                <span>
                  <strong>{bot.name}</strong>
                  <small>
                    {bot.status === "waiting"
                      ? state.approvals.some(
                          (approval) => approval.botId === bot.id,
                        )
                        ? "Waiting for your okay"
                        : "Consulting the team"
                      : "Working in the background"}
                  </small>
                </span>
                <i className={`now-dot now-${bot.status}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="calm-card">
            <RoomCluster bots={state.bots} large />
            <span>
              <strong>Ready when you are</strong>
              <small>
                Start in any conversation. Up to three teammates can work at
                once.
              </small>
            </span>
          </div>
        )}
      </section>
      {state.approvals.length > 0 && (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Needs your attention</h3>
              <p>These never expire or disappear on their own</p>
            </div>
          </div>
          <div className="attention-list">
            {state.approvals.map((approval) => (
              <div key={approval.id}>
                <ShieldCheck size={18} />
                <span>
                  <strong>{approval.botName}</strong>
                  <small>{approval.reason}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Team signals</h3>
            <p>Questions, findings and handoffs between teammates</p>
          </div>
          <span className="bounded-badge">Bounded</span>
        </div>
        {state.delegations.length > 0 && (
          <div className="signal-list">
            {state.delegations.map((delegation) => {
              const coordinator = state.bots.find((bot) => bot.id === delegation.botId);
              const consultantNames = [...new Set(delegation.consultants.map((consultant) => consultant.botName))];
              const stuck = delegation.consultants.length > 0 && delegation.consultants.every((consultant) => ["failed", "cancelled"].includes(consultant.status));
              return (
                <article key={delegation.runId}>
                  <div className="signal-route">
                    {coordinator && (
                      <Mascot
                        bot={{ name: coordinator.name, mascot: coordinator.mascot, color: coordinator.color }}
                        size="tiny"
                      />
                    )}
                    <span>{delegation.botName}</span>
                    <i>→</i>
                    <span>{consultantNames.join(" and ") || "a teammate"}</span>
                    <b>{stuck ? "stuck" : "waiting"}</b>
                  </div>
                  <p>{delegation.request}</p>
                  <small>
                    {delegation.consultants.map((consultant) => `${consultant.botName} · ${consultant.status}`).join(" · ") || "No consultant work recorded"}
                    {" · "}
                    waiting since {relativeTime(delegation.waitingSince).toLowerCase()}
                  </small>
                  <div className="delegation-actions">
                    <button onClick={() => { void onRecallDelegation(delegation.runId); }}>
                      Recall
                    </button>
                    <a href={`/?thread=${encodeURIComponent(delegation.threadId)}`}>Open thread</a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {signals.length ? (
          <div className="signal-list">
            {signals.map((signal) => (
              <article key={signal.id}>
                <div className="signal-route">
                  <Mascot
                    bot={{
                      name: signal.fromBotName,
                      mascot: signal.fromBotMascot,
                      color: signal.fromBotColor,
                    }}
                    size="tiny"
                  />
                  <span>{signal.fromBotName}</span>
                  <i>→</i>
                  <Mascot
                    bot={{
                      name: signal.toBotName,
                      mascot: signal.toBotMascot,
                      color: signal.toBotColor,
                    }}
                    size="tiny"
                  />
                  <span>{signal.toBotName}</span>
                  <b>{signalKindLabels[signal.kind] || "shared"}</b>
                </div>
                <p>{signal.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-signal">
            <Users size={19} />
            <span>
              <strong>Quiet teamwork</strong>
              <small>
                Teammates can ask each other questions without creating endless
                loops.
              </small>
            </span>
          </div>
        )}
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Helpful extras</h3>
            <p>Quiet unless you turn them on</p>
          </div>
        </div>
        <div className="quick-actions">
          <button onClick={onOpenSkills}>
            <WandSparkles size={18} />
            <span>
              <strong>Skill Library</strong>
              <small>Teach once, reuse safely, and share between teammates</small>
            </span>
          </button>
          <button onClick={onOpenProjects}>
            <Code2 size={18} />
            <span>
              <strong>Code projects</strong>
              <small>
                Let selected teammates build and test inside approved folders
              </small>
            </span>
          </button>
          <button onClick={onOpenConnectors}>
            <Mail size={18} />
            <span>
              <strong>Apps & tools</strong>
              <small>
                Connect mail, Slack, Notion and GitHub with access for each
                teammate
              </small>
            </span>
          </button>
          <button onClick={onOpenRemote}>
            <Smartphone size={18} />
            <span>
              <strong>Phone remote</strong>
              <small>Check in, speak tasks and approve on the go</small>
            </span>
          </button>
          <button onClick={onNotify}>
            <Bell size={18} />
            <span>
              <strong>Finish notifications</strong>
              <small>Hear when work or approval is ready</small>
            </span>
          </button>
          <button onClick={onOpenProvider}>
            <KeyRound size={18} />
            <span>
              <strong>Your AI connections</strong>
              <small>
                {state.providers.length} private connection
                {state.providers.length === 1 ? "" : "s"}
              </small>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

const searchKindLabels: Record<StudioSearchResult["kind"], string> = {
  message: "Message",
  file: "File",
  routine: "Automation",
  skill: "Skill",
  teammate: "Teammate",
};
function SearchResultIcon({ kind }: { kind: StudioSearchResult["kind"] }) {
  if (kind === "file") return <FileText size={17} />;
  if (kind === "routine") return <Clock3 size={17} />;
  if (kind === "skill") return <WandSparkles size={17} />;
  if (kind === "teammate") return <Users size={17} />;
  return <MessageCircleReply size={17} />;
}

export function SearchPanel({
  initialQuery,
  onOpenResult,
}: {
  initialQuery: string;
  onOpenResult: (result: StudioSearchResult) => void;
}) {
  const [query, setQuery] = useState(initialQuery),
    [results, setResults] = useState<StudioSearchResult[]>([]),
    [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(
      () =>
        api<StudioSearchResult[]>(`/api/search?q=${encodeURIComponent(value)}`)
          .then(setResults)
          .catch(() => setResults([]))
          .finally(() => setLoading(false)),
      220,
    );
    return () => window.clearTimeout(timer);
  }, [query]);
  return (
    <div className="studio-search-panel">
      <label className="studio-search-input">
        <Search size={20} />
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search messages, files, automations and skills"
        />
        <kbd>⌘ K</kbd>
      </label>
      <p className="studio-search-help">
        Everything stays on this OpenBot. Search opens the original
        conversation, not a copied result.
      </p>
      {loading ? (
        <div className="search-loading">
          <LoaderCircle className="spinner" /> Looking across your studio…
        </div>
      ) : query.trim().length < 2 ? (
        <div className="search-empty">
          <Search size={24} />
          <strong>Find anything you worked on</strong>
          <span>
            Try a project name, a phrase from a message, or the name of a file.
          </span>
        </div>
      ) : results.length ? (
        <div className="studio-search-results">
          {results.map((result) => (
            <button
              key={`${result.kind}-${result.id}`}
              onClick={() => onOpenResult(result)}
            >
              <span className={`search-kind search-kind-${result.kind}`}>
                <SearchResultIcon kind={result.kind} />
              </span>
              <span>
                <b>{result.title}</b>
                <small>
                  {searchKindLabels[result.kind]} · {result.subtitle}
                </small>
                <p>{result.snippet}</p>
              </span>
              <time>{relativeTime(result.createdAt)}</time>
              <ArrowUp size={14} />
            </button>
          ))}
        </div>
      ) : (
        <div className="search-empty">
          <Search size={24} />
          <strong>No matches yet</strong>
          <span>Try fewer or more general words.</span>
        </div>
      )}
    </div>
  );
}

type TakeoverResult = { url: string; title: string; screenshot: string | null };

function LiveBrowser({
  bot,
  status,
  onStatus,
  onBack,
  onNotice,
}: {
  bot: Bot;
  status: ComputerStatus | undefined;
  onStatus: (status: ComputerStatus) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const [address, setAddress] = useState(
      status?.currentUrl || "https://www.google.com/",
    ),
    [busy, setBusy] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const merge = (result: TakeoverResult) =>
    onStatus({
      botId: bot.id,
      container: status?.container || "stopped",
      browser: "ready",
      currentUrl: result.url,
      title: result.title,
      screenshot: result.screenshot,
      updatedAt: new Date().toISOString(),
    });
  // Keystrokes queue in order and never block the screen; clicks and typing
  // go straight to the page like a real browser. Nothing typed is stored,
  // logged, or sent to the model.
  const send = (op: DirectOp) => {
    const path =
      op.kind === "click" ? "takeover/click" : op.kind === "press" ? "takeover/press" : op.kind === "text" ? "takeover/type" : "takeover/scroll";
    const body =
      op.kind === "click"
        ? { x: op.x, y: op.y }
        : op.kind === "press"
          ? { key: op.key }
          : op.kind === "text"
            ? { value: op.value, replace: false }
            : { x: op.x, y: op.y, deltaY: op.deltaY };
    queue.current = queue.current
      .then(() => api<TakeoverResult>(`/api/bots/${bot.id}/browser/${path}`, { method: "POST", body: JSON.stringify(body) }))
      .then(merge, (error: unknown) =>
        onNotice(error instanceof Error ? error.message : "The browser needs another try."),
      )
      .catch(() => {});
  };
  const openAddress = async () => {
    setBusy(true);
    try {
      await api(`/api/bots/${bot.id}/browser/open`, {
        method: "POST",
        body: JSON.stringify({ url: address }),
      });
      onStatus(await api<ComputerStatus>(`/api/bots/${bot.id}/computer`));
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "That page could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="live-browser">
      <div className="live-browser-heading">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Live Studio
        </button>
        <span>
          <Mascot bot={bot} size="small" />
          <span>
            <strong>You’re guiding {bot.name}</strong>
            <small>
              Click a field, then type — keys go straight to the page.
            </small>
          </span>
        </span>
        <i className={status?.browser === "ready" ? "ready" : ""}>
          {status?.browser === "ready" ? "Connected" : "Ready on demand"}
        </i>
      </div>
      <form
        className="live-address"
        onSubmit={(event) => {
          event.preventDefault();
          void openAddress();
        }}
      >
        <Globe2 size={15} />
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          aria-label="Browser address"
        />
        <button disabled={busy}>
          {busy ? (
            <LoaderCircle className="spinner" size={14} />
          ) : (
            <ArrowUp size={14} />
          )}{" "}
          Open
        </button>
      </form>
      <div className="live-screen-frame">
        <DirectScreen
          image={status?.screenshot || null}
          alt={`${bot.name}'s current browser`}
          interactive={status?.browser === "ready"}
          badge="Click a field, then type"
          label="Live browser screen. Click a field, then type — keys go straight to the page."
          send={send}
          empty={
            <div className="live-screen-empty">
              <Mascot bot={{ ...bot, status: "waiting" }} size="large" />
              <strong>{bot.name}’s browser is resting</strong>
              <span>
                Open a page when you want to sign in or guide the next step.
              </span>
              <button
                className="button-primary"
                onClick={() => void openAddress()}
                disabled={busy}
              >
                <Globe2 size={15} /> Start browser
              </button>
            </div>
          }
        />
      </div>
      <p className="takeover-hint">
        Click a field, then type — like a real browser. Nothing typed is stored
        or sent to the model.
      </p>
    </div>
  );
}

export function LiveStudioPanel({
  state,
  onOpenThread,
  onReview,
  onCancel,
  onResolveAction,
  onUpdateThread,
  onOpenControl,
  onNotice,
}: {
  state: AppState;
  onOpenThread: (threadId: string) => void;
  onReview: (runId: string) => void;
  onCancel: (runId: string) => Promise<void>;
  onResolveAction: (
    actionId: string,
    outcome: "completed" | "not_completed",
  ) => Promise<void>;
  onUpdateThread: (
    threadId: string,
    patch: Partial<Pick<Thread, "section" | "pinned" | "hidden">>,
  ) => Promise<void>;
  onOpenControl: () => void;
  onNotice: (message: string) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, ComputerStatus>>({}),
    [watching, setWatching] = useState<string | null>(null);
  const refresh = useCallback(
    async (botIds = state.bots.map((bot) => bot.id)) => {
      const settled = await Promise.allSettled(
        botIds.map((id) => api<ComputerStatus>(`/api/bots/${id}/computer`)),
      );
      setStatuses((current) => {
        const next = { ...current };
        for (const item of settled)
          if (item.status === "fulfilled") next[item.value.botId] = item.value;
        return next;
      });
    },
    [state.bots],
  );
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(
      () =>
        void refresh(
          watching
            ? [watching]
            : state.bots
                .filter((bot) => bot.status !== "ready")
                .map((bot) => bot.id),
        ),
      watching ? 2_600 : 6_000,
    );
    return () => window.clearInterval(timer);
  }, [refresh, state.bots, watching]);
  const watchedBot = state.bots.find((bot) => bot.id === watching);
  if (watchedBot)
    return (
      <LiveBrowser
        bot={watchedBot}
        status={statuses[watchedBot.id]}
        onStatus={(status) =>
          setStatuses((current) => ({ ...current, [status.botId]: status }))
        }
        onBack={() => setWatching(null)}
        onNotice={onNotice}
      />
    );
  const attentionRuns = state.studioRuns.filter((run) =>
    ["awaiting_approval", "failed"].includes(run.status),
  );
  // Repeated identical failures collapse into one card with a count, so four
  // crashed runs do not read as four emergencies. The first run of each group
  // (the newest) carries the message.
  const groupedAttentionRuns = Array.from(
    attentionRuns.reduce((groups, run) => {
      const key = `${run.botId}:${run.status}`;
      const group = groups.get(key);
      if (group) group.count += 1;
      else groups.set(key, { run, count: 1 });
      return groups;
    }, new Map<string, { run: (typeof attentionRuns)[number]; count: number }>()),
  ).map(([, group]) => group);
  const approvedActions = state.approvedActions || [];
  const uncertainActions = approvedActions.filter(
    (action) => action.status === "uncertain",
  );
  const currentRun = (bot: Bot) =>
    state.studioRuns.find(
      (run) =>
        run.botId === bot.id &&
        [
          "queued",
          "running",
          "awaiting_approval",
          "waiting_for_teammate",
        ].includes(run.status),
    ) || state.studioRuns.find((run) => run.botId === bot.id);
  const hiddenBots = state.bots.filter(
    (bot) => state.threads.find((thread) => thread.id === bot.threadId)?.hidden,
  );
  const activeWork = state.studioRuns.filter((run) => ["queued", "running", "waiting_for_teammate"].includes(run.status));
  const finishedWork = state.studioRuns
    .filter((run) => !run.parentRunId && ["completed", "failed"].includes(run.status))
    .sort((a, b) => (b.finishedAt || "").localeCompare(a.finishedAt || ""))
    .slice(0, 5);
  return (
    <div className="live-studio-panel">
      <div className="live-hero">
        <div>
          <span>
            <i /> {state.runner.deployment?.mode === "private_runner" ? "Private home online" : state.runner.backgroundService === "installed" ? "Background protection active" : "Live from this Mac"}
          </span>
          <h3>{activeWork.length ? "In progress" : "All quiet for now"}</h3>
          <p>{activeWork.length ? "Your team's current work, with the next step in view." : "New tasks and requests for your approval will appear here."}</p>
        </div>
        <RoomCluster bots={state.bots} hero />
      </div>
      <div className="live-summary live-summary-compact">
        <div>
          <MonitorPlay size={17} />
          <strong>
            {activeWork.length}
          </strong>
          <span>in progress</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <strong>{Math.max(state.approvals.length, attentionRuns.filter((run) => run.status === "awaiting_approval").length) + uncertainActions.length}</strong>
          <span>need your decision</span>
        </div>
        <div>
          <Check size={17} />
          <strong>{state.usage.completedRuns}</strong>
          <span>finished this week</span>
        </div>
        <button onClick={onOpenControl}>
          <Settings2 size={16} /> Studio access
        </button>
      </div>
      {(attentionRuns.length > 0 || state.automationAlerts.length > 0 || uncertainActions.length > 0) && (
        <section className="live-attention">
          <header>
            <span>
              <Bell size={15} />
            </span>
            <div>
              <strong>Needs your attention</strong>
              <small>Nothing disappears until you decide</small>
            </div>
          </header>
          {uncertainActions.map((action) => (
            <article key={action.id} className="uncertain-action">
              <span className="live-alert-mark">
                <CircleAlert size={15} />
              </span>
              <span>
                <strong>Check before OpenBot continues</strong>
                <small>{action.actionLabel} may have completed during a restart. It will not be repeated automatically.</small>
              </span>
              <button
                className="allow"
                onClick={() => void onResolveAction(action.id, "completed")}
              >
                <Check size={13} /> It happened
              </button>
              <button onClick={() => void onResolveAction(action.id, "not_completed")}>It didn’t happen</button>
            </article>
          ))}
          {groupedAttentionRuns.slice(0, 5).map(({ run, count }) => (
            <article key={run.id}>
              <Mascot
                bot={{
                  name: run.botName,
                  color: run.botColor,
                  mascot: run.botMascot,
                  status: run.status === "failed" ? "failed" : "waiting",
                }}
                size="small"
              />
              <span>
                <strong>
                  {run.status === "failed"
                    ? `${run.botName} needs a hand`
                    : `${run.botName} needs your okay`}
                </strong>
                <small>
                  {count > 1 ? `${count} tasks like this. Latest: ` : ""}
                  {run.error || run.approvalReason || run.task.goal}
                </small>
              </span>
              <button onClick={() => onOpenThread(run.threadId)}>Open</button>
              {run.status === "awaiting_approval" && (
                <button
                  className="allow"
                  onClick={() => onReview(run.id)}
                >
                  <ShieldCheck size={13} /> Review request
                </button>
              )}
            </article>
          ))}
          {state.automationAlerts.slice(0, 3).map((alert) => (
            <article key={alert.id}>
              <span className="live-alert-mark">
                <CircleAlert size={15} />
              </span>
              <span>
                <strong>{alert.routineName}</strong>
                <small>{alert.message}</small>
              </span>
            </article>
          ))}
        </section>
      )}
      {activeWork.length > 0 && <section className="work-timeline" aria-label="Work in progress">
        {activeWork.map((run) => <article key={run.id}>
          <Mascot bot={{ name: run.botName, color: run.botColor, mascot: run.botMascot, status: run.status === "running" ? "working" : "waiting" }} size="small" />
          <div><span className="work-timeline-state">{run.botName} · {run.status === "queued" ? "Up next" : run.status === "waiting_for_teammate" ? "Consulting a teammate" : "Working"}</span>
            <h4>{run.task.goal}</h4><p>{run.activities.at(-1)?.label || "Preparing the next step"}</p>
            <button onClick={() => onOpenThread(run.threadId)}>Open conversation <ChevronRight size={13} /></button>
          </div>
          <button className="icon-button" aria-label={`Stop ${run.botName}'s task`} onClick={() => void onCancel(run.id)}><Square size={13} /></button>
        </article>)}
      </section>}
      {finishedWork.length > 0 && (
        <section className="receipt-list" aria-label="Finished work">
          <div className="panel-section-heading">
            <div>
              <h3>Finished work</h3>
              <p>Open the receipt: what happened, what was checked and what it cost.</p>
            </div>
            <span className="bounded-badge">Signed</span>
          </div>
          <div className="receipt-list-rows">
            {finishedWork.map((run) => (
              <article key={run.id}>
                <span className={`action-history-icon ${run.status === "completed" ? "done" : "attention"}`}>
                  {run.status === "completed" ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                </span>
                <span>
                  <strong>{run.task.goal || run.prompt}</strong>
                  <small>{run.botName} · {relativeTime(run.finishedAt)}{run.status === "failed" ? " · needs a hand" : ""}</small>
                </span>
                <button onClick={() => onReview(run.id)}>Receipt</button>
              </article>
            ))}
          </div>
        </section>
      )}
      {approvedActions.length > 0 && (
        <section className="action-history">
          <div className="panel-section-heading">
            <div>
              <h3>Action history</h3>
              <p>A durable receipt for every approved command, post, email and update</p>
            </div>
            <span className="bounded-badge">Recorded</span>
          </div>
          <div className="action-history-list">
            {approvedActions.slice(0, 8).map((action) => {
              const completed = ["completed", "confirmed_completed"].includes(action.status);
              const pending = ["prepared", "running"].includes(action.status);
              return (
                <article key={action.id}>
                  <span className={`action-history-icon ${completed ? "done" : pending ? "working" : "attention"}`}>
                    {completed ? <Check size={14} /> : pending ? <LoaderCircle size={14} /> : <CircleAlert size={14} />}
                  </span>
                  <span>
                    <strong>{action.actionLabel}</strong>
                    <small>
                      {completed
                        ? "Completed once and recorded"
                        : action.status === "confirmed_not_completed"
                          ? "Confirmed not completed — a fresh approval is required to try again"
                          : action.status === "failed"
                            ? action.lastError || "The approved action failed"
                            : action.status === "uncertain"
                              ? "Waiting for you to confirm what happened"
                              : "Approved and safely queued"}
                    </small>
                  </span>
                  <time>{relativeTime(action.finishedAt || action.createdAt)}</time>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <details className="computer-disclosure">
        <summary><MonitorPlay size={17} /><span>Teammate computers<small>Open a browser or step into a task</small></span><ChevronDown size={16} /></summary>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Teammate desks</h3>
            <p>Each teammate keeps a private browser and computer</p>
          </div>
          <span className="bounded-badge">Live</span>
        </div>
        <div className="live-desk-grid">
          {state.bots.map((bot) => {
            const run = currentRun(bot),
              status = statuses[bot.id],
              completed =
                run?.task.steps.filter((step) =>
                  ["completed", "skipped"].includes(step.status),
                ).length || 0,
              total = run?.task.steps.length || 0;
            return (
              <article
                key={bot.id}
                className={`live-desk live-desk-${bot.status}`}
              >
                <header>
                  <Mascot bot={bot} size="medium" />
                  <span>
                    <strong>{bot.name}</strong>
                    <small>{bot.role}</small>
                  </span>
                  <i>
                    {bot.status === "working"
                      ? "Working"
                      : bot.status === "waiting"
                        ? "Waiting"
                        : bot.status === "failed"
                          ? "Needs help"
                          : "Ready"}
                  </i>
                </header>
                <button
                  className="desk-screen"
                  onClick={() => setWatching(bot.id)}
                >
                  {status?.screenshot ? (
                    <img src={status.screenshot} alt="" />
                  ) : (
                    <span>
                      <MonitorPlay size={22} />
                      <b>Browser ready on demand</b>
                      <small>{status?.currentUrl || "No page open"}</small>
                    </span>
                  )}
                  <i>Watch</i>
                </button>
                <div className="desk-work">
                  <strong>
                    {run
                      ? run.status === "completed"
                        ? "Recently finished"
                        : taskStageLabels[run.task.stage]
                      : "Ready for a new task"}
                  </strong>
                  <p>
                    {run?.task.goal ||
                      `Message ${bot.name} to start something.`}
                  </p>
                  {run &&
                    !["completed", "failed", "cancelled"].includes(
                      run.status,
                    ) && (
                      <>
                        <div role="progressbar" aria-label={`${bot.name}'s task progress`} aria-valuemin={0} aria-valuemax={total || undefined} aria-valuenow={total ? completed : undefined}>
                          <i
                            style={{
                              width: `${total ? (completed / total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <small>
                          {run.activities.at(-1)?.label ||
                            (total
                              ? `${completed} of ${total} steps`
                              : "Starting")}
                        </small>
                      </>
                    )}
                </div>
                <footer>
                  <button onClick={() => onOpenThread(bot.threadId)}>
                    <MessageCircleReply size={13} /> Message
                  </button>
                  <button onClick={() => setWatching(bot.id)}>
                    <Eye size={13} /> Watch
                  </button>
                  {run &&
                    ["running", "waiting_for_teammate", "queued"].includes(
                      run.status,
                    ) && (
                      <button
                        className="stop"
                        onClick={() => void onCancel(run.id)}
                      >
                        <Square size={9} fill="currentColor" /> Stop
                      </button>
                    )}
                </footer>
              </article>
            );
          })}
        </div>
      </section>
      </details>
      {hiddenBots.length > 0 && (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Hidden teammates</h3>
              <p>Restore them without losing their work or routines</p>
            </div>
          </div>
          <div className="hidden-bot-list">
            {hiddenBots.map((bot) => (
              <div key={bot.id}>
                <Mascot bot={bot} size="small" />
                <span>
                  <strong>{bot.name}</strong>
                  <small>{bot.role}</small>
                </span>
                <button
                  onClick={() =>
                    void onUpdateThread(bot.threadId, { hidden: false })
                  }
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type CodeProjectsData = {
  projects: CodeProject[];
  edits: CodeProjectEdit[];
  workspaces: CodeTaskWorkspace[];
  reviews: CodeTaskReview[];
  suggestions: CodeProjectSuggestion[];
};
type ProjectLevel = "none" | "read" | "code";
export function CodeProjectsPanel({
  bots,
  onNotice,
}: {
  bots: Bot[];
  onNotice: (message: string) => void;
}) {
  const [data, setData] = useState<CodeProjectsData | null>(null),
    [adding, setAdding] = useState(false),
    [cloning, setCloning] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [rootPath, setRootPath] = useState(""),
    [levels, setLevels] = useState<Record<string, ProjectLevel>>(() =>
      Object.fromEntries(bots.map((bot) => [bot.id, "code"])),
    );
  const [repository, setRepository] = useState(""),
    [review, setReview] = useState<CodeProjectReview | null>(null);
  const refresh = useCallback(
    async () => setData(await api<CodeProjectsData>("/api/code-projects")),
    [],
  );
  useEffect(() => {
    void refresh().catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [refresh]);
  const grants = (selected: Record<string, ProjectLevel>) =>
    bots.map((bot) => {
      const level = selected[bot.id] || "code";
      return {
        botId: bot.id,
        canRead: level !== "none",
        canWrite: level === "code",
        canRun: level === "code",
      };
    });
  const connect = async (
    input: { name: string; rootPath: string },
    selected = levels,
  ) => {
    setBusy(input.rootPath);
    setError("");
    try {
      await api("/api/code-projects", {
        method: "POST",
        body: JSON.stringify({ ...input, access: grants(selected) }),
      });
      await refresh();
      setAdding(false);
      setName("");
      setRootPath("");
      onNotice(`${input.name} is connected`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const setAccess = async (
    projectId: string,
    botId: string,
    level: ProjectLevel,
  ) => {
    setBusy(`${projectId}:${botId}`);
    setError("");
    try {
      await api(`/api/code-projects/${projectId}/access/${botId}`, {
        method: "PATCH",
        body: JSON.stringify({
          canRead: level !== "none",
          canWrite: level === "code",
          canRun: level === "code",
        }),
      });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (project: CodeProject) => {
    if (
      !window.confirm(
        `Disconnect ${project.name}? No project files will be deleted.`,
      )
    )
      return;
    setBusy(project.id);
    setError("");
    try {
      await api(`/api/code-projects/${project.id}`, { method: "DELETE" });
      await refresh();
      onNotice(`${project.name} disconnected — its files were untouched`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const clone = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("clone");
    setError("");
    try {
      const project = await api<CodeProject>("/api/code-projects/clone", {
        method: "POST",
        body: JSON.stringify({ repository, access: grants(levels) }),
      });
      await refresh();
      setRepository("");
      setCloning(false);
      onNotice(`${project.name} is ready for the team`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const openReview = async (
    project: CodeProject,
    workspace?: CodeTaskWorkspace,
  ) => {
    const key = workspace?.runId || "base",
      currentKey = review?.workspace?.runId || "base";
    if (review?.projectId === project.id && currentKey === key) {
      setReview(null);
      return;
    }
    setBusy(`review:${project.id}:${key}`);
    setError("");
    try {
      setReview(
        await api<CodeProjectReview>(
          `/api/code-projects/${project.id}/review${workspace ? `?runId=${encodeURIComponent(workspace.runId)}` : ""}`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const restore = async (edit: CodeProjectEdit) => {
    if (
      !window.confirm(
        `Restore ${edit.path} to how it was before ${edit.botName}'s change? Newer work will never be overwritten.`,
      )
    )
      return;
    setBusy(`restore:${edit.id}`);
    setError("");
    try {
      await api(`/api/code-project-edits/${edit.id}/restore`, {
        method: "POST",
      });
      await refresh();
      if (review?.projectId === edit.projectId)
        setReview(
          await api<CodeProjectReview>(
            `/api/code-projects/${edit.projectId}/review${review.workspace ? `?runId=${encodeURIComponent(review.workspace.runId)}` : ""}`,
          ),
        );
      onNotice(`${edit.path} restored safely`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="code-projects-panel">
      <div className="code-project-hero">
        <span>
          <Code2 size={19} />
        </span>
        <div>
          <small>YOUR CODE, REVIEWABLE</small>
          <h3>From an idea to a tested pull request.</h3>
          <p>
            Teammates work only in projects you share. Every change stays
            visible, scoped and recoverable.
          </p>
        </div>
        <Terminal size={49} />
      </div>
      {data?.projects.length ? (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Connected projects</h3>
              <p>Give every teammate exactly the access their role needs</p>
            </div>
            <span className="bounded-badge">
              {data.projects.length} connected
            </span>
          </div>
          <div className="code-project-list">
            {data.projects.map((project) => (
              <article key={project.id}>
                <header>
                  <span>
                    {project.remoteUrl ? (
                      <ConnectorIcon id="github" />
                    ) : (
                      <FolderOpen size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{project.name}</strong>
                    <small>
                      {project.projectKind} ·{" "}
                      {project.managedClone
                        ? "Managed by OpenBot"
                        : project.gitRepository
                          ? "Git repository"
                          : "Local folder"}
                    </small>
                  </div>
                  {project.gitRepository && (
                    <button
                      className="project-review-button"
                      aria-label={`Review main folder changes in ${project.name}`}
                      onClick={() => void openReview(project)}
                      disabled={busy === `review:${project.id}:base`}
                    >
                      <GitPullRequest size={14} />
                    </button>
                  )}
                  <button
                    aria-label={`Disconnect ${project.name}`}
                    onClick={() => void remove(project)}
                    disabled={busy === project.id}
                  >
                    <Trash2 size={14} />
                  </button>
                </header>
                <div className="project-source">
                  <code title={project.rootPath}>{project.rootPath}</code>
                  {project.remoteUrl && (
                    <a
                      href={project.remoteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {data.workspaces.filter(
                  (workspace) =>
                    workspace.projectId === project.id &&
                    workspace.status !== "archived",
                ).length > 0 && (
                  <div className="project-workspaces">
                    <div className="project-workspaces-title">
                      <span>
                        <GitBranch size={13} /> Agent workspaces
                      </span>
                      <small>Your main folder stays untouched</small>
                    </div>
                    {data.workspaces
                      .filter(
                        (workspace) =>
                          workspace.projectId === project.id &&
                          workspace.status !== "archived",
                      )
                      .map((workspace) => {
                        const taskBot = bots.find(
                            (bot) => bot.id === workspace.botId,
                          ),
                          codeReview = data.reviews.find(
                            (item) => item.sourceRunId === workspace.runId,
                          );
                        const label =
                          workspace.status === "published"
                            ? "Published"
                            : codeReview?.verdict === "approved"
                              ? `${codeReview.reviewerBotName} approved`
                              : codeReview?.verdict === "changes_requested"
                                ? "Changes requested"
                                : "In progress";
                        const state =
                          workspace.status === "published"
                            ? "published"
                            : codeReview?.verdict === "approved"
                              ? "approved"
                              : codeReview?.verdict === "changes_requested"
                                ? "changes"
                                : "active";
                        return (
                          <button
                            key={workspace.runId}
                            onClick={() => void openReview(project, workspace)}
                            disabled={
                              busy === `review:${project.id}:${workspace.runId}`
                            }
                          >
                            <Mascot
                              bot={
                                taskBot || {
                                  name: workspace.botName,
                                  color: "#6758d7",
                                  mascot: "orbit",
                                }
                              }
                              size="tiny"
                            />
                            <span>
                              <strong>{workspace.botName}</strong>
                              <small>{workspace.branch}</small>
                            </span>
                            <b className={`workspace-state workspace-${state}`}>
                              {label}
                            </b>
                            <Eye size={13} />
                          </button>
                        );
                      })}
                  </div>
                )}
                {review?.projectId === project.id && (
                  <div className="project-review">
                    <div>
                      <span>
                        <GitBranch size={13} />{" "}
                        {review.workspace
                          ? `${review.workspace.botName} · ${review.branch || "Task branch"}`
                          : review.branch || "Main folder"}
                      </span>
                      <b>
                        {review.changes.length
                          ? `${review.changes.length} change${review.changes.length === 1 ? "" : "s"}`
                          : "Ready and clean"}
                      </b>
                    </div>
                    {review.workspace && (
                      <p className="workspace-review-note">
                        Isolated task workspace · the original project folder
                        has not been changed.
                      </p>
                    )}
                    {review.changes.length > 0 && (
                      <ul>
                        {review.changes.slice(0, 8).map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    )}
                    {review.diff ? (
                      <details>
                        <summary>See the code diff</summary>
                        <pre>
                          {review.diff}
                          {review.truncated
                            ? "\n\n…diff shortened for review"
                            : ""}
                        </pre>
                      </details>
                    ) : (
                      <p>No tracked code changes are waiting for review.</p>
                    )}
                  </div>
                )}
                <div className="project-access-grid">
                  {bots.map((bot) => {
                    const access = project.access.find(
                        (item) => item.botId === bot.id,
                      ),
                      level: ProjectLevel = !access?.canRead
                        ? "none"
                        : access.canWrite && access.canRun
                          ? "code"
                          : "read";
                    return (
                      <label key={bot.id}>
                        <Mascot bot={bot} size="tiny" />
                        <span>
                          <strong>{bot.name}</strong>
                          <small>
                            {level === "code"
                              ? "Can code + test"
                              : level === "read"
                                ? "Read only"
                                : "No access"}
                          </small>
                        </span>
                        <select
                          aria-label={`${bot.name} access to ${project.name}`}
                          value={level}
                          disabled={busy === `${project.id}:${bot.id}`}
                          onChange={(event) =>
                            void setAccess(
                              project.id,
                              bot.id,
                              event.target.value as ProjectLevel,
                            )
                          }
                        >
                          <option value="code">Code + test</option>
                          <option value="read">Read only</option>
                          <option value="none">No access</option>
                        </select>
                      </label>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="empty-panel code-empty">
          <Code2 size={31} />
          <h3>Bring in your first project</h3>
          <p>
            Paste a GitHub link or choose a folder already on this Mac. Then ask
            a teammate to build, fix and test it.
          </p>
        </div>
      )}
      {!adding && data?.suggestions.length ? (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Projects on this Mac</h3>
              <p>
                One click shares the folder with every teammate; access can be
                changed afterward
              </p>
            </div>
          </div>
          <div className="project-suggestions">
            {data.suggestions.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion.rootPath}
                onClick={() =>
                  void connect(
                    { name: suggestion.name, rootPath: suggestion.rootPath },
                    Object.fromEntries(bots.map((bot) => [bot.id, "code"])),
                  )
                }
                disabled={busy === suggestion.rootPath}
              >
                <span>
                  <FolderOpen size={16} />
                </span>
                <div>
                  <strong>{suggestion.name}</strong>
                  <small>
                    {suggestion.projectKind}
                    {suggestion.gitRepository ? " · Git" : ""}
                  </small>
                </div>
                <Plus size={15} />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {cloning && (
        <form
          className="project-connect-form project-clone-form"
          onSubmit={clone}
        >
          <div className="panel-section-heading">
            <div>
              <h3>Get a project from GitHub</h3>
              <p>
                Public repositories work immediately. Private ones use Git
                already signed in on this Mac.
              </p>
            </div>
            <span className="project-form-logo">
              <ConnectorIcon id="github" />
            </span>
          </div>
          <label className="field">
            <span>GitHub repository</span>
            <input
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              placeholder="github.com/you/your-project"
              required
              autoFocus
            />
          </label>
          <div className="project-new-access">
            <strong>Who can work here?</strong>
            {bots.map((bot) => (
              <label key={bot.id}>
                <Mascot bot={bot} size="tiny" />
                <span>{bot.name}</span>
                <select
                  value={levels[bot.id] || "code"}
                  onChange={(event) =>
                    setLevels({
                      ...levels,
                      [bot.id]: event.target.value as ProjectLevel,
                    })
                  }
                >
                  <option value="code">Code + test</option>
                  <option value="read">Read only</option>
                  <option value="none">No access</option>
                </select>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setCloning(false)}
            >
              Cancel
            </button>
            <button className="button-primary" disabled={busy === "clone"}>
              {busy === "clone" ? (
                <LoaderCircle className="spinner" size={15} />
              ) : (
                <Download size={15} />
              )}{" "}
              Get project
            </button>
          </div>
        </form>
      )}
      {adding && (
        <form
          className="project-connect-form"
          onSubmit={(event) => {
            event.preventDefault();
            void connect({ name, rootPath });
          }}
        >
          <div className="panel-section-heading">
            <div>
              <h3>Connect a folder on this Mac</h3>
              <p>
                OpenBot will leave the folder where it is and never claim access
                outside it.
              </p>
            </div>
          </div>
          <label className="field">
            <span>Project name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My app"
              required
            />
          </label>
          <label className="field">
            <span>Folder path</span>
            <input
              value={rootPath}
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="/Users/you/Documents/GitHub/my-app"
              required
            />
          </label>
          <div className="project-new-access">
            <strong>Who can work here?</strong>
            {bots.map((bot) => (
              <label key={bot.id}>
                <Mascot bot={bot} size="tiny" />
                <span>{bot.name}</span>
                <select
                  aria-label={`${bot.name} access for the new project`}
                  value={levels[bot.id] || "code"}
                  onChange={(event) =>
                    setLevels({
                      ...levels,
                      [bot.id]: event.target.value as ProjectLevel,
                    })
                  }
                >
                  <option value="code">Code + test</option>
                  <option value="read">Read only</option>
                  <option value="none">No access</option>
                </select>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button className="button-primary" disabled={Boolean(busy)}>
              {busy ? (
                <LoaderCircle className="spinner" size={15} />
              ) : (
                <Code2 size={15} />
              )}{" "}
              Connect project
            </button>
          </div>
        </form>
      )}
      {!adding && !cloning && (
        <div className="project-entry-actions">
          <button
            className="add-routine project-github-action"
            onClick={() => setCloning(true)}
          >
            <span>
              <ConnectorIcon id="github" />
            </span>{" "}
            Get from GitHub
          </button>
          <button className="add-routine" onClick={() => setAdding(true)}>
            <FolderOpen size={17} /> Connect a folder
          </button>
        </div>
      )}
      {data?.edits.length ? (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Safety net</h3>
              <p>
                Restore an agent edit while it is still the newest version of
                that file
              </p>
            </div>
          </div>
          <div className="project-edit-list">
            {data.edits.slice(0, 8).map((edit) => (
              <div key={edit.id}>
                <span>
                  <GitBranch size={14} />
                </span>
                <div>
                  <strong>
                    {edit.botName} {edit.operation} {edit.path}
                  </strong>
                  <small>
                    {data.projects.find(
                      (project) => project.id === edit.projectId,
                    )?.name || "Disconnected project"}{" "}
                    · {edit.workspaceRunId ? "Isolated task · " : ""}
                    {edit.restoredAt
                      ? "Restored"
                      : relativeTime(edit.createdAt)}
                  </small>
                </div>
                {edit.reversible &&
                  data.projects.some(
                    (project) => project.id === edit.projectId,
                  ) && (
                    <button
                      className="project-restore"
                      onClick={() => void restore(edit)}
                      disabled={busy === `restore:${edit.id}`}
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                  )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="friendly-note">
        <ShieldCheck size={17} />
        <p>
          <strong>Fast work, calm review.</strong>
          <br />
          Every task gets its own isolated branch, so agents can work at the
          same time without changing your main folder. Publishing to GitHub
          always waits for your approval.
        </p>
      </div>
      {error && <p className="panel-error">{error}</p>}
    </div>
  );
}

function GitHubConnectorPanel({
  status,
  bots,
  onRefresh,
  onNotice,
}: {
  status: ConnectorStatus | null;
  bots: Bot[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const github = status?.github;
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<"notifications" | "issues">(
      "notifications",
    ),
    [notifications, setNotifications] = useState<GitHubNotificationSummary[]>(
      [],
    ),
    [issues, setIssues] = useState<GitHubIssueSummary[]>([]),
    [query, setQuery] = useState("");
  const run = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const connect = () =>
    run("connect-github", async () => {
      await api("/api/connectors/github/connect", { method: "POST" });
      await onRefresh();
      onNotice(
        github?.connected
          ? "GitHub is ready"
          : "GitHub sign-in opened — finish it in the browser",
      );
    });
  const setAccess = (botId: string, canRead: boolean, canSend: boolean) =>
    run(`github-access-${botId}`, async () => {
      await api(`/api/connectors/github/access/${botId}`, {
        method: "PATCH",
        body: JSON.stringify({ canRead, canSend }),
      });
      await onRefresh();
    });
  const checkNotifications = () =>
    run("github-notifications", async () => {
      const list = await api<GitHubNotificationSummary[]>(
        "/api/connectors/github/notifications?limit=10",
      );
      setNotifications(list);
      setPreview("notifications");
      onNotice(
        list.length
          ? "GitHub updates are ready"
          : "Connected — no recent notifications",
      );
    });
  const searchIssues = () =>
    run("github-issues", async () => {
      const list = await api<GitHubIssueSummary[]>(
        `/api/connectors/github/issues?limit=10&q=${encodeURIComponent(query)}`,
      );
      setIssues(list);
      setPreview("issues");
      onNotice(
        list.length ? "GitHub issues are ready" : "No matching issues found",
      );
    });
  if (!status)
    return (
      <section className="github-connector">
        <div className="github-connect-head">
          <span className="github-mark">
            <ConnectorIcon id="github" />
          </span>
          <div>
            <small>GITHUB PRODUCTIVITY</small>
            <h3>Checking GitHub on this Mac…</h3>
            <p>Looking for an official GitHub sign-in you already trust.</p>
          </div>
          <LoaderCircle className="spinner" size={17} />
        </div>
      </section>
    );
  return (
    <section
      className={`github-connector ${github?.connected ? "connected" : ""}`}
    >
      <div className="github-connect-head">
        <span className="github-mark">
          <ConnectorIcon id="github" />
        </span>
        <div>
          <small>GITHUB PRODUCTIVITY</small>
          <h3>
            {github?.connected
              ? `Ready as @${github.accountLogin}`
              : github?.installed
                ? "Bring GitHub into the studio"
                : "GitHub CLI is needed"}
          </h3>
          <p>
            {github?.connected
              ? "Follow work across repositories, with a separate permission for creating issues."
              : "Use the official GitHub sign-in already trusted on this Mac—no token copying."}
          </p>
        </div>
        {github?.connected ? (
          <span className="connector-ready">
            <i /> Connected
          </span>
        ) : github?.installed ? (
          <button
            className="button-primary"
            onClick={() => void connect()}
            disabled={busy === "connect-github"}
          >
            {busy === "connect-github" || github?.connecting ? (
              <LoaderCircle className="spinner" size={14} />
            ) : (
              <ExternalLink size={14} />
            )}{" "}
            Connect GitHub
          </button>
        ) : (
          <a
            className="button-secondary"
            href="https://cli.github.com/"
            target="_blank"
            rel="noreferrer"
          >
            Get GitHub CLI <ExternalLink size={12} />
          </a>
        )}
      </div>
      {github?.connected && (
        <>
          <div className="github-checks">
            <button
              onClick={() => void checkNotifications()}
              disabled={busy === "github-notifications"}
            >
              {busy === "github-notifications" ? (
                <LoaderCircle className="spinner" size={13} />
              ) : (
                <Bell size={13} />
              )}{" "}
              Check updates
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void searchIssues();
              }}
            >
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search issues…"
              />
              <button disabled={busy === "github-issues"}>
                {busy === "github-issues" ? (
                  <LoaderCircle className="spinner" size={13} />
                ) : (
                  "Search"
                )}
              </button>
            </form>
          </div>
          {preview === "notifications" && notifications.length > 0 && (
            <div className="github-preview">
              {notifications.map((item) => (
                <a
                  key={item.id}
                  href={item.url || `https://github.com/${item.repository}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className={item.unread ? "github-unread" : ""}>
                    <Bell size={12} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.repository} · {item.reason.replace(/_/g, " ")}
                    </small>
                  </div>
                  <time>{relativeTime(item.updatedAt)}</time>
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
          {preview === "issues" && issues.length > 0 && (
            <div className="github-preview">
              {issues.map((issue) => (
                <a
                  key={issue.id}
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className={`issue-${issue.state}`}>
                    #{issue.number}
                  </span>
                  <div>
                    <strong>{issue.title}</strong>
                    <small>
                      {issue.repository}
                      {issue.author ? ` · ${issue.author}` : ""}
                    </small>
                  </div>
                  <time>{relativeTime(issue.updatedAt)}</time>
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
          <div className="github-access">
            <div className="panel-section-heading">
              <div>
                <h3>Who can use GitHub</h3>
                <p>Reading activity and preparing new issues stay separate</p>
              </div>
            </div>
            {bots.map((bot) => {
              const access = status?.access.find(
                (item) =>
                  item.connectorId === "github-cli" && item.botId === bot.id,
              );
              return (
                <div key={bot.id}>
                  <Mascot bot={bot} size="small" />
                  <span>
                    <strong>{bot.name}</strong>
                    <small>{bot.role}</small>
                  </span>
                  <button
                    className={access?.canRead ? "on" : ""}
                    onClick={() =>
                      void setAccess(
                        bot.id,
                        !access?.canRead,
                        Boolean(access?.canSend),
                      )
                    }
                    disabled={busy === `github-access-${bot.id}`}
                  >
                    <Eye size={12} /> Read
                  </button>
                  <button
                    className={access?.canSend ? "on create" : "create"}
                    onClick={() =>
                      void setAccess(
                        bot.id,
                        Boolean(access?.canRead),
                        !access?.canSend,
                      )
                    }
                    disabled={busy === `github-access-${bot.id}`}
                  >
                    <Plus size={12} /> Create issues
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {error && <p className="panel-error">{error}</p>}
    </section>
  );
}

type OAuthProduct = "slack" | "notion" | "todoist" | "dropbox";
function OAuthConnectorPanel({
  kind,
  status,
  bots,
  onRefresh,
  onNotice,
}: {
  kind: OAuthProduct;
  status: ConnectorStatus | null;
  bots: Bot[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const details = {
    slack: {
          name: "Slack",
          kicker: "TEAM CONVERSATIONS",
          connectTitle: "Bring Slack into the studio",
          connectedCopy:
            "Search the conversations you can already see, then review every message before it is posted.",
          setupCopy:
            "Create a Slack app once, then your team gets the same official Connect Slack flow.",
          docs: "https://api.slack.com/apps",
          readLabel: "Read",
          writeLabel: "Post",
          searchPlaceholder: "Search recent messages…",
          defaultQuery: "after:yesterday",
          boundary:
            "Search follows the connected member’s existing Slack access. Posts are sent by the app only after approval.",
          resultName: "messages",
          canWrite: true,
          oneClick: false,
        },
    notion: {
          name: "Notion",
          kicker: "SHARED KNOWLEDGE",
          connectTitle: "Bring Notion into the studio",
          connectedCopy:
            "Find current pages, read useful context, and review every note before it is added.",
          setupCopy:
            "Create a public Notion integration once, then choose exactly which pages OpenBot may use.",
          docs: "https://www.notion.so/my-integrations",
          readLabel: "Read",
          writeLabel: "Add notes",
          searchPlaceholder: "Search shared pages…",
          defaultQuery: "",
          boundary:
            "OpenBot sees only the pages selected or shared during Notion sign-in. Updates append content; they never replace a page.",
          resultName: "pages",
          canWrite: true,
          oneClick: false,
        },
    todoist: {
          name: "Todoist",
          kicker: "TASKS & PRIORITIES",
          connectTitle: "Bring Todoist into the studio",
          connectedCopy: "See what is due, plan around your real workload, and review every new task before it is created.",
          setupCopy: "Connect in one click. OpenBot securely creates its local OAuth client for this Mac.",
          docs: "https://developer.todoist.com/api/v1/",
          readLabel: "See tasks",
          writeLabel: "Create tasks",
          searchPlaceholder: "Search active tasks…",
          defaultQuery: "",
          boundary: "OpenBot reads active tasks only. Creating a task always pauses for your approval of the exact title and due date.",
          resultName: "tasks",
          canWrite: true,
          oneClick: true,
        },
    dropbox: {
          name: "Dropbox",
          kicker: "CLOUD FILES",
          connectTitle: "Bring Dropbox into the studio",
          connectedCopy: "Find cloud files and read bounded text or code without changing anything in Dropbox.",
          setupCopy: "Use the release-managed Dropbox app, or add your own app key. PKCE keeps open-source installs from needing a bundled secret.",
          docs: "https://www.dropbox.com/developers/apps",
          readLabel: "Read",
          writeLabel: "",
          searchPlaceholder: "Search Dropbox files…",
          defaultQuery: "",
          boundary: "Dropbox is read-only in OpenBot. Only file metadata and bounded supported text enter a teammate task.",
          resultName: "files",
          canWrite: false,
          oneClick: false,
        },
  }[kind];
  const connector = status?.[kind],
    connection = status?.connections.find((item) => item.id === kind);
  const [clientId, setClientId] = useState(""),
    [clientSecret, setClientSecret] = useState(""),
    [signingSecret, setSigningSecret] = useState(""),
    [query, setQuery] = useState(details.defaultQuery);
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [slackResults, setSlackResults] = useState<SlackMessageSummary[]>([]),
    [notionResults, setNotionResults] = useState<NotionPageSummary[]>([]),
    [todoistResults, setTodoistResults] = useState<TodoistTaskSummary[]>([]),
    [dropboxResults, setDropboxResults] = useState<DropboxFileSummary[]>([]);
  const run = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const configure = (event: FormEvent) => {
    event.preventDefault();
    void run("configure", async () => {
      await api(`/api/connectors/${kind}/config`, {
        method: "POST",
        body: JSON.stringify({ clientId, clientSecret }),
      });
      setClientSecret("");
      await onRefresh();
      onNotice(`${details.name} connection saved privately`);
    });
  };
  const connect = () =>
    run("connect", async () => {
      const next = await api<{ url: string }>(
        `/api/connectors/${kind}/connect`,
        { method: "POST" },
      );
      onNotice(`Opening ${details.name} sign-in…`);
      window.location.assign(next.url);
    });
  const check = () =>
    run("check", async () => {
      await api(`/api/connectors/${kind}/health`, { method: "POST" });
      await onRefresh();
      onNotice(`${details.name} is connected and ready`);
    });
  const preview = () =>
    run("preview", async () => {
      const results = await api<SlackMessageSummary[] | NotionPageSummary[] | TodoistTaskSummary[] | DropboxFileSummary[]>(
        `/api/connectors/${kind}/preview?q=${encodeURIComponent(query)}`,
      );
      if (kind === "slack") setSlackResults(results as SlackMessageSummary[]);
      else if (kind === "notion") setNotionResults(results as NotionPageSummary[]);
      else if (kind === "todoist") setTodoistResults(results as TodoistTaskSummary[]);
      else setDropboxResults(results as DropboxFileSummary[]);
      await onRefresh();
      onNotice(
        results.length
          ? `${details.name} results are ready`
          : `Connected — no matching ${details.resultName}`,
      );
    });
  const setAccess = (botId: string, canRead: boolean, canSend: boolean) =>
    run(`access-${botId}`, async () => {
      await api(`/api/connectors/${kind}/access/${botId}`, {
        method: "PATCH",
        body: JSON.stringify({ canRead, canSend }),
      });
      await onRefresh();
    });
  const disconnect = () =>
    run("disconnect", async () => {
      await api(`/api/connectors/${kind}/disconnect`, { method: "POST" });
      setSlackResults([]);
      setNotionResults([]);
      setTodoistResults([]);
      setDropboxResults([]);
      await onRefresh();
      onNotice(`${details.name} disconnected`);
    });
  const copyCallback = async () => {
    if (!connector?.callbackUrl) return;
    await navigator.clipboard.writeText(connector.callbackUrl);
    onNotice("Callback address copied");
  };
  const copyEventUrl = async () => {
    if (!connector?.events?.url) return;
    await navigator.clipboard.writeText(connector.events.url);
    onNotice(`${details.name} event address copied`);
  };
  const configureSlackEvents = (event: FormEvent) => {
    event.preventDefault();
    void run("events", async () => {
      await api("/api/connectors/slack/events/config", { method: "POST", body: JSON.stringify({ signingSecret }) });
      setSigningSecret("");
      await onRefresh();
      onNotice("Slack live events are ready for verification");
    });
  };
  const copyNotionToken = () =>
    run("notion-token", async () => {
      const result = await api<{ verificationToken: string }>("/api/connectors/notion/events/token");
      await navigator.clipboard.writeText(result.verificationToken);
      onNotice("Notion verification token copied");
    });
  const rotateEventAddress = () =>
    run("event-rotate", async () => {
      await api(`/api/connectors/${kind}/events/rotate`, { method: "POST" });
      await onRefresh();
      onNotice(`${details.name} received a new private event address`);
    });
  if (!status || !connector) return null;
  return (
    <section
      className={`oauth-connector oauth-${kind} ${connector.connected ? "connected" : ""}`}
    >
      <div className="oauth-connector-head">
        <span className="oauth-product-mark">
          <ConnectorIcon id={kind} />
        </span>
        <div>
          <small>{details.kicker}</small>
          <h3>
            {connector.connected
              ? `${details.name} is ready${connector.accountName ? ` · ${connector.accountName}` : ""}`
              : details.connectTitle}
          </h3>
          <p>
            {connector.connected
              ? details.connectedCopy
              : connector.configured
                ? `Your private ${details.name} connection is ready for sign-in.`
                : details.setupCopy}
          </p>
        </div>
        {connector.connected ? (
          <span className="connector-ready">
            <i /> Connected
          </span>
        ) : connector.configured || details.oneClick ? (
          <button
            className="button-primary"
            onClick={() => void connect()}
            disabled={busy === "connect"}
          >
            {busy === "connect" || connector.oauthInProgress ? (
              <LoaderCircle className="spinner" size={14} />
            ) : (
              <ExternalLink size={14} />
            )}{" "}
            {connector.oauthInProgress ? "Waiting…" : `Connect ${details.name}`}
          </button>
        ) : null}
      </div>
      {!connector.configured && !connector.managedClient && !details.oneClick && (
        <details className="oauth-setup-disclosure">
          <summary>
            <span>
              <ShieldCheck size={15} />
              <span>
                <strong>Set up {details.name} on this Mac</strong>
                <small>For self-hosted and developer installs</small>
              </span>
            </span>
            <ChevronDown size={16} />
          </summary>
          <form className="oauth-setup-form" onSubmit={configure}>
          <div className="oauth-setup-intro">
            <span>
              <ShieldCheck size={15} />
            </span>
            <div>
              <strong>Self-hosted setup</strong>
              <small>
                {kind === "dropbox"
                  ? "Use the public app key with PKCE, or add the secret for a private server deployment."
                  : "The public release can bundle this once so everyone else gets one-click sign-in."}
              </small>
            </div>
            <a href={details.docs} target="_blank" rel="noreferrer">
              Create app <ExternalLink size={11} />
            </a>
          </div>
          <div className="oauth-fields">
            <label className="field">
              <span>{kind === "dropbox" ? "App key" : "Client ID"}</span>
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Client secret {kind === "dropbox" && <small>optional with PKCE</small>}</span>
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
                required={kind !== "dropbox"}
              />
            </label>
          </div>
          <div className="callback-row">
            <span>
              <strong>Return address</strong>
              <code>{connector.callbackUrl}</code>
            </span>
            <button type="button" onClick={() => void copyCallback()}>
              <Copy size={14} /> Copy
            </button>
          </div>
          <button className="button-primary" disabled={busy === "configure"}>
            {busy === "configure" ? (
              <LoaderCircle className="spinner" size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}{" "}
            Save privately
          </button>
          </form>
        </details>
      )}
      {connector.connected && (
        <>
          <div className="oauth-connector-tools">
            <button onClick={() => void check()} disabled={busy === "check"}>
              {busy === "check" ? (
                <LoaderCircle className="spinner" size={13} />
              ) : (
                <RefreshCw size={13} />
              )}{" "}
              Check connection
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void preview();
              }}
            >
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={details.searchPlaceholder}
              />
              <button disabled={busy === "preview"}>
                {busy === "preview" ? (
                  <LoaderCircle className="spinner" size={13} />
                ) : (
                  "Search"
                )}
              </button>
            </form>
          </div>
          {kind === "slack" && slackResults.length > 0 && (
            <div className="oauth-preview-list">
              {slackResults.map((item) =>
                item.permalink ? (
                  <a
                    key={`${item.channelId}:${item.timestamp}`}
                    href={item.permalink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="mini-service-icon">
                      <ConnectorIcon id="slack" />
                    </span>
                    <span>
                      <strong>
                        #{item.channelName} · {item.author}
                      </strong>
                      <small>{item.text}</small>
                    </span>
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <div key={`${item.channelId}:${item.timestamp}`}>
                    <span className="mini-service-icon">
                      <ConnectorIcon id="slack" />
                    </span>
                    <span>
                      <strong>
                        #{item.channelName} · {item.author}
                      </strong>
                      <small>{item.text}</small>
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
          {kind === "notion" && notionResults.length > 0 && (
            <div className="oauth-preview-list">
              {notionResults.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="mini-service-icon">
                    <ConnectorIcon id="notion" />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>Edited {relativeTime(item.lastEditedAt)}</small>
                  </span>
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
          {kind === "todoist" && todoistResults.length > 0 && (
            <div className="oauth-preview-list">
              {todoistResults.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                  <span className="mini-service-icon"><ConnectorIcon id="todoist" /></span>
                  <span>
                    <strong>{item.content}</strong>
                    <small>{item.due ? `Due ${item.due}` : item.description || "Active task"}</small>
                  </span>
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
          {kind === "dropbox" && dropboxResults.length > 0 && (
            <div className="oauth-preview-list">
              {dropboxResults.map((item) => (
                <div key={item.id}>
                  <span className="mini-service-icon"><ConnectorIcon id="dropbox" /></span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.path}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="oauth-boundary">
            <ShieldCheck size={14} />
            <span>{details.boundary}</span>
          </div>
          {(kind === "slack" || kind === "notion") && connector.events && (
            <section className={`connector-event-setup ${connector.events.verified ? "ready" : ""}`}>
              <div className="connector-event-heading">
                <span><Webhook size={15} /></span>
                <div>
                  <strong>{connector.events.verified ? "Live activity is ready" : kind === "notion" && connector.events.verificationTokenReady ? "Finish in Notion" : `Let ${details.name} wake a teammate`}</strong>
                  <small>{kind === "slack" ? "Mentions and subscribed conversation activity can start an automation." : "Page, database and comment changes can start an automation."}</small>
                </div>
                {connector.events.verified && <i><Check size={11} /> Ready</i>}
                {kind === "notion" && connector.events.verificationTokenReady && !connector.events.verified && <i className="pending">Verify in Notion</i>}
              </div>
              <div className="callback-row event-address-row">
                <span>
                  <strong>Event address</strong>
                  <code>{connector.events.url}</code>
                </span>
                <button type="button" onClick={() => void copyEventUrl()}><Copy size={14} /> Copy</button>
              </div>
              {kind === "slack" && !connector.events.secretConfigured && (
                <form className="connector-event-secret" onSubmit={configureSlackEvents}>
                  <label className="field">
                    <span>Slack signing secret</span>
                    <input type="password" value={signingSecret} onChange={(event) => setSigningSecret(event.target.value)} minLength={16} autoComplete="new-password" required />
                  </label>
                  <button className="button-primary" disabled={busy === "events"}><ShieldCheck size={14} /> Save privately</button>
                </form>
              )}
              {kind === "slack" && connector.events.secretConfigured && !connector.events.verified && (
                <p className="event-setup-note">Add the event address under <strong>Event Subscriptions</strong> in Slack. OpenBot will answer Slack’s signed verification check automatically.</p>
              )}
              {kind === "notion" && !connector.events.verificationTokenReady && (
                <p className="event-setup-note">Create a webhook subscription in Notion using this event address. Return here after Notion sends its verification token.</p>
              )}
              {kind === "notion" && connector.events.verificationTokenReady && !connector.events.verified && (
                <div className="event-token-ready">
                  <span><Check size={13} /> Token received. Copy it into Notion, then choose <strong>Verify subscription</strong>.</span>
                  <button type="button" onClick={() => void copyNotionToken()} disabled={busy === "notion-token"}><Copy size={13} /> Copy token</button>
                </div>
              )}
              {kind === "notion" && connector.events.verified && (
                <p className="event-setup-note event-setup-verified"><Check size={13} /> A signed Notion event reached OpenBot successfully.</p>
              )}
              <div className="event-setup-footer">
                <small>The private address and signing material never enter teammate prompts.</small>
                <button type="button" onClick={() => {
                  if (window.confirm(`Replace the ${details.name} event address? The previous address will stop working immediately.`)) void rotateEventAddress();
                }} disabled={busy === "event-rotate"}><RotateCcw size={12} /> New address</button>
              </div>
            </section>
          )}
          <div className="github-access oauth-access">
            <div className="panel-section-heading">
              <div>
                <h3>Who can use {details.name}</h3>
                <p>Reading and preparing changes stay separate</p>
              </div>
            </div>
            {bots.map((bot) => {
              const access = status.access.find(
                (item) => item.connectorId === kind && item.botId === bot.id,
              );
              return (
                <div key={bot.id}>
                  <Mascot bot={bot} size="small" />
                  <span>
                    <strong>{bot.name}</strong>
                    <small>{bot.role}</small>
                  </span>
                  <button
                    className={access?.canRead ? "on" : ""}
                    onClick={() => {
                      const canRead = !access?.canRead;
                      void setAccess(
                        bot.id,
                        canRead,
                        canRead && Boolean(access?.canSend),
                      );
                    }}
                    disabled={busy === `access-${bot.id}`}
                  >
                    <Eye size={12} /> {details.readLabel}
                  </button>
                  {details.canWrite && (
                    <button
                      className={access?.canSend ? "on create" : "create"}
                      onClick={() => void setAccess(bot.id, true, !access?.canSend)}
                      disabled={busy === `access-${bot.id}`}
                    >
                      <Plus size={12} /> {details.writeLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            className="disconnect-button"
            onClick={() => {
              if (
                window.confirm(
                  `Disconnect ${details.name} from OpenBot? The app details stay saved so you can reconnect later.`,
                )
              )
                void disconnect();
            }}
            disabled={busy === "disconnect"}
          >
            Disconnect {details.name}
          </button>
        </>
      )}
      {connection?.lastError && !connector.connected && (
        <p className="oauth-attention">
          <CircleAlert size={14} /> {connection.lastError}
        </p>
      )}
      {error && <p className="panel-error">{error}</p>}
    </section>
  );
}

export function ConnectorPanel({
  status,
  bots,
  onRefresh,
  onNotice,
  onStartWorkflow,
}: {
  status: ConnectorStatus | null;
  bots: Bot[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
  onStartWorkflow: (prompt: string, expectedWorkKind?: "morning" | "inbox" | "meeting" | "weekly", botId?: string) => Promise<void>;
}) {
  const [appSearch, setAppSearch] = useState("");
  const openApp = (id: string) => {
    const group = ["gmail", "google-drive", "google-calendar"].includes(id) ? "google" : id;
    const section = document.getElementById(`connector-settings-${group}`) as HTMLDetailsElement | null;
    if (section) { section.open = true; section.scrollIntoView({ block: "start", behavior: "auto" }); section.querySelector("summary")?.focus(); }
  };
  const [clientId, setClientId] = useState(""),
    [clientSecret, setClientSecret] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<GmailMessageSummary[]>([]),
    [drivePreview, setDrivePreview] = useState<DriveFileSummary[]>([]),
    [calendarPreview, setCalendarPreview] = useState<CalendarEventSummary[]>(
      [],
    ),
    [previewKind, setPreviewKind] = useState<"gmail" | "drive" | "calendar">(
      "gmail",
    );
  const credentialsFile = useRef<HTMLInputElement>(null);
  const connection = status?.connection,
    connected = Boolean(connection?.connected);
  const recovery = status?.googleApiRecovery;
  const serviceRecoveries = status?.googleApiRecoveries || [];
  const apiCheckProject =
    !recovery &&
    connection?.status === "needs_attention" &&
    !status?.managedGoogleClient
      ? status?.googleProjectId
      : null;
  const gmailCatalog = status?.catalog.find((entry) => entry.id === "gmail"),
    driveCatalog = status?.catalog.find((entry) => entry.id === "google-drive"),
    calendarCatalog = status?.catalog.find((entry) => entry.id === "google-calendar"),
    gmailReady = Boolean(gmailCatalog?.connected),
    driveReady = Boolean(driveCatalog?.connected),
    calendarReady = Boolean(calendarCatalog?.connected),
    gmailWriteReady = gmailCatalog?.writeConnected === true,
    driveWriteReady = driveCatalog?.writeConnected === true,
    calendarWriteReady = calendarCatalog?.writeConnected === true;
  const slackReady = Boolean(status?.slack.connected),
    notionReady = Boolean(status?.notion.connected),
    todoistReady = Boolean(status?.todoist.connected),
    dropboxReady = Boolean(status?.dropbox.connected),
    githubReady = Boolean(status?.github.connected);
  useEffect(() => {
    const timer = setInterval(() => void onRefresh(), 2_500);
    return () => clearInterval(timer);
  }, [onRefresh]);
  const run = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await run("save", async () => {
      await api("/api/connectors/google/config", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          clientSecret: clientSecret || undefined,
        }),
      });
      setClientSecret("");
      await onRefresh();
      onNotice("Google connection saved privately");
    });
  };
  const connect = () =>
    run("connect", async () => {
      const next = await api<{ url: string }>(
        "/api/connectors/google/connect",
        { method: "POST" },
      );
      onNotice("Opening Google sign-in…");
      window.location.assign(next.url);
    });
  const importCredentials = (file: File | undefined) =>
    run("import", async () => {
      if (!file) return;
      const parsed = JSON.parse(await file.text()) as {
        installed?: { client_id?: string; client_secret?: string };
        web?: { client_id?: string };
      };
      if (!parsed.installed?.client_id)
        throw new Error(
          parsed.web?.client_id
            ? "Choose a Desktop app credentials file. Web app files need extra callback setup."
            : "That is not a Google OAuth credentials file.",
        );
      await api("/api/connectors/google/config", {
        method: "POST",
        body: JSON.stringify({
          clientId: parsed.installed.client_id,
          clientSecret: parsed.installed.client_secret,
        }),
      });
      const next = await api<{ url: string }>(
        "/api/connectors/google/connect",
        { method: "POST" },
      );
      onNotice("Opening Google sign-in…");
      window.location.assign(next.url);
    }).finally(() => {
      if (credentialsFile.current) credentialsFile.current.value = "";
    });
  const testInbox = () =>
    run("preview-gmail", async () => {
      const messages = await api<GmailMessageSummary[]>(
        "/api/connectors/gmail/preview?q=newer_than%3A14d",
      );
      setPreview(messages);
      setPreviewKind("gmail");
      await onRefresh();
      onNotice(
        messages.length
          ? "Your inbox is ready"
          : "Connected — no recent mail found",
      );
    });
  const testDrive = () =>
    run("preview-drive", async () => {
      const files = await api<DriveFileSummary[]>(
        "/api/connectors/drive/preview",
      );
      setDrivePreview(files);
      setPreviewKind("drive");
      await onRefresh();
      onNotice(
        files.length
          ? "Google Drive is ready"
          : "Connected — no recent files found",
      );
    });
  const testCalendar = () =>
    run("preview-calendar", async () => {
      const events = await api<CalendarEventSummary[]>(
        "/api/connectors/calendar/preview",
      );
      setCalendarPreview(events);
      setPreviewKind("calendar");
      await onRefresh();
      onNotice(
        events.length
          ? "Google Calendar is ready"
          : "Connected — no events in the next week",
      );
    });
  const copy = async () => {
    if (!status?.callbackUrl) return;
    await navigator.clipboard.writeText(status.callbackUrl);
    onNotice("Callback address copied");
  };
  const setAccess = async (
    botId: string,
    service: GoogleConnectorService,
    canRead: boolean,
    canSend = false,
  ) =>
    run(`access-${service}-${botId}`, async () => {
      await api(`/api/connectors/google/access/${service}/${botId}`, {
        method: "PATCH",
        body: JSON.stringify({ canRead, canSend }),
      });
      await onRefresh();
    });
  const friendlyAction = (action: string) =>
    action === "gmail_search"
      ? "Searched the inbox"
      : action === "gmail_read"
        ? "Read an email"
        : action === "gmail_send"
          ? "Prepared or sent an email"
          : action === "google_drive_search"
            ? "Searched Google Drive"
            : action === "google_drive_read"
              ? "Read a Drive file"
              : action === "google_calendar_agenda"
                ? "Checked the calendar"
                : action === "github_notifications"
                  ? "Checked GitHub updates"
                  : action === "github_issues"
                    ? "Searched GitHub issues"
                    : action === "github_issue_create"
                      ? "Prepared or created a GitHub issue"
                      : action === "slack_search"
                        ? "Searched Slack"
                        : action === "slack_read"
                          ? "Read a Slack conversation"
                          : action === "slack_post"
                            ? "Prepared or posted in Slack"
                            : action === "notion_search"
                              ? "Searched Notion"
                              : action === "notion_read"
                                ? "Read a Notion page"
                                : action === "notion_update"
                                  ? "Prepared or added to Notion"
                                  : action === "todoist_tasks"
                                    ? "Checked Todoist tasks"
                                    : action === "todoist_task_create"
                                      ? "Prepared or created a Todoist task"
                                      : action === "dropbox_search"
                                        ? "Searched Dropbox"
                                        : action === "dropbox_read"
                                          ? "Read a Dropbox file"
                                  : action === "connected"
                                    ? "Connected an app"
                                    : action === "disconnected"
                                      ? "Disconnected an app"
                                      : action;
  const friendlyEventSummary = (event: ConnectorStatus["events"][number]) => {
    if (event.status === "failed" && event.action.startsWith("google_drive"))
      return "Google Drive still needs to be turned on. Gmail remains connected.";
    if (event.status === "failed" && event.action.startsWith("google_calendar"))
      return "Google Calendar still needs to be turned on. Gmail remains connected.";
    if (event.status === "failed" && event.action.startsWith("gmail"))
      return "Gmail needs another connection check before this can run.";
    if (event.status === "failed" && event.action.startsWith("slack"))
      return (
        status?.slack.lastError ||
        "Slack needs a quick connection check before this can run."
      );
    if (event.status === "failed" && event.action.startsWith("notion"))
      return (
        status?.notion.lastError ||
        "Notion needs a quick connection check before this can run."
      );
    if (event.status === "failed" && event.action.startsWith("todoist"))
      return status?.todoist.lastError || "Todoist needs a quick connection check before this can run.";
    if (event.status === "failed" && event.action.startsWith("dropbox"))
      return status?.dropbox.lastError || "Dropbox needs a quick connection check before this can run.";
    return event.summary.length > 170
      ? `${event.summary.slice(0, 167).trim()}…`
      : event.summary;
  };
  return (
    <div className="connector-panel">
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Your apps</h3>
            <p>Choose which apps your teammates can use.</p>
          </div>
          {connected && (
            <span className="connector-ready">
              <i /> Google ready
            </span>
          )}
        </div>
        <label className="app-search"><Search size={16} /><input type="search" aria-label="Find an app" placeholder="Find an app" value={appSearch} onChange={(event) => setAppSearch(event.target.value)} /></label>
        <div className="connector-catalog">
          {status?.catalog
            .filter((entry) => `${entry.name} ${entry.description}`.toLowerCase().includes(appSearch.toLowerCase()))
            .map((entry) => (
              <article
                key={entry.id}
                className={`connector-card ${entry.connected ? "connected" : ""} ${entry.availability === "next" ? "coming" : ""}`}
              >
                <span className={`connector-logo connector-logo-${entry.id}`}>
                  <ConnectorIcon id={entry.id} />
                </span>
                <div className="connector-card-main">
                  <div className="connector-card-title">
                    <h4>{entry.name}</h4>
                    <b>{entry.connected ? "Connected" : entry.badge}</b>
                  </div>
                  <p>{entry.description}</p>
                  <div className="connector-capabilities">
                    {entry.capabilities.map((capability) => (
                      <span key={capability}>{capability}</span>
                    ))}
                  </div>
                  {entry.availability !== "next" && <button className="connector-manage" onClick={() => openApp(entry.id)} aria-label={`${entry.connected ? "Manage" : "Set up"} ${entry.name}`}>{entry.connected ? "Manage connection" : "Set up connection"}<ChevronRight size={13} /></button>}
                </div>
              </article>
            )) || (
            <div className="connector-loading">
              <LoaderCircle className="spinner" /> Checking your apps…
            </div>
          )}
        </div>
        {status && !status.catalog.some((entry) => `${entry.name} ${entry.description}`.toLowerCase().includes(appSearch.toLowerCase())) && <p className="empty-search">No matching apps. Try another name.</p>}
      </section>

          <details className="purpose-disclosure daily-work-disclosure">
            <summary><CalendarDays size={18} /><span>Daily work<small>Briefs, recipes and follow-ups</small></span><ChevronDown size={16} /></summary>
            <div className="purpose-disclosure-body">
            <WorkSourcesPanel bots={bots} request={api} />
            <RecipeLibraryPanel bots={bots} request={api} onStart={onStartWorkflow} />
          <WorkFollowupsPanel request={api} />
          <section>
            <div className="panel-section-heading">
              <div>
                <h3>Ready-made jobs</h3>
                <p>
                  Useful starting points. Briefs and inbox follow-ups save their
                  sources and show what could—and couldn’t—be checked. Enabled Mac access can try Mail or Calendar on your host when Google is unavailable; macOS may ask for Automation permission.
                </p>
              </div>
            </div>
            <div className="workflow-starters">
              <button disabled={!gmailReady && !calendarReady && !slackReady && !notionReady && !todoistReady && !status?.localApps?.readServices.length} onClick={() => void onStartWorkflow(`Prepare my weekly review in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Use work_collect with kind weekly, then save with work_report. Combine recent inbox conversations, next week’s calendar, and my selected Slack, Notion and Todoist sources. Focus on decisions, open actions and next steps, with source references. Do not imply current pages or open tasks are a history of completed work. Clearly identify missing coverage. No sends or external changes.`, "weekly")}>
                <span><CalendarDays size={16} /></span><div><strong>Weekly review</strong><small>Open actions, decisions and next week’s priorities</small></div><ArrowUp size={14} />
              </button>
              <button
                disabled={!gmailReady && !calendarReady && !slackReady && !notionReady && !todoistReady && !status?.localApps?.readServices.length}
                onClick={() =>
                  void onStartWorkflow(
                    `Prepare my morning brief for the next 24 hours in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Check my primary calendar and unread inbox conversations from the past seven days. Give me a short schedule and source-linked priorities, save a report, and tell me if anything could not be checked. Separate suggestions from facts. Do not send or change anything.`,
                    "morning",
                  )
                }
              >
                <span>
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>Morning brief</strong>
                  <small>
                    Your schedule and priorities, with sources and coverage
                  </small>
                </div>
                <ArrowUp size={14} />
              </button>
              <button
                disabled={!calendarReady && !status?.localApps?.readServices.includes("google-calendar")}
                onClick={() =>
                  void onStartWorkflow(
                    `Prepare me for my next timed meeting in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Gather the meeting source snapshot and save a source-linked report with event details, candidate related documents and email, suggested decisions, and useful questions. Verify relevance and flag uncertain matches or missing attendee information. Do not send or change anything.`,
                    "meeting",
                  )
                }
              >
                <span>
                  <Users size={16} />
                </span>
                <div>
                  <strong>Prepare my next meeting</strong>
                  <small>
                    A sourced brief with decisions and useful questions
                  </small>
                </div>
                <ArrowUp size={14} />
              </button>
              <button
                disabled={!gmailReady && !status?.localApps?.readServices.includes("gmail")}
                onClick={() =>
                  void onStartWorkflow(
                    `Prepare my inbox follow-ups in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Check inbox conversations from the past seven days. Suggest source-linked priorities and save useful reply drafts for me to review. Skip conversations I have already answered and flag any missing or shortened context. Save the report. Do not send or change anything.`,
                    "inbox",
                  )
                }
              >
                <span>
                  <Mail size={16} />
                </span>
                <div>
                  <strong>Prepare my follow-ups</strong>
                  <small>
                    Suggested priorities and reply drafts—nothing sent
                  </small>
                </div>
                <ArrowUp size={14} />
              </button>
            </div>
          </section>
            </div>
          </details>
      <details className="purpose-disclosure" id="connector-settings-google" open={Boolean(error || serviceRecoveries.length || connection?.status === "needs_attention") || undefined}>
        <summary><ConnectorIcon id="gmail" /><span>Google Workspace<small>Mail, files and calendar access</small></span><ChevronDown size={16} /></summary>
        <div className="purpose-disclosure-body">
      {!status ? null : !connection?.configured ? (
        <section className="google-setup">
          <input
            ref={credentialsFile}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            onChange={(event) =>
              void importCredentials(event.target.files?.[0])
            }
          />
          <div className="setting-section-title">
            <h3>Connect Google Workspace</h3>
            <p>
              The release build supports one-click Google sign-in. Self-hosters
              can get the same flow by choosing one Desktop OAuth credentials
              file.
            </p>
          </div>
          <button
            className="credential-import"
            onClick={() => credentialsFile.current?.click()}
            disabled={busy === "import"}
          >
            <span className="credential-icons">
              <i>
                <ConnectorIcon id="gmail" />
              </i>
              <i>
                <ConnectorIcon id="google-drive" />
              </i>
              <i>
                <ConnectorIcon id="google-calendar" />
              </i>
            </span>
            <span>
              <strong>
                {busy === "import"
                  ? "Reading your Google file…"
                  : "Choose Google credentials file"}
              </strong>
              <small>
                Then Google sign-in opens automatically—no copying IDs or
                callback addresses
              </small>
            </span>
            {busy === "import" ? (
              <LoaderCircle className="spinner" size={17} />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
          <div className="google-api-setup">
            <div>
              <strong>Turn on the three Google apps first</strong>
              <small>
                Each button opens the correct switch in Google Cloud.
              </small>
            </div>
            <div>
              {GOOGLE_API_SETUP.map((item) => (
                <a
                  key={item.id}
                  href={`https://console.cloud.google.com/apis/library/${item.api}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    <ConnectorIcon id={item.id} />
                  </span>
                  {item.name}
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </div>
          <div className="setup-steps setup-steps-simple">
            <div>
              <b>1</b>
              <span>
                <strong>Create a Desktop OAuth client</strong>
                <small>
                  Add yourself as a test user, create a Desktop app, then
                  download its JSON file.
                </small>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open credentials <ExternalLink size={12} />
                </a>
              </span>
            </div>
            <div>
              <b>2</b>
              <span>
                <strong>Choose the file above</strong>
                <small>
                  OpenBot saves it privately and opens Google’s official sign-in
                  screen.
                </small>
              </span>
            </div>
          </div>
          <details className="connector-advanced">
            <summary>Advanced: enter details manually</summary>
            <form className="connector-form" onSubmit={save}>
              <label className="field">
                <span>Google client ID</span>
                <input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="…apps.googleusercontent.com"
                  required
                />
              </label>
              <label className="field">
                <span>
                  Client secret <small>if Google gave you one</small>
                </span>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <div className="callback-row">
                <span>
                  <strong>Callback address</strong>
                  <code>{status.callbackUrl}</code>
                </span>
                <button type="button" onClick={() => void copy()}>
                  <Copy size={14} /> Copy
                </button>
              </div>
              <button
                className="button-primary button-wide"
                disabled={busy === "save"}
              >
                {busy === "save" ? (
                  <LoaderCircle className="spinner" size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}{" "}
                Save privately
              </button>
            </form>
          </details>
          <div className="connector-note">
            <ShieldCheck size={16} />
            <p>
              <strong>Your files and tokens stay on this Mac.</strong> For
              public distribution, the release maintainer adds a verified Google
              client so everyone sees a single Connect Google button.
            </p>
          </div>
        </section>
      ) : !connected ? (
        <section
          className={`connect-account-card ${recovery || apiCheckProject ? "needs-api" : ""}`}
        >
          <span className="google-app-stack">
            <i>
              <ConnectorIcon id="gmail" />
            </i>
            <i>
              <ConnectorIcon id="google-drive" />
            </i>
            <i>
              <ConnectorIcon id="google-calendar" />
            </i>
          </span>
          <div>
            <h3>
              {recovery
                ? `Turn on ${recovery.serviceName} to finish`
                : apiCheckProject
                  ? "Finish your Google setup"
                  : connection.status === "needs_attention"
                    ? "Google needs a quick reconnect"
                    : status.managedGoogleClient
                      ? "Connect Google in one click"
                      : "Your Google connection is ready"}
            </h3>
            <p>
              {apiCheckProject
                ? "Before signing in again, make sure Gmail, Drive and Calendar are turned on for this project."
                : connection.lastError ||
                  "One Google sign-in adds Gmail, Drive and Calendar."}
            </p>
            {recovery ? (
              <div className="google-recovery-steps">
                <span>
                  <b>1</b> Open the switch
                </span>
                <span>
                  <b>2</b> Press Enable
                </span>
                <span>
                  <b>3</b> Connect again
                </span>
              </div>
            ) : apiCheckProject ? (
              <div className="google-api-checks">
                {GOOGLE_API_SETUP.map((item) => (
                  <a
                    key={item.id}
                    href={`https://console.cloud.google.com/apis/library/${item.api}?project=${apiCheckProject}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ConnectorIcon id={item.id} /> Turn on {item.name}
                  </a>
                ))}
              </div>
            ) : (
              <small>Google shows every permission before you agree.</small>
            )}
          </div>
          <div className="connect-account-actions">
            {recovery && (
              <a
                className="button-primary"
                href={recovery.enableUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> Turn on {recovery.serviceName}
              </a>
            )}
            <button
              className={recovery ? "button-secondary" : "button-primary"}
              onClick={() => void connect()}
              disabled={busy === "connect"}
            >
              {busy === "connect" || status.oauthInProgress ? (
                <LoaderCircle className="spinner" size={16} />
              ) : recovery || apiCheckProject ? (
                <RefreshCw size={15} />
              ) : (
                <ExternalLink size={16} />
              )}{" "}
              {status.oauthInProgress
                ? "Waiting for Google"
                : recovery || apiCheckProject
                  ? "Connect again"
                  : "Connect Google"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="connected-account">
            <div className="connected-account-top">
              <span className="google-app-stack">
                <i>
                  <ConnectorIcon id="gmail" />
                </i>
                <i>
                  <ConnectorIcon id="google-drive" />
                </i>
                <i>
                  <ConnectorIcon id="google-calendar" />
                </i>
              </span>
              <span>
                <strong>{connection.accountEmail}</strong>
                <small>
                  <i /> Google Workspace is ready for your team
                </small>
              </span>
              <div className="workspace-checks">
                <button
                  onClick={() => void testInbox()}
                  disabled={!gmailReady || busy === "preview-gmail"}
                >
                  {busy === "preview-gmail" ? (
                    <LoaderCircle className="spinner" size={14} />
                  ) : (
                    <Inbox size={14} />
                  )}{" "}
                  Inbox
                </button>
                <button
                  onClick={() => void testDrive()}
                  disabled={!driveReady || busy === "preview-drive"}
                >
                  <FolderOpen size={14} /> Drive
                </button>
                <button
                  onClick={() => void testCalendar()}
                  disabled={!calendarReady || busy === "preview-calendar"}
                >
                  <Clock3 size={14} /> Calendar
                </button>
              </div>
            </div>
            {previewKind === "gmail" && preview.length > 0 && (
              <div className="inbox-preview">
                {preview.map((message) => (
                  <div key={message.id}>
                    <i className={message.unread ? "unread" : ""} />
                    <span>
                      <strong>{message.subject}</strong>
                      <small>
                        {message.from.replace(/\s*<.*?>\s*$/, "")} ·{" "}
                        {message.snippet}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {previewKind === "drive" && drivePreview.length > 0 && (
              <div className="inbox-preview">
                {drivePreview.map((file) => (
                  <div key={file.id}>
                    <span className="mini-service-icon">
                      <ConnectorIcon id="google-drive" />
                    </span>
                    <span>
                      <strong>{file.name}</strong>
                      <small>
                        {file.mimeType
                          .replace("application/vnd.google-apps.", "Google ")
                          .replace("application/", "")}{" "}
                        · {relativeTime(file.modifiedTime)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {previewKind === "calendar" && calendarPreview.length > 0 && (
              <div className="inbox-preview">
                {calendarPreview.map((event) => (
                  <div key={event.id}>
                    <span className="mini-service-icon">
                      <ConnectorIcon id="google-calendar" />
                    </span>
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {event.allDay
                          ? event.start
                          : new Date(event.start).toLocaleString([], {
                              weekday: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                        {event.location ? ` · ${event.location}` : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {serviceRecoveries.length > 0 && (
            <section className="google-service-recovery">
              <div className="google-service-recovery-copy">
                <span>
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <strong>
                    {serviceRecoveries.length === 1
                      ? `${serviceRecoveries[0]!.serviceName} needs one more step`
                      : `${serviceRecoveries.length} Google apps need one more step`}
                  </strong>
                  <small>
                    Your working Google apps stay connected. Turn on only the
                    missing ones, then try them again.
                  </small>
                </div>
              </div>
              <div className="google-service-recovery-list">
                {serviceRecoveries.map((item) => {
                  const loading =
                    busy ===
                    (item.service === "gmail"
                      ? "preview-gmail"
                      : item.service === "google-drive"
                        ? "preview-drive"
                        : "preview-calendar");
                  return (
                    <div key={item.service}>
                      <span className="mini-service-icon">
                        <ConnectorIcon id={item.service} />
                      </span>
                      <strong>{item.serviceName}</strong>
                      <a href={item.enableUrl} target="_blank" rel="noreferrer">
                        Turn on <ExternalLink size={11} />
                      </a>
                      <button
                        disabled={loading}
                        onClick={() =>
                          void (item.service === "gmail"
                            ? testInbox()
                            : item.service === "google-drive"
                              ? testDrive()
                              : testCalendar())
                        }
                      >
                        {loading ? (
                          <LoaderCircle className="spinner" size={12} />
                        ) : (
                          <RefreshCw size={12} />
                        )}{" "}
                        Try again
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {serviceRecoveries.length === 0 &&
            (!gmailReady || !driveReady || !calendarReady || !gmailWriteReady || !driveWriteReady || !calendarWriteReady) && (
              <button className="upgrade-google" onClick={() => void connect()}>
                <RefreshCw size={15} /> Reconnect once to add approval-safe
                Drive and Calendar creation
              </button>
            )}
          <section>
            <div className="panel-section-heading">
              <div>
                <h3>Who can use each app</h3>
                <p>
                  Choose what each teammate can read or prepare. Sending and
                  creating still wait for your approval.
                </p>
              </div>
            </div>
            <div className="connector-access-list">
              {bots.map((bot) => {
                const gmail = status.access.find(
                    (item) => item.botId === bot.id && item.service === "gmail",
                  ),
                  drive = status.access.find(
                    (item) =>
                      item.botId === bot.id && item.service === "google-drive",
                  ),
                  calendar = status.access.find(
                    (item) =>
                      item.botId === bot.id &&
                      item.service === "google-calendar",
                  );
                return (
                  <div key={bot.id}>
                    <Mascot bot={bot} size="small" />
                    <span>
                      <strong>{bot.name}</strong>
                      <small>{bot.role}</small>
                    </span>
                    <div className="service-access-buttons">
                      <button
                        className={gmail?.canRead ? "on" : ""}
                        aria-pressed={Boolean(gmail?.canRead)}
                        disabled={
                          !gmailWriteReady || busy === `access-gmail-${bot.id}`
                        }
                        onClick={() =>
                          void setAccess(
                            bot.id,
                            "gmail",
                            !gmail?.canRead,
                            Boolean(gmail?.canSend),
                          )
                        }
                      >
                        <Search size={13} /> Inbox
                      </button>
                      <button
                        className={gmail?.canSend ? "on connector-send" : "connector-send"}
                        aria-pressed={Boolean(gmail?.canSend)}
                        disabled={
                          !gmailReady || busy === `access-gmail-${bot.id}`
                        }
                        onClick={() =>
                          void setAccess(
                            bot.id,
                            "gmail",
                            Boolean(gmail?.canRead),
                            !gmail?.canSend,
                          )
                        }
                      >
                        <Mail size={13} /> Send
                      </button>
                      <button
                        className={drive?.canRead ? "on drive" : "drive"}
                        aria-pressed={Boolean(drive?.canRead)}
                        disabled={
                          !driveReady ||
                          busy === `access-google-drive-${bot.id}`
                        }
                        onClick={() =>
                          void setAccess(
                            bot.id,
                            "google-drive",
                            !drive?.canRead,
                          )
                        }
                      >
                        <FolderOpen size={13} /> Drive
                      </button>
                      <button
                        className={drive?.canSend ? "on create" : "create"}
                        aria-pressed={Boolean(drive?.canSend)}
                        disabled={!driveWriteReady || busy === `access-google-drive-${bot.id}`}
                        onClick={() => void setAccess(bot.id, "google-drive", Boolean(drive?.canRead), !drive?.canSend)}
                      >
                        <Plus size={13} /> Create file
                      </button>
                      <button
                        className={
                          calendar?.canRead ? "on calendar" : "calendar"
                        }
                        aria-pressed={Boolean(calendar?.canRead)}
                        disabled={
                          !calendarReady ||
                          busy === `access-google-calendar-${bot.id}`
                        }
                        onClick={() =>
                          void setAccess(
                            bot.id,
                            "google-calendar",
                            !calendar?.canRead,
                          )
                        }
                      >
                        <Clock3 size={13} /> Calendar
                      </button>
                      <button
                        className={calendar?.canSend ? "on create" : "create"}
                        aria-pressed={Boolean(calendar?.canSend)}
                        disabled={!calendarWriteReady || busy === `access-google-calendar-${bot.id}`}
                        onClick={() => void setAccess(bot.id, "google-calendar", Boolean(calendar?.canRead), !calendar?.canSend)}
                      >
                        <Plus size={13} /> Add event
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <button
            className="disconnect-button"
            onClick={() => {
              if (
                window.confirm(
                  "Disconnect Google Workspace from OpenBot? Your client details will stay saved so you can reconnect later.",
                )
              )
                void run("disconnect", async () => {
                  await api("/api/connectors/google/disconnect", {
                    method: "POST",
                  });
                  setPreview([]);
                  setDrivePreview([]);
                  setCalendarPreview([]);
                  await onRefresh();
                  onNotice("Google Workspace disconnected");
                });
            }}
            disabled={busy === "disconnect"}
          >
            Disconnect Google Workspace
          </button>
        </>
      )}
        </div>
      </details>
      <details className="purpose-disclosure" id="connector-settings-github">
        <summary><ConnectorIcon id="github" /><span>GitHub<small>Repositories and notifications</small></span><ChevronDown size={16} /></summary>
        <div className="purpose-disclosure-body"><GitHubConnectorPanel
        status={status}
        bots={bots}
        onRefresh={onRefresh}
        onNotice={onNotice}
      /></div></details>
      {(["slack", "notion", "todoist", "dropbox"] as const).map((kind) => <details key={kind} className="purpose-disclosure" id={`connector-settings-${kind}`} open={Boolean(status?.[kind]?.lastError) || undefined}>
        <summary><ConnectorIcon id={kind} /><span>{({ slack: "Slack", notion: "Notion", todoist: "Todoist", dropbox: "Dropbox" })[kind]}<small>Connection and teammate access</small></span><ChevronDown size={16} /></summary>
        <div className="purpose-disclosure-body"><OAuthConnectorPanel kind={kind} status={status} bots={bots} onRefresh={onRefresh} onNotice={onNotice} /></div>
      </details>)}
      <details className="purpose-disclosure"><summary><Layers3 size={18} /><span>More tools<small>Custom connections and extensions</small></span><ChevronDown size={16} /></summary><div className="purpose-disclosure-body"><ExtensionsPanel bots={bots} /></div></details>
      {(slackReady || notionReady || todoistReady || dropboxReady) && (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Connected workflows</h3>
              <p>
                Turn live conversations and knowledge into a checked result—not
                another pile of summaries
              </p>
            </div>
          </div>
            <div className="workflow-starters">
            <button
              disabled={!slackReady}
              onClick={() =>
                void onStartWorkflow(
                  "Use @slack to catch me up on the last working day. Search for decisions, direct questions, blockers, deadlines, and promises involving me or my active projects. Read the relevant conversation context, remove duplicates, separate facts from inference, include normal Slack links, and deliver one short priority brief. Do not post anything.",
                )
              }
            >
              <span>
                <ConnectorIcon id="slack" />
              </span>
              <div>
                <strong>Slack catch-up</strong>
                <small>Decisions, asks and blockers—with source links</small>
              </div>
              <ArrowUp size={14} />
            </button>
            <button
              disabled={!notionReady}
              onClick={() =>
                void onStartWorkflow(
                  "Use @notion to find the most recently edited pages relevant to current projects. Read the useful pages, identify decisions, owners, dates, unanswered questions, and stale information, then deliver one concise knowledge brief with normal Notion links. Do not update any page.",
                )
              }
            >
              <span>
                <ConnectorIcon id="notion" />
              </span>
              <div>
                <strong>Knowledge brief</strong>
                <small>
                  Current decisions and open questions from shared pages
                </small>
              </div>
              <ArrowUp size={14} />
            </button>
            <button
              disabled={!slackReady || !notionReady || !githubReady}
              onClick={() =>
                void onStartWorkflow(
                  "Use @slack, @notion, and @github to make a verified project pulse. Compare recent conversation decisions, shared project notes, open issues, and repository notifications. Resolve obvious duplicates, flag disagreements or stale notes, cite normal source links, and give me priorities, owners, risks, and next actions. Read only; do not post, create, or update anything.",
                )
              }
            >
              <span>
                <Sparkles size={16} />
              </span>
              <div>
                <strong>Project pulse</strong>
                <small>Cross-check Slack, Notion and GitHub in one view</small>
              </div>
              <ArrowUp size={14} />
            </button>
            <button
              disabled={!todoistReady || !calendarReady}
              onClick={() =>
                void onStartWorkflow(
                  "Use @calendar and @todoist to plan my day. Compare today’s events with active tasks, flag conflicts, and give me one realistic ordered schedule. Do not create or change anything.",
                )
              }
            >
              <span><ConnectorIcon id="todoist" /></span>
              <div>
                <strong>Plan my real day</strong>
                <small>Calendar and tasks, turned into one schedule</small>
              </div>
              <ArrowUp size={14} />
            </button>
            <button
              disabled={!dropboxReady}
              onClick={() =>
                void onStartWorkflow(
                  "Use @dropbox to find the files most relevant to my current projects. Read only supported text files, distinguish current context from stale notes, and give me one concise briefing with file names. Do not change anything.",
                )
              }
            >
              <span><ConnectorIcon id="dropbox" /></span>
              <div>
                <strong>Find project context</strong>
                <small>Useful Dropbox files, distilled into one brief</small>
              </div>
              <ArrowUp size={14} />
            </button>
          </div>
        </section>
      )}
      {status?.events.length ? (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Recent app activity</h3>
              <p>
                Your team's recent work in connected apps.
              </p>
            </div>
          </div>
          <div className="connector-events">
            {status.events.slice(0, 8).map((event) => (
              <div key={event.id}>
                <span className={`event-state event-${event.status}`}>
                  {event.status === "completed" ? (
                    <Check size={11} />
                  ) : event.status === "waiting" ? (
                    <Clock3 size={11} />
                  ) : (
                    "!"
                  )}
                </span>
                <span>
                  <strong>
                    {event.botName ? `${event.botName} · ` : ""}
                    {friendlyAction(event.action)}
                  </strong>
                  <small>{friendlyEventSummary(event)}</small>
                </span>
                <time>{relativeTime(event.createdAt)}</time>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {error && <p className="panel-error connector-error">{error}</p>}
    </div>
  );
}

type AccessInfo = {
  host: string;
  port: number;
  remoteEnabled: boolean;
  token: string;
  urls: string[];
  iosConnectUrls?: string[];
  tailscaleUrl?: string | null;
  nativePush?: { configured: boolean; bundleId: string; devices: number };
};
export function RemotePanel({ bots, runner, installPrompt, onInstalled, onNotice }: {
  bots: Bot[]; runner: RunnerHealth; installPrompt: InstallPrompt | null;
  onInstalled: () => void; onNotice: (message: string) => void;
}) {
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => { if (local) void api<AccessInfo>("/api/access").then(setAccess).catch(() => {}); }, [local]);
  return <div className="remote-panel">
    <div className="remote-hero">
      <div className="remote-orbit"><RoomCluster bots={bots} large /><Smartphone size={22} /></div>
      <span className="control-kicker">One studio. All your devices.</span>
      <h3>Your team comes with you.</h3>
      <p>Send a task, see what changed, and approve work from your iPhone. Just OpenBot—no extra networking apps.</p>
    </div>
    {local ? <AwayAccessPanel /> : <div className="remote-status good"><Check size={18} /><span><strong>Connected to your studio</strong><small>Manage paired phones from OpenBot on your host.</small></span></div>}
    {local && <details className="remote-advanced"><summary>Advanced connection settings</summary>
      <p>For self-hosters and local-network troubleshooting. QR pairing does not require copying these values.</p>
      {access && <div className="remote-setup">
        {access.urls.map((url) => <div className="remote-status" key={url}><small>{url} · private network only</small></div>)}
        <div className="access-key-row"><span><strong>Owner access key</strong><code>{showKey ? access.token : "••••••••••••••••"}</code></span>
          <button onClick={() => setShowKey(!showKey)}>{showKey ? "Hide" : "Show"}</button>
          <button onClick={() => void navigator.clipboard.writeText(access.token).then(() => onNotice("Owner key copied")).catch(() => onNotice("Clipboard access was blocked"))}>Copy</button>
        </div>
        <p>Keep this owner key private. Paired phones use their own revocable keys instead.</p>
      </div>}
      {access?.nativePush && <p>{access.nativePush.configured ? "Native push is configured on this host." : "Native push delivery still needs Apple push configuration on the host."}</p>}
      {installPrompt && <button onClick={() => void installPrompt.prompt().then(() => installPrompt.userChoice).then((choice) => { if (choice.outcome === "accepted") onInstalled(); })}>Install browser companion</button>}
    </details>}
    <div className="security-footnote"><ShieldCheck size={16} /><p>{runner.deployment?.mode === "private_runner" ? "This studio runs on your private host." : "Your studio runs on this Mac. Keep it awake and online for away access."} Dictation does not save microphone audio in OpenBot.</p></div>
  </div>;
}

/** Watch the teammate's own browser inside the studio: live screencast frames
 * from the host, click/type/key takeover, and an address bar to open pages.
 * Same private profile the agent uses; watching never grants new access. */
function InAppBrowserView({ botId, onNotice }: { botId: string; onNotice: (message: string) => void }) {
  const [meta, setMeta] = useState<{ url: string; title: string } | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stopped = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    stopped.current = false;
    const watch = async () => {
      if (stopped.current) return;
      try {
        const [frameResponse, metaResponse] = await Promise.all([
          fetch(`/api/bots/${encodeURIComponent(botId)}/browser/live-frame`, { cache: "no-store" }),
          fetch(`/api/bots/${encodeURIComponent(botId)}/browser/live-meta`, { cache: "no-store" }),
        ]);
        if (frameResponse.ok) {
          const blob = await frameResponse.blob();
          setFrame((current) => {
            const next = URL.createObjectURL(blob);
            if (current) URL.revokeObjectURL(current);
            return next;
          });
        }
        if (metaResponse.ok) setMeta(await metaResponse.json() as { url: string; title: string });
      } catch { /* Keep the last frame; the timer retries. */ }
    };
    void watch();
    const timer = window.setInterval(() => void watch(), 700);
    return () => { stopped.current = true; window.clearInterval(timer); setFrame((current) => { if (current) URL.revokeObjectURL(current); return null; }); void fetch(`/api/bots/${encodeURIComponent(botId)}/browser/live-stop`, { method: "POST" }); };
  }, [botId]);
  useEffect(() => { setMeta(null); setFrame(null); setError(""); }, [botId]);
  const act = async (route: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/browser/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The browser did not respond.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // Clicks and keystrokes queue in order without blocking the screen, like a
  // real browser. Nothing typed is stored or sent to the model.
  const send = (op: DirectOp) => {
    const route =
      op.kind === "click" ? "takeover/click" : op.kind === "press" ? "takeover/press" : op.kind === "text" ? "takeover/type" : "takeover/scroll";
    const body =
      op.kind === "click"
        ? { x: op.x, y: op.y }
        : op.kind === "press"
          ? { key: op.key }
          : op.kind === "text"
            ? { value: op.value, replace: false }
            : { x: op.x, y: op.y, deltaY: op.deltaY };
    queue.current = queue.current
      .then(async () => {
        const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/browser/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "The browser did not respond.");
        setError("");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        onNotice(e instanceof Error ? e.message : "The browser did not respond.");
      })
      .catch(() => {});
  };
  return (
    <div className="in-app-browser">
      <form
        className="inline-field"
        onSubmit={(event) => {
          event.preventDefault();
          if (address.trim()) void act("open", { url: address.trim() });
        }}
      >
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={meta?.url || "Address to open"}
          aria-label="Browser address"
          maxLength={2_048}
        />
        <button disabled={busy}>Go</button>
      </form>
      <DirectScreen
        image={frame}
        alt="Live browser"
        interactive
        badge="Click a field, then type"
        label="Live browser screen. Click a field, then type — keys go straight to the page."
        send={send}
        empty={<p className="panel-note">{busy ? "Connecting…" : "Waiting for the first frame…"}</p>}
      />
      {error && <p className="panel-error">{error}</p>}
      {meta && <small className="in-app-browser-url">{meta.title || "(untitled)"} · {meta.url}</small>}
    </div>
  );
}

function BrowserSiteData({ botId }: { botId: string }) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<Array<{ site: string; cookies: number }> | null>(null);
  const [note, setNote] = useState("");
  const load = async () => {
    const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/browser/sites`, { cache: "no-store" });
    if (response.ok) setSites(await response.json() as Array<{ site: string; cookies: number }>);
  };
  useEffect(() => {
    if (open) void load().catch(() => setSites([]));
  }, [open, botId]);
  async function clear(site?: string) {
    const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/browser/sites/clear`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(site ? { site } : {}),
    });
    const result = await response.json() as { cleared?: number; error?: string };
    if (!response.ok) throw new Error(result.error || "The sign-out did not finish.");
    setNote(site ? `Signed out of ${site} (${result.cleared ?? 0} cookies).` : `Signed out everywhere (${result.cleared ?? 0} cookies).`);
    await load().catch(() => {});
  }
  return (
    <details
      className="browser-site-data"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Private browser data</summary>
      <small className="panel-note">
        Sites holding sessions in {`this teammate's`} browser. Signing out clears one
        site{`'s`} cookies and storage; other sites stay signed in. Values are never shown.
      </small>
      {sites && sites.length === 0 && <small className="panel-note">Nothing stored yet.</small>}
      {sites && sites.length > 0 && (
        <div className="browser-site-rows">
          {sites.map((entry) => (
            <div className="browser-site-row" key={entry.site}>
              <span>{entry.site}</span>
              <small>{entry.cookies} {entry.cookies === 1 ? "cookie" : "cookies"}</small>
              <button type="button" onClick={() => void clear(entry.site).catch((error: Error) => setNote(error.message))}>Sign out</button>
            </div>
          ))}
          <button type="button" className="browser-site-clear-all" onClick={() => void clear().catch((error: Error) => setNote(error.message))}>Sign out everywhere</button>
        </div>
      )}
      {note && <small role="status">{note}</small>}
    </details>
  );
}

function SkillToggles({ botId }: { botId: string }) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<TaughtWorkflow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const load = async () => {
    const response = await fetch("/api/workflows", { cache: "no-store" });
    if (response.ok) setSkills(((await response.json()) as TaughtWorkflow[]).filter((workflow) => workflow.botId === botId));
  };
  useEffect(() => {
    if (open) void load().catch(() => setSkills([]));
  }, [open, botId]);
  async function toggle(workflow: TaughtWorkflow) {
    setBusyId(workflow.id);
    setNote("");
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}/enabled`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: Boolean(workflow.disabled) }),
      });
      const result = await response.json() as TaughtWorkflow & { error?: string };
      if (!response.ok) throw new Error(result.error || "The skill could not be updated.");
      setSkills((current) => (current || []).map((entry) => (entry.id === workflow.id ? result : entry)));
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "The skill could not be updated.");
    } finally {
      setBusyId(null);
    }
  }
  return (
    <fieldset className="conversation-organizer skill-toggles">
      <legend>Skills</legend>
      <p>Turn off a skill and this teammate loses it: it cannot be invoked and is removed from their working files until you turn it back on.</p>
      <button type="button" className="skill-toggles-open" onClick={() => { setOpen(true); void load().catch(() => setSkills([])); }}>{open ? "Refresh skills" : "Show skills"}</button>
      {open && (skills?.length ? (
        <div className="skill-toggle-rows">
          {skills.map((workflow) => (
            <div className="skill-toggle-row" key={workflow.id}>
              <span>
                <strong>{workflow.name}</strong>
                <small>{workflow.source === "taught" ? "taught" : workflow.source === "proposed" ? "from a receipt" : workflow.source}{workflow.disabled ? " · off" : ""}</small>
              </span>
              <label className="switch-field">
                <input
                  type="checkbox"
                  checked={!workflow.disabled}
                  disabled={busyId === workflow.id}
                  onChange={() => void toggle(workflow)}
                />
                <span>{workflow.disabled ? "Off" : "On"}</span>
              </label>
            </div>
          ))}
        </div>
      ) : <small className="panel-note">{skills ? "No skills yet. Teach one from their browser, or import a profile." : "Loading…"}</small>)}
      {note && <small role="alert">{note}</small>}
    </fieldset>
  );
}

export function BotPanel({
  bot,
  thread,
  provider,
  apps = [],
  onSave,
  onUpdateThread,
  onDuplicate,
  onOpenTeach,
  onRetire,
}: {
  bot: Bot;
  thread: Thread;
  provider: ProviderStatus | null;
  apps?: ConnectorStatus["access"];
  onSave: (id: string, patch: Partial<Bot>) => Promise<void>;
  onUpdateThread: (
    patch: Partial<Pick<Thread, "section" | "pinned" | "hidden">>,
  ) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onOpenTeach: () => void;
  onRetire: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    role: bot.role,
    instructions: bot.instructions,
    model: bot.model,
    weeklyTokenBudget: bot.weeklyTokenBudget,
    computerEnabled: bot.computerEnabled,
    browserEnabled: bot.browserEnabled,
    mascot: bot.mascot,
    color: bot.color,
  });
  const [section, setSection] = useState(thread.section || ""),
    [saved, setSaved] = useState(false),
    [duplicating, setDuplicating] = useState(false),
    [liveView, setLiveView] = useState(false);
  const assignedModels = provider?.instances.find(
    (instance) => instance.id === bot.providerInstanceId,
  )?.models || [form.model];
  const modelChoices = assignedModels.includes(form.model)
    ? assignedModels
    : [form.model, ...assignedModels];
  const gmail = apps.find(
      (access) => access.botId === bot.id && access.service === "gmail",
    ),
    drive = apps.find(
      (access) => access.botId === bot.id && access.service === "google-drive",
    ),
    calendar = apps.find(
      (access) =>
        access.botId === bot.id && access.service === "google-calendar",
    ),
    github = apps.find(
      (access) => access.botId === bot.id && access.service === "github",
    ),
    slack = apps.find(
      (access) => access.botId === bot.id && access.service === "slack",
    ),
    notion = apps.find(
      (access) => access.botId === bot.id && access.service === "notion",
    ),
    todoist = apps.find(
      (access) => access.botId === bot.id && access.service === "todoist",
    ),
    dropbox = apps.find(
      (access) => access.botId === bot.id && access.service === "dropbox",
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await Promise.all([
      onSave(bot.id, form),
      onUpdateThread({ section: section.trim() || null }),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const preview = { ...bot, mascot: form.mascot, color: form.color };
  // S5-UX02: readiness must reflect the budget state, not claim "ready" for
  // a teammate that cannot start another model step.
  const budgetExhausted = bot.weeklyTokenBudget > 0 && bot.tokensUsedThisWeek >= bot.weeklyTokenBudget;
  return (
    <form className="bot-editor" onSubmit={submit}>
      <div
        className="bot-hero"
        style={{ "--bot-color": form.color } as React.CSSProperties}
      >
        <Mascot bot={preview} size="large" />
        <h3>{bot.name}</h3>
        <p>
          {bot.status === "working"
            ? "Busy making progress"
            : bot.status === "waiting"
              ? "Patiently waiting for you"
              : budgetExhausted
                ? `Paused — weekly budget reached (${compactNumber(bot.tokensUsedThisWeek)} of ${compactNumber(bot.weeklyTokenBudget)} tokens). Existing files stay available.`
                : "Ready for something new"}
        </p>
        <div className="capability-pills">
          <span className={!form.computerEnabled ? "off" : ""}>
            <Cpu size={12} />{" "}
            {form.computerEnabled ? "private computer" : "computer off"}
          </span>
          <span className={!form.browserEnabled ? "off" : ""}>
            <Globe2 size={12} />{" "}
            {form.browserEnabled ? "own browser" : "browser off"}
          </span>
          <span className={!bot.macAccessEnabled ? "off" : ""}>
            <HardDrive size={12} />{" "}
            {bot.macAccessEnabled
              ? "Mac files & apps"
              : "Studio Mac access off"}
          </span>
          {gmail?.canRead && (
            <span>
              <Mail size={12} /> Gmail{gmail.canSend ? " + send" : ""}
            </span>
          )}
          {drive?.canRead && (
            <span>
              <FolderOpen size={12} /> Drive
            </span>
          )}
          {calendar?.canRead && (
            <span>
              <Clock3 size={12} /> Calendar
            </span>
          )}
          {github?.canRead && (
            <span>
              <ConnectorIcon id="github" /> GitHub
              {github.canSend ? " + issues" : ""}
            </span>
          )}
          {slack?.canRead && (
            <span>
              <ConnectorIcon id="slack" /> Slack{slack.canSend ? " + post" : ""}
            </span>
          )}
          {notion?.canRead && (
            <span>
              <ConnectorIcon id="notion" /> Notion
              {notion.canSend ? " + notes" : ""}
            </span>
          )}
          {todoist?.canRead && (
            <span>
              <ConnectorIcon id="todoist" /> Todoist
              {todoist.canSend ? " + create" : ""}
            </span>
          )}
          {dropbox?.canRead && (
            <span><ConnectorIcon id="dropbox" /> Dropbox</span>
          )}
        </div>
      </div>
      <details className="bot-appearance">
        <summary>Customize character <small>Shape and color</small></summary>
        <AppearancePicker name={bot.name} shape={form.mascot} color={form.color} onShape={(mascot) => setForm({ ...form, mascot })} onColor={(color) => setForm({ ...form, color })} />
      </details>
      <label className="field">
        <span>What {bot.name} is great at</span>
        <input
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Personality and working style</span>
        <textarea
          rows={5}
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Model</span>
        <select
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        >
          {modelChoices.map((value) => (
            <option key={value} value={value}>
              {shortModel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Weekly token limit</span>
        <input
          type="number"
          min="0"
          step="10000"
          value={form.weeklyTokenBudget}
          onChange={(e) =>
            setForm({ ...form, weeklyTokenBudget: Number(e.target.value) })
          }
        />
        <small>
          {compactNumber(bot.tokensUsedThisWeek)} used · 0 means unlimited
        </small>
      </label>
      <div className="switch-list">
        <label>
          <span>
            <Cpu size={17} />
            <b>Private computer</b>
            <small>Terminal work stays in a limited container</small>
          </span>
          <input
            type="checkbox"
            checked={form.computerEnabled}
            onChange={(e) =>
              setForm({ ...form, computerEnabled: e.target.checked })
            }
          />
        </label>
        <label>
          <span>
            <Globe2 size={17} />
            <b>Private browser</b>
            <small>Separate history and sign-ins for this bot</small>
          </span>
          <input
            type="checkbox"
            checked={form.browserEnabled}
            onChange={(e) =>
              setForm({ ...form, browserEnabled: e.target.checked })
            }
          />
        </label>
        {form.browserEnabled && (
          <div>
            <div className="delegation-actions">
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/browser/window`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                    const result = (await response.json()) as { error?: string; hint?: string };
                    if (!response.ok) throw new Error(result.error || "The browser window could not be opened.");
                    window.alert(result.hint || "The browser window is open.");
                  })().catch((error: Error) => window.alert(error.message));
                }}
              >
                <ExternalLink size={15} />
                Open browser window
              </button>
              <button type="button" className={liveView ? "is-on" : ""} onClick={() => setLiveView(!liveView)}>
                {liveView ? <ChevronDown size={15} /> : <MonitorPlay size={15} />}
                {liveView ? "Hide live view" : "View in app"}
              </button>
            </div>
            <small>
              Drive it yourself in the window, or watch {bot.name} work right
              here. The browser belongs to this teammate either way.
            </small>
            {liveView && (
              <InAppBrowserView botId={bot.id} onNotice={(message) => window.alert(message)} />
            )}
            <BrowserSiteData botId={bot.id} />
          </div>
        )}
      </div>
      <SkillToggles botId={bot.id} />
      <details className="bot-conversation">
        <summary>Organize this conversation</summary>
      <fieldset className="conversation-organizer">
        <legend>Conversation</legend>
        <p>Keep a growing team tidy without losing any work.</p>
        <label className="field">
          <span>Sidebar section</span>
          <input
            value={section}
            onChange={(event) => setSection(event.target.value)}
            placeholder="Teammates"
            maxLength={40}
          />
        </label>
        <div>
          <button
            type="button"
            className={thread.pinned ? "is-on" : ""}
            onClick={() => void onUpdateThread({ pinned: !thread.pinned })}
          >
            <Pin size={15} />
            {thread.pinned ? "Pinned" : "Pin to top"}
          </button>
          <button
            type="button"
            onClick={async () => {
              setDuplicating(true);
              try {
                await onDuplicate();
              } finally {
                setDuplicating(false);
              }
            }}
            disabled={duplicating}
          >
            <Copy size={15} />
            {duplicating ? "Copying…" : "Duplicate setup"}
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/share`);
                if (!response.ok) throw new Error("This teammate could not be shared.");
                const bundle = await response.json();
                const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
                const link = document.createElement("a");
                link.href = url;
                link.download = `teammate-${bot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "teammate"}.openbot.json`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1_000);
              })().catch(() => window.alert("This teammate could not be shared."));
            }}
          >
            <Download size={15} />
            Share setup
          </button>
          <button
            type="button"
            className="quiet-danger"
            onClick={() => void onUpdateThread({ hidden: true })}
          >
            <EyeOff size={15} />
            Hide from sidebar
          </button>
          <button
            type="button"
            className="quiet-danger"
            onClick={() => {
              if (
                window.confirm(
                  `Retire ${bot.name}? Their history stays, but they leave the team and stop all work. You can restore them later.`,
                )
              )
                void onRetire();
            }}
          >
            <Archive size={15} />
            Retire teammate
          </button>
        </div>
        <small>
          Duplicating copies this teammate’s setup and access, but never their
          private history or memory. Retiring keeps every conversation and
          result, stops active work, and frees their seat.
        </small>
      </fieldset>
      </details>
      <button type="button" className="teach-callout" onClick={onOpenTeach}>
        <WandSparkles size={19} />
        <span>
          <strong>Teach {bot.name} a website task</strong>
          <small>Demonstrate it once in a visible browser</small>
        </span>
        <ChevronDown size={16} />
      </button>
      <button className="button-primary button-wide" type="submit">
        {saved ? (
          <>
            <Check size={17} /> Saved
          </>
        ) : (
          "Save changes"
        )}
      </button>
    </form>
  );
}

export function FilesPanel({ bot }: { bot: Bot }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]),
    [selected, setSelected] = useState<{
      path: string;
      content: string;
    } | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api<WorkspaceFile[]>(`/api/bots/${bot.id}/files`)
      .then(setFiles)
      .finally(() => setLoading(false));
  }, [bot.id]);
  const open = async (file: WorkspaceFile) => {
    if (file.kind === "file")
      setSelected(
        await api(
          `/api/bots/${bot.id}/file?path=${encodeURIComponent(file.path)}`,
        ),
      );
  };
  if (selected)
    return (
      <div className="file-preview">
        <button className="back-button" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} /> All files
        </button>
        <div className="file-preview-title">
          <FileText size={18} />
          <strong>{selected.path}</strong>
        </div>
        <pre>{selected.content}</pre>
      </div>
    );
  return (
    <div className="files-view">
      <div className="friendly-note">
        <FolderOpen size={18} />
        <p>
          <strong>{bot.name} has a private workspace.</strong>
          <br />
          Files persist across sessions while terminal commands run inside the
          bot's constrained computer.
        </p>
      </div>
      {loading ? (
        <div className="empty-panel">
          <LoaderCircle className="spinner" />
        </div>
      ) : files.length ? (
        <div className="file-list">
          {files.map((file) => (
            <button key={file.path} onClick={() => void open(file)}>
              {file.kind === "directory" ? (
                <Folder size={18} />
              ) : (
                <File size={18} />
              )}
              <span>{file.path}</span>
              {file.kind === "file" && (
                <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <div className="empty-illustration">
            <FolderOpen size={30} />
          </div>
          <h3>Nothing here yet</h3>
          <p>Ask {bot.name} to create a note, plan or small project.</p>
        </div>
      )}
    </div>
  );
}

type RoutineInput = {
  schedule?: RoutineSchedule;
  name: string;
  botId: string;
  threadId: string;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: Routine["triggerConfig"];
};
type RoutineSaveResult = Routine & {
  webhook?: { url: string; secret: string };
};

function routineTriggerLabel(routine: Routine) {
  if (routine.triggerType === "webpage") return `Page changes · ${routine.triggerConfig.pageUrl || "public page"}`;
  if (routine.triggerType === "schedule")
    return routine.scheduleLabel || routineScheduleLabel(routine.intervalMinutes);
  if (routine.triggerType === "github")
    return `GitHub · ${routine.triggerConfig.githubEvent || "event"}${routine.triggerConfig.githubAction ? ` / ${routine.triggerConfig.githubAction}` : ""}`;
  if (routine.triggerType === "calendar")
    return `${routine.triggerConfig.minutesBefore ?? 15} min before a Calendar event`;
  if (routine.triggerType === "todoist")
    return routine.triggerConfig.todoistEvent && routine.triggerConfig.todoistEvent !== "any"
      ? `Todoist · task ${routine.triggerConfig.todoistEvent}`
      : "Todoist · any task change";
  if (routine.triggerType === "dropbox")
    return routine.triggerConfig.dropboxPath ? `Dropbox · ${routine.triggerConfig.dropboxPath}` : "Dropbox · any file change";
  if (routine.triggerType === "slack")
    return `Slack · ${routine.triggerConfig.slackEvent === "any" || !routine.triggerConfig.slackEvent ? "any subscribed activity" : routine.triggerConfig.slackEvent}${routine.triggerConfig.slackChannel ? ` · ${routine.triggerConfig.slackChannel}` : ""}`;
  if (routine.triggerType === "notion")
    return `Notion · ${(routine.triggerConfig.notionEvent || "any change").replace("_", " ")}`;
  return routine.triggerConfig.eventName
    ? `Webhook · ${routine.triggerConfig.eventName}`
    : "Signed webhook";
}

function automationStatusLabel(status: AutomationEvent["status"]) {
  if (status === "completed") return "Finished";
  if (status === "failed") return "Needs another try";
  if (status === "cancelled") return "Stopped";
  if (status === "waiting") return "Waiting for you";
  if (status === "rate_limited") return "Safely rate-limited";
  return status === "running" ? "In progress" : "Queued";
}

export function RoutinesPanel({
  routines,
  events,
  alerts,
  runner,
  bots,
  onCreate,
  onUpdate,
  onToggle,
  onDelete,
  onRun,
  onReplay,
  onRotateSecret,
  onResolveAlert,
  onOpenResult,
  onProtectRunner,
  onUnprotectRunner,
  onWakeRunner,
  onEnableNotifications,
}: {
  routines: Routine[];
  events: AutomationEvent[];
  alerts: AutomationAlert[];
  runner: RunnerHealth;
  bots: Bot[];
  onCreate: (input: RoutineInput) => Promise<RoutineSaveResult>;
  onUpdate: (
    routine: Routine,
    input: RoutineInput,
  ) => Promise<RoutineSaveResult>;
  onToggle: (routine: Routine) => Promise<void>;
  onDelete: (routine: Routine) => Promise<void>;
  onRun: (routine: Routine) => Promise<void>;
  onReplay: (event: AutomationEvent) => Promise<void>;
  onRotateSecret: (routine: Routine) => Promise<RoutineSaveResult>;
  onResolveAlert: (alert: AutomationAlert) => Promise<void>;
  onOpenResult: (routine: Routine) => void;
  onProtectRunner: () => Promise<void>;
  onUnprotectRunner: () => Promise<void>;
  onWakeRunner: () => Promise<void>;
  onEnableNotifications: () => Promise<boolean>;
}) {
  const [creating, setCreating] = useState(routines.length === 0),
    [name, setName] = useState(""),
    [prompt, setPrompt] = useState(""),
    [botId, setBotId] = useState(bots[0]?.id || "");
  const [schedule, setSchedule] = useState<
      "5" | "15" | "60" | "1440" | "10080" | "custom"
    >("1440"),
    [customAmount, setCustomAmount] = useState(2),
    [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">(
      "hours",
    );
  const [triggerType, setTriggerType] =
      useState<AutomationTriggerType>("schedule"),
    [eventName, setEventName] = useState(""),
    [pageUrl, setPageUrl] = useState(""),
    [pageSelector, setPageSelector] = useState(""),
    [githubEvent, setGithubEvent] = useState("issues"),
    [githubAction, setGithubAction] = useState("opened"),
    [repository, setRepository] = useState(""),
    [titleContains, setTitleContains] = useState(""),
    [minutesBefore, setMinutesBefore] = useState(15),
    [todoistEvent, setTodoistEvent] = useState<"added" | "updated" | "completed" | "any">("any"),
    [dropboxPath, setDropboxPath] = useState(""),
    [slackEvent, setSlackEvent] = useState<"mention" | "message" | "reaction" | "any">("mention"),
    [slackChannel, setSlackChannel] = useState(""),
    [notionEvent, setNotionEvent] = useState<"page_updated" | "page_created" | "comment" | "database" | "any">("page_updated"),
    [notionEntityId, setNotionEntityId] = useState("");
  const [enabled, setEnabled] = useState(true),
    [saving, setSaving] = useState(false),
    [runnerBusy, setRunnerBusy] = useState(false),
    [runnerError, setRunnerError] = useState<string | null>(null),
    [runnerCare, setRunnerCare] = useState<RunnerCareStatus | null>(null),
    [runnerCareBusy, setRunnerCareBusy] = useState(false),
    [runnerCareAttempted, setRunnerCareAttempted] = useState(false),
    [privateDomain, setPrivateDomain] = useState(""),
    [setupCopied, setSetupCopied] = useState(false),
    [updateCopied, setUpdateCopied] = useState(false),
    [heartbeatAddress, setHeartbeatAddress] = useState(""),
    [heartbeatEditing, setHeartbeatEditing] = useState(false),
    [transferCopied, setTransferCopied] = useState<"export" | "import" | null>(null),
    [editing, setEditing] = useState<Routine | null>(null),
    [openHistory, setOpenHistory] = useState<string | null>(null);
  const [createdHook, setCreatedHook] = useState<{
    name: string;
    url: string;
    secret: string;
    type: AutomationTriggerType;
  } | null>(null);
  const selectedBot = bots.find((item) => item.id === botId) || bots[0];
  const [calendarSchedule, setCalendarSchedule] = useState<RoutineSchedule>({ kind: "calendar", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5] });
  const [scheduleValid, setScheduleValid] = useState(false);
  const [scheduleDescription, setScheduleDescription] = useState("");
  const managingFromThisMac = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
  const privateRunner = runner.deployment?.mode === "private_runner";
  const cleanPrivateDomain = privateDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const privateDomainValid = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(cleanPrivateDomain) && cleanPrivateDomain.includes(".");
  const setupCommand = `./deploy/private-runner/setup.sh ${privateDomainValid ? cleanPrivateDomain : "studio.example.com"}`;
  const unitMultiplier =
    customUnit === "days" ? 1440 : customUnit === "hours" ? 60 : 1;
  const intervalMinutes =
    schedule === "custom"
      ? Math.round(customAmount * unitMultiplier)
      : Number(schedule);
  const intervalValid =
    !["schedule", "webpage"].includes(triggerType) ||
    (intervalMinutes >= (triggerType === "webpage" ? 15 : 5) && intervalMinutes <= 43_200);
  const copy = (value: string) => void navigator.clipboard.writeText(value);
  const reset = () => {
    setCalendarSchedule({ kind: "calendar", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5] });
    setName("");
    setPrompt("");
    setSchedule("1440");
    setCustomAmount(2);
    setCustomUnit("hours");
    setTriggerType("schedule");
    setEventName("");
    setPageUrl("");
    setPageSelector("");
    setGithubEvent("issues");
    setGithubAction("opened");
    setRepository("");
    setTitleContains("");
    setMinutesBefore(15);
    setTodoistEvent("any");
    setDropboxPath("");
    setSlackEvent("mention");
    setSlackChannel("");
    setNotionEvent("page_updated");
    setNotionEntityId("");
    setEnabled(true);
    setEditing(null);
    setCreating(false);
  };
  const startCreate = () => {
    reset();
    setCreatedHook(null);
    setCreating(true);
  };
  const startEdit = (routine: Routine) => {
    setCalendarSchedule(routine.schedule || { kind: "interval" });
    setEditing(routine);
    setCreating(true);
    setCreatedHook(null);
    setName(routine.name);
    setPrompt(routine.prompt);
    setBotId(routine.botId);
    setEnabled(routine.enabled);
    setTriggerType(routine.triggerType);
    setEventName(routine.triggerConfig.eventName || "");
    setPageUrl(routine.triggerConfig.pageUrl || "");
    setPageSelector(routine.triggerConfig.pageSelector || "");
    setGithubEvent(routine.triggerConfig.githubEvent || "issues");
    setGithubAction(routine.triggerConfig.githubAction || "");
    setRepository(routine.triggerConfig.repository || "");
    setTitleContains(routine.triggerConfig.titleContains || "");
    setMinutesBefore(routine.triggerConfig.minutesBefore ?? 15);
    setTodoistEvent(routine.triggerConfig.todoistEvent ?? "any");
    setDropboxPath(routine.triggerConfig.dropboxPath ?? "");
    setSlackEvent(routine.triggerConfig.slackEvent ?? "mention");
    setSlackChannel(routine.triggerConfig.slackChannel ?? "");
    setNotionEvent(routine.triggerConfig.notionEvent ?? "page_updated");
    setNotionEntityId(routine.triggerConfig.notionEntityId ?? "");
    const preset = [5, 15, 60, 1440, 10080].includes(routine.intervalMinutes)
      ? (String(routine.intervalMinutes) as typeof schedule)
      : "custom";
    setSchedule(preset);
    if (preset === "custom") {
      const unit =
        routine.intervalMinutes % 1440 === 0
          ? "days"
          : routine.intervalMinutes % 60 === 0
            ? "hours"
            : "minutes";
      setCustomUnit(unit);
      setCustomAmount(
        routine.intervalMinutes /
          (unit === "days" ? 1440 : unit === "hours" ? 60 : 1),
      );
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBot || !intervalValid || (triggerType === "schedule" && !scheduleValid) || saving) return;
    setSaving(true);
    const triggerConfig =
      triggerType === "webpage" ? { pageUrl: pageUrl.trim(), ...(pageSelector.trim() ? { pageSelector: pageSelector.trim() } : {}) } : triggerType === "github"
        ? {
            githubEvent,
            ...(githubAction ? { githubAction } : {}),
            ...(repository ? { repository } : {}),
          }
        : triggerType === "webhook"
          ? { ...(eventName ? { eventName } : {}) }
          : triggerType === "calendar"
            ? { ...(titleContains ? { titleContains } : {}), minutesBefore }
            : triggerType === "todoist"
              ? { todoistEvent }
              : triggerType === "dropbox"
                ? { ...(dropboxPath ? { dropboxPath } : {}) }
              : triggerType === "slack"
                ? { slackEvent, ...(slackChannel ? { slackChannel } : {}) }
              : triggerType === "notion"
                ? { notionEvent, ...(notionEntityId ? { notionEntityId } : {}) }
            : {};
    try {
      const input = {
        name,
        prompt,
        botId: selectedBot.id,
        threadId: editing?.botId === selectedBot.id ? editing.threadId : selectedBot.threadId,
        intervalMinutes: ["schedule", "webpage"].includes(triggerType) ? intervalMinutes : 1440,
        schedule: triggerType === "schedule" ? calendarSchedule : { kind: "interval" as const },
        enabled,
        triggerType,
        triggerConfig,
      };
      const result = editing
        ? await onUpdate(editing, input)
        : await onCreate(input);
      if (result.webhook)
        setCreatedHook({
          name: result.name,
          ...result.webhook,
          type: result.triggerType,
        });
      reset();
    } finally {
      setSaving(false);
    }
  };
  const lastStatus = (routine: Routine) =>
    routine.pausedReason ||
    (routine.lastStatus === "completed"
      ? "Last run finished"
      : routine.lastStatus === "failed"
        ? "Needs attention"
        : "Ready for its first event");
  const runRunnerAction = async (action: () => Promise<void>) => {
    setRunnerBusy(true);
    setRunnerError(null);
    try { await action(); }
    catch (error) { setRunnerError(error instanceof Error ? error.message : "OpenBot could not change the runner."); }
    finally { setRunnerBusy(false); }
  };
  const checkPrivateHome = useCallback(async () => {
    setRunnerCareAttempted(true);
    setRunnerCareBusy(true);
    setRunnerError(null);
    try { setRunnerCare(await api<RunnerCareStatus>("/api/runner/diagnostics")); }
    catch (error) { setRunnerError(error instanceof Error ? error.message : "OpenBot could not check this private home."); }
    finally { setRunnerCareBusy(false); }
  }, []);
  const setHealthAlerts = async (enabled: boolean) => {
    if (runnerCareBusy) return;
    setRunnerCareBusy(true);
    setRunnerError(null);
    try {
      if (enabled && !runnerCare?.alerts.deliveryReady && !(await onEnableNotifications())) return;
      await api("/api/runner/diagnostics/alerts", { method: "PATCH", body: JSON.stringify({ enabled }) });
      setRunnerCare(await api<RunnerCareStatus>("/api/runner/diagnostics"));
    } catch (error) {
      setRunnerError(error instanceof Error ? error.message : "OpenBot could not change private-home alerts.");
    } finally {
      setRunnerCareBusy(false);
    }
  };
  const setExternalHeartbeat = async (enabled: boolean, replace = false) => {
    if (runnerCareBusy) return;
    const url = heartbeatAddress.trim();
    if (enabled && (replace || !runnerCare?.heartbeat.configured) && !url) {
      setRunnerError("Paste the private HTTPS address from your heartbeat service first.");
      return;
    }
    setRunnerCareBusy(true);
    setRunnerError(null);
    try {
      await api("/api/runner/diagnostics/heartbeat", {
        method: "PATCH",
        body: JSON.stringify({ enabled, ...((replace || !runnerCare?.heartbeat.configured) && url ? { url } : {}) }),
      });
      setRunnerCare(await api<RunnerCareStatus>("/api/runner/diagnostics"));
      setHeartbeatAddress("");
      setHeartbeatEditing(false);
    } catch (error) {
      setRunnerError(error instanceof Error ? error.message : "OpenBot could not connect that outside heartbeat.");
    } finally {
      setRunnerCareBusy(false);
    }
  };
  useEffect(() => {
    if (privateRunner && !runnerCareAttempted) void checkPrivateHome();
  }, [checkPrivateHome, privateRunner, runnerCareAttempted]);
  return (
    <div className="routines-view">
      <details className="automation-health" open={runner.status !== "online" ? true : undefined}>
      <summary><span className={runner.status === "online" ? "health-ready" : "health-attention"} />{runner.status === "online" ? "Your studio is awake" : "Your studio needs attention"}<small>Status & recovery</small></summary>
      <div className="automation-health-body">
      <section className={`runner-card runner-${runner.status}${privateRunner ? " runner-private" : ""}`}>
        <div className="runner-presence">
          <span><Power size={18} /></span>
          <i />
        </div>
        <div className="runner-copy">
          <span className="runner-kicker">
            {privateRunner ? "Private always-on home" : runner.status === "online" ? "Studio awake" : "Needs a restart"}
            {privateRunner ? <b><Globe2 size={11} /> Always on</b> : runner.backgroundService === "installed" && <b><ShieldCheck size={11} /> Protected</b>}
          </span>
          <strong>{privateRunner
            ? runner.status === "online" ? "Your studio keeps working when this Mac closes" : "Your private home needs a restart"
            : runner.status === "online" ? "Your automations have an active runner" : "Automations are saved, but nothing is picking them up"}</strong>
          <p>{runner.backgroundServiceDetail}</p>
          <small>{privateRunner ? "Studio history, connections and files stay on the private host you chose." : "Your Mac must be powered on and awake. Missed schedules are picked up safely when it returns."}</small>
          {privateRunner && runner.deployment && (
            <div className="runner-readiness">
              {runner.deployment.checks.map((check) => (
                <span className={check.status} key={check.id} title={check.detail}>
                  {check.id === "https" ? <Globe2 size={10} /> : check.id === "storage" ? <HardDrive size={10} /> : check.id === "access" ? <KeyRound size={10} /> : <Power size={10} />}
                  {check.label}
                </span>
              ))}
            </div>
          )}
          {runnerError && <em className="runner-error"><CircleAlert size={11} /> {runnerError}</em>}
        </div>
        <div className="runner-stats">
          <span><b>{runner.runningRuns}</b> working</span>
          <span><b>{runner.queuedRuns}</b> queued</span>
          <span><b>{runner.waitingRuns}</b> waiting</span>
          <span><b>{runner.recoveredRuns}</b> recovered</span>
        </div>
        <div className="runner-actions">
          {!privateRunner && runner.backgroundService === "not_installed" && managingFromThisMac && (
            <button className="primary" disabled={runnerBusy} onClick={() => void runRunnerAction(onProtectRunner)}>{runnerBusy ? <LoaderCircle className="spinner" size={13} /> : <ShieldCheck size={13} />} Keep OpenBot running</button>
          )}
          {!privateRunner && runner.backgroundService === "installed" && managingFromThisMac && (
            <button disabled={runnerBusy} onClick={() => {
              if (!window.confirm("Turn off background protection? Saved automations stay in place, but OpenBot will only run while you start it yourself.")) return;
              void runRunnerAction(onUnprotectRunner);
            }}><Power size={13} /> Turn off protection</button>
          )}
          <button disabled={runnerBusy} onClick={() => void runRunnerAction(onWakeRunner)}><RefreshCw size={13} /> Check now</button>
          {privateRunner && <button className="primary" disabled={runnerCareBusy} onClick={() => void checkPrivateHome()}>{runnerCareBusy ? <LoaderCircle className="spinner" size={13} /> : <ShieldCheck size={13} />} Home check</button>}
          {!privateRunner && !managingFromThisMac && runner.backgroundService === "not_installed" && <small>Turn on protection from your Mac</small>}
        </div>
      </section>

      {privateRunner && runnerCare && (
        <section className={`runner-care runner-care-${runnerCare.overall}`}>
          <header>
            <span className="runner-care-mark">{runnerCare.overall === "ready" ? <Check size={16} /> : <CircleAlert size={16} />}</span>
            <div>
              <b>{runnerCare.summary}</b>
              <small>OpenBot {runnerCare.version} · awake for {compactDuration(runnerCare.uptimeSeconds)} · checked just now</small>
            </div>
            <button disabled={runnerCareBusy} onClick={() => void checkPrivateHome()} aria-label="Check private home again"><RefreshCw className={runnerCareBusy ? "spinner" : ""} size={14} /></button>
          </header>
          <div className="runner-care-grid">
            {runnerCare.checks.map((check) => (
              <article className={check.status} key={check.id}>
                <span>{check.id === "storage" ? <HardDrive size={15} /> : check.id === "backup" ? <FileArchive size={15} /> : check.id === "software" ? <RefreshCw size={15} /> : check.id === "opencode" ? <Sparkles size={15} /> : check.id === "browser" ? <Globe2 size={15} /> : <Cpu size={15} />}</span>
                <div><b>{check.label}</b><strong>{check.value}</strong><small>{check.detail}</small></div>
                {check.status === "ready" ? <Check size={13} /> : <CircleAlert size={13} />}
              </article>
            ))}
          </div>
          <footer>
            <div><b>Private data home</b><code>{runnerCare.dataPath}</code></div>
            <div><b>Create a fresh backup</b><code>./deploy/private-runner/backup.sh</code></div>
          </footer>
          <div className="runner-maintenance-actions">
            <span><RefreshCw size={15} /><span><b>Backup-first updates</b><small>Refuses unsafe source changes and restores the previous service if health checks fail.</small></span></span>
            <code>./deploy/private-runner/update.sh</code>
            <button onClick={() => { copy("./deploy/private-runner/update.sh"); setUpdateCopied(true); }}><Copy size={12} /> {updateCopied ? "Copied" : "Copy update"}</button>
          </div>
          <div className={`runner-health-alerts ${runnerCare.alerts.enabled ? "enabled" : ""}`}>
            <span className="runner-health-alert-icon"><Bell size={16} /></span>
            <span><b>{runnerCare.alerts.enabled ? "Health alerts are on" : "Alert me if this home needs attention"}</b><small>{runnerCare.alerts.enabled ? `Checked every ${runnerCare.alerts.intervalMinutes} minutes · ${runnerCare.alerts.destinationCount} ready device${runnerCare.alerts.destinationCount === 1 ? "" : "s"}` : "A quiet push when storage, backups, tools, or bot computers need you—and once when they recover."}</small></span>
            <button disabled={runnerCareBusy} onClick={() => void setHealthAlerts(!runnerCare.alerts.enabled)}>{runnerCare.alerts.enabled ? "Turn off" : "Turn on"}</button>
          </div>
          <div className={`runner-external-heartbeat ${runnerCare.heartbeat.enabled ? "enabled" : ""}${runnerCare.heartbeat.lastError ? " attention" : ""}`}>
            <span className="runner-heartbeat-icon">{runnerCare.heartbeat.enabled ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
            <div className="runner-heartbeat-copy">
              <b>{runnerCare.heartbeat.enabled ? "Offline protection is checking in" : "Know if this whole home goes offline"}</b>
              <small>{runnerCare.heartbeat.enabled
                ? `A private pulse goes to ${runnerCare.heartbeat.provider || "your outside service"} every ${runnerCare.heartbeat.intervalMinutes} minutes. It can alert you even if this host loses power.`
                : "Connect a private heartbeat address. Only an empty check-in leaves OpenBot; no studio names, files, prompts, or health details are sent."}</small>
              {runnerCare.heartbeat.lastError && <em><CircleAlert size={10} /> {runnerCare.heartbeat.lastError}</em>}
              {!runnerCare.heartbeat.lastError && runnerCare.heartbeat.lastSuccessAt && <em className="success"><Check size={10} /> Last check-in {relativeTime(runnerCare.heartbeat.lastSuccessAt) === "Now" ? "just now" : `${relativeTime(runnerCare.heartbeat.lastSuccessAt)} ago`}</em>}
            </div>
            {(!runnerCare.heartbeat.configured || heartbeatEditing) && (
              <label className="runner-heartbeat-field">
                <span>Private heartbeat address</span>
                <input type="url" value={heartbeatAddress} onChange={(event) => setHeartbeatAddress(event.target.value)} placeholder="https://heartbeat.example/your-private-id" spellCheck={false} />
              </label>
            )}
            <div className="runner-heartbeat-actions">
              {runnerCare.heartbeat.configured && !heartbeatEditing && <button className="quiet" disabled={runnerCareBusy} onClick={() => setHeartbeatEditing(true)}>Replace</button>}
              {heartbeatEditing && <button className="quiet" disabled={runnerCareBusy} onClick={() => { setHeartbeatEditing(false); setHeartbeatAddress(""); }}>Cancel</button>}
              <button disabled={runnerCareBusy} onClick={() => void setExternalHeartbeat(!runnerCare.heartbeat.enabled || heartbeatEditing, heartbeatEditing)}>
                {runnerCare.heartbeat.enabled && !heartbeatEditing ? "Turn off" : runnerCare.heartbeat.configured && !heartbeatEditing ? "Turn on" : "Connect"}
              </button>
            </div>
          </div>
          <div className="runner-home-transfer">
            <span className="runner-transfer-icon"><KeyRound size={16} /></span>
            <span><b>Move this home without exposing it</b><small>Your studio, subscriptions, browser state, and projects become one authenticated encrypted file. The passphrase is entered only in the host terminal.</small></span>
            <div className="runner-transfer-command"><code>./deploy/private-runner/export-home.sh</code><button onClick={() => { copy("./deploy/private-runner/export-home.sh"); setTransferCopied("export"); }}><Copy size={12} /> {transferCopied === "export" ? "Copied" : "Export"}</button></div>
            <div className="runner-transfer-command"><code>./deploy/private-runner/import-home.sh your-file.openbot-home</code><button onClick={() => { copy("./deploy/private-runner/import-home.sh your-file.openbot-home"); setTransferCopied("import"); }}><Copy size={12} /> {transferCopied === "import" ? "Copied" : "Import"}</button></div>
            <small className="runner-transfer-note"><ShieldCheck size={11} /> Import verifies and stages everything first, keeps a fresh recovery copy, and restores the old home if the new one does not become healthy.</small>
          </div>
        </section>
      )}

      {!privateRunner && (
        <details className="private-runner-guide">
          <summary>
            <span><Globe2 size={16} /></span>
            <div>
              <strong>Keep working when this Mac is off</strong>
              <small>Optional private hosting, with the same studio and safety rules</small>
            </div>
            <ChevronDown size={15} />
          </summary>
          <div className="private-runner-guide-body">
            <p>Run OpenBot on a small Linux server you control. Your Mac stays local unless you deliberately move the studio.</p>
            <ol>
              <li><b>Choose a host</b><span>A private VPS or home server with Docker</span></li>
              <li><b>Point a domain</b><span>OpenBot sets up encrypted HTTPS</span></li>
              <li><b>Start your home</b><span>Follow the reviewed private-runner guide</span></li>
            </ol>
            <label className="private-domain-field">
              <span>Your private address</span>
              <div><Globe2 size={13} /><input value={privateDomain} onChange={(event) => { setPrivateDomain(event.target.value); setSetupCopied(false); }} placeholder="studio.example.com" spellCheck={false} /></div>
              {privateDomain && !privateDomainValid && <small>Use a domain such as studio.example.com</small>}
            </label>
            <div className="private-setup-command">
              <code>{setupCommand}</code>
              <button disabled={!privateDomainValid} onClick={() => { copy(setupCommand); setSetupCopied(true); }}><Copy size={12} /> {setupCopied ? "Copied" : "Copy setup"}</button>
            </div>
            <div className="private-ownership-note"><ShieldCheck size={13} /><span><b>Nothing moves by itself.</b> Setup creates a new private home; migration stays a separate owner decision.</span></div>
            <small>Complete server, DNS, migration and backup steps: deploy/private-runner/README.md</small>
          </div>
        </details>
      )}

      </div>
      </details>

      {alerts.length > 0 && (
        <section className="automation-inbox">
          <header>
            <span>
              <Bell size={15} />
            </span>
            <div>
              <strong>Needs your attention</strong>
              <small>
                {alerts.length} automation{" "}
                {alerts.length === 1 ? "item" : "items"} to review
              </small>
            </div>
          </header>
          {alerts.map((alert) => {
            const routine = routines.find(
              (item) => item.id === alert.routineId,
            );
            const sourceEvent = events.find(
              (item) => item.id === alert.eventId,
            );
            return (
              <article key={alert.id}>
                <span className={`automation-alert-icon alert-${alert.kind}`}>
                  {alert.kind === "approval" ? (
                    <ShieldCheck size={14} />
                  ) : (
                    <CircleAlert size={14} />
                  )}
                </span>
                <div>
                  <strong>{alert.routineName}</strong>
                  <p>{alert.message}</p>
                  {alert.repairHint && <small>{alert.repairHint}</small>}
                </div>
                <div>
                  {routine &&
                    sourceEvent &&
                    ["failed", "cancelled", "rate_limited"].includes(
                      sourceEvent.status,
                    ) && (
                      <button onClick={() => void onReplay(sourceEvent)}>
                        <RefreshCw size={12} /> Retry
                      </button>
                    )}
                  {routine && (
                    <button onClick={() => onOpenResult(routine)}>
                      <ExternalLink size={12} /> Open
                    </button>
                  )}
                  <button onClick={() => void onResolveAlert(alert)}>
                    <Check size={12} /> Clear
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {createdHook && (
        <section className="hook-ready">
          <header>
            <span>
              <Check size={16} />
            </span>
            <div>
              <strong>{createdHook.name} is ready</strong>
              <small>
                Copy this secret now. OpenBot will not show it again.
              </small>
            </div>
            <button onClick={() => setCreatedHook(null)} aria-label="Close">
              <X size={14} />
            </button>
          </header>
          <label>
            <span>Hook URL</span>
            <code>{createdHook.url}</code>
            <button onClick={() => copy(createdHook.url)}>
              <Copy size={13} /> Copy
            </button>
          </label>
          <label>
            <span>
              {createdHook.type === "github"
                ? "GitHub webhook secret"
                : "Signing secret"}
            </span>
            <code>{createdHook.secret}</code>
            <button onClick={() => copy(createdHook.secret)}>
              <Copy size={13} /> Copy
            </button>
          </label>
          <p>
            {createdHook.type === "github"
              ? "Use application/json and enable SSL verification. GitHub signs deliveries with this secret."
              : "Send x-openbot-signature as sha256=HMAC_SHA256(raw request body, secret), plus a stable x-openbot-event-id."}
          </p>
        </section>
      )}

      {routines.length > 0 && (
        <div className="routine-list">
          {routines.map((routine) => {
            const bot =
              bots.find((item) => item.id === routine.botId) || bots[0]!;
            const routineEvents = events.filter(
              (item) => item.routineId === routine.id,
            );
            return (
              <article
                key={routine.id}
                className={`routine-card ${routine.enabled ? "is-on" : ""} ${routine.pausedReason ? "needs-attention" : ""}`}
              >
                <div className="routine-row">
                  <Mascot bot={bot} size="small" />
                  <div>
                    <strong>{routine.name}</strong>
                    <span>
                      {routine.botName} · {routineTriggerLabel(routine)}
                    </span>
                    <small>
                      {routine.enabled
                        ? lastStatus(routine)
                        : routine.pausedReason || "Paused"}
                      {routine.nextRunAt && routine.enabled
                        ? ` · next ${relativeTime(routine.nextRunAt) === "Now" ? "soon" : `in ${routineStartsInLabel(Math.max(5, Math.round((new Date(routine.nextRunAt).getTime() - Date.now()) / 60_000))).replace(/^Starts /, "")}`}`
                        : ""}
                    </small>
                    {routine.triggerType === "webpage" && <small>{routine.watchStatus
                      ? `${routine.watchStatus.detail} Checked ${relativeTime(routine.watchStatus.checkedAt)} · ${routine.watchStatus.unchangedChecks} unchanged checks skipped`
                      : "Waiting for the first check. No model is used until content changes."}</small>}
                  </div>
                  <button
                    className="routine-test"
                    disabled={routine.triggerType === "webpage" && !routine.enabled}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Test “${routine.name}” now? This uses the real permissions and can perform real actions.`,
                        )
                      )
                        void onRun(routine);
                    }}
                    title="Test with real permissions"
                  >
                    <Play size={12} /> {routine.triggerType === "webpage" ? "Check now" : "Test"}
                  </button>
                  <button
                    className={`toggle ${routine.enabled ? "on" : ""}`}
                    onClick={() => void onToggle(routine)}
                    aria-label={`${routine.enabled ? "Pause" : "Start"} ${routine.name}`}
                  >
                    <span />
                  </button>
                </div>
                <div className="routine-health">
                  <span
                    className={
                      routine.consecutiveFailures ? "warning" : "healthy"
                    }
                  >
                    {routine.consecutiveFailures
                      ? `${routine.consecutiveFailures} failed in a row`
                      : "Healthy"}
                  </span>
                  <span>{routine.runCount} runs</span>
                  {routine.deduplicatedCount > 0 && (
                    <span>
                      {routine.deduplicatedCount} duplicate
                      {routine.deduplicatedCount === 1 ? "" : "s"} stopped
                    </span>
                  )}
                  {["github", "webhook"].includes(routine.triggerType) && (
                    <>
                      <button
                        onClick={() =>
                          copy(
                            `${window.location.origin}/api/automation-hooks/${routine.id}`,
                          )
                        }
                      >
                        <Copy size={11} /> Hook URL
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "Create a new signing secret? The previous secret will stop working immediately.",
                            )
                          )
                            void onRotateSecret(routine).then((result) => {
                              if (result.webhook)
                                setCreatedHook({
                                  name: result.name,
                                  ...result.webhook,
                                  type: result.triggerType,
                                });
                            });
                        }}
                      >
                        <RotateCcw size={11} /> New secret
                      </button>
                    </>
                  )}
                </div>
                <div className="routine-actions">
                  <button onClick={() => startEdit(routine)}>
                    <Settings2 size={13} /> Edit
                  </button>
                  <button
                    onClick={() =>
                      setOpenHistory(
                        openHistory === routine.id ? null : routine.id,
                      )
                    }
                  >
                    <Clock3 size={13} />{" "}
                    {openHistory === routine.id
                      ? "Hide activity"
                      : `Activity${routineEvents.length ? ` · ${routineEvents.length}` : ""}`}
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete “${routine.name}”? Its past conversation results will stay available.`,
                        )
                      )
                        void onDelete(routine);
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
                {openHistory === routine.id && (
                  <div className="routine-history">
                    {routineEvents.length ? (
                      routineEvents.map((item) => (
                        <div
                          key={item.id}
                          className={`routine-history-row history-${item.status}`}
                        >
                          <span className="history-state">
                            {item.status === "completed" ? (
                              <Check size={12} />
                            ) : [
                                "failed",
                                "cancelled",
                                "rate_limited",
                              ].includes(item.status) ? (
                              "!"
                            ) : item.status === "waiting" ? (
                              <ShieldCheck size={12} />
                            ) : (
                              <LoaderCircle
                                className={
                                  item.status === "running" ? "spinner" : ""
                                }
                                size={12}
                              />
                            )}
                          </span>
                          <span>
                            <strong>
                              {automationStatusLabel(item.status)}
                              {item.attempt > 1 ? ` · try ${item.attempt}` : ""}
                            </strong>
                            <small>{item.payloadSummary}</small>
                            {item.source === "webpage" && <a href={`/api/routines/${routine.id}/events/${item.id}/evidence`} download="page-change-evidence.txt">Download change evidence</a>}
                            {item.error && (
                              <small className="history-error">
                                {item.error}
                              </small>
                            )}
                          </span>
                          <time>
                            {relativeTime(item.finishedAt || item.receivedAt)}
                          </time>
                          {["failed", "cancelled", "rate_limited"].includes(
                            item.status,
                          ) && (
                            <button onClick={() => void onReplay(item)}>
                              <RefreshCw size={12} /> Retry
                            </button>
                          )}
                          <button onClick={() => onOpenResult(routine)}>
                            <ExternalLink size={12} /> Open
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="routine-history-empty">
                        <Clock3 size={16} /> No events yet. Test it when you are
                        ready.
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {creating ? (
        <form className="routine-form" onSubmit={submit}>
          <header className="routine-form-head">
            <span>
              {editing ? <Settings2 size={17} /> : <Sparkles size={17} />}
            </span>
            <div>
              <strong>{editing ? "Edit automation" : "New automation"}</strong>
              <small>
                {editing
                  ? "Change the job, trigger or owner without losing its history."
                  : "Choose what wakes your teammate and what should happen next."}
              </small>
            </div>
          </header>
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My morning plan"
              required
            />
          </label>
          <fieldset className="routine-fieldset">
            <legend>What starts it?</legend>
            <select className="trigger-menu" aria-label="What starts it?" value={triggerType} onChange={(event) => { const kind = event.target.value as AutomationTriggerType; setTriggerType(kind); if (kind === "webpage" && schedule === "5") setSchedule("60"); }}>
              {[
                { value: "webpage" as const, label: "Page changes", icon: <Globe2 size={14} /> },
                {
                  value: "schedule" as const,
                  label: "Schedule",
                  icon: <Clock3 size={14} />,
                },
                {
                  value: "calendar" as const,
                  label: "Before a calendar event",
                  icon: <CalendarDays size={14} />,
                },
                {
                  value: "github" as const,
                  label: "GitHub",
                  icon: <GitBranch size={14} />,
                },
                {
                  value: "todoist" as const,
                  label: "Todoist",
                  icon: <span className="trigger-connector-icon"><ConnectorIcon id="todoist" /></span>,
                },
                {
                  value: "dropbox" as const,
                  label: "Dropbox",
                  icon: <span className="trigger-connector-icon"><ConnectorIcon id="dropbox" /></span>,
                },
                {
                  value: "slack" as const,
                  label: "Slack",
                  icon: <span className="trigger-connector-icon"><ConnectorIcon id="slack" /></span>,
                },
                {
                  value: "notion" as const,
                  label: "Notion",
                  icon: <span className="trigger-connector-icon"><ConnectorIcon id="notion" /></span>,
                },
                {
                  value: "webhook" as const,
                  label: "Webhook",
                  icon: <Webhook size={14} />,
                },
              ].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </fieldset>
          {triggerType === "webpage" && (
            <fieldset className="routine-fieldset page-watch-fields">
              <legend>Which page should we watch?</legend>
              <label className="field"><span>Public page or feed address</span>
                <input type="url" value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://example.com/changelog" required maxLength={2048} />
              </label>
              <label className="field"><span>Page section (optional)</span>
                <input value={pageSelector} onChange={(e) => setPageSelector(e.target.value)} placeholder="#updates, .news, or main" maxLength={100} />
              </label>
              <p className="page-watch-help">We save the first version, then wake your teammate only when readable text changes. Public HTTPS pages and RSS/Atom feeds only—no login, redirects or query strings. JavaScript and images aren't checked.</p>
            </fieldset>
          )}
          {triggerType === "schedule" && <Suspense fallback={<p>Loading schedule…</p>}><CalendarScheduleFields value={calendarSchedule} onChange={setCalendarSchedule} intervalMinutes={intervalMinutes} routineId={editing?.id} enabled={enabled} onValid={setScheduleValid} onLabel={setScheduleDescription} /></Suspense>}
          {(triggerType === "webpage" || (triggerType === "schedule" && calendarSchedule.kind === "interval")) && (
            <fieldset className="routine-fieldset">
              <legend>How often?</legend>
              <div className="schedule-presets">
                {[
                  triggerType === "webpage" ? { value: "15", label: "15 min" } : { value: "5", label: "5 min" },
                  { value: "60", label: "Hourly" },
                  { value: "1440", label: "Daily" },
                  { value: "10080", label: "Weekly" },
                  { value: "custom", label: "Custom" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={schedule === item.value ? "selected" : ""}
                    onClick={() => setSchedule(item.value as typeof schedule)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {schedule === "custom" && (
                <div className="custom-schedule">
                  <input
                    type="number"
                    min={customUnit === "minutes" ? (triggerType === "webpage" ? 15 : 5) : 1}
                    max={
                      customUnit === "days"
                        ? 30
                        : customUnit === "hours"
                          ? 720
                          : 43200
                    }
                    value={customAmount}
                    onChange={(e) => setCustomAmount(Number(e.target.value))}
                    aria-label="Repeat interval"
                  />
                  <select
                    value={customUnit}
                    onChange={(e) =>
                      setCustomUnit(e.target.value as typeof customUnit)
                    }
                    aria-label="Repeat unit"
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              )}
              {!intervalValid && (
                <small className="routine-error">
                  Choose a repeat time from {triggerType === "webpage" ? 15 : 5} minutes to 30 days.
                </small>
              )}
            </fieldset>
          )}
          {triggerType === "github" && (
            <fieldset className="routine-fieldset">
              <legend>Which GitHub activity?</legend>
              <div className="trigger-fields">
                <label>
                  <span>Event</span>
                  <select
                    value={githubEvent}
                    onChange={(e) => setGithubEvent(e.target.value)}
                  >
                    <option value="issues">Issues</option>
                    <option value="pull_request">Pull requests</option>
                    <option value="push">Pushes</option>
                    <option value="release">Releases</option>
                  </select>
                </label>
                <label>
                  <span>Action</span>
                  <input
                    value={githubAction}
                    onChange={(e) => setGithubAction(e.target.value)}
                    placeholder="opened (optional)"
                  />
                </label>
                <label className="wide">
                  <span>Repository</span>
                  <input
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                    placeholder="owner/repository (optional)"
                  />
                </label>
              </div>
            </fieldset>
          )}
          {triggerType === "webhook" && (
            <fieldset className="routine-fieldset">
              <legend>Which signed event?</legend>
              <div className="trigger-fields one">
                <label>
                  <span>Event name</span>
                  <input
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="invoice.paid (optional)"
                  />
                </label>
              </div>
              <small className="routine-help">
                You’ll get a private signing secret once. Repeated event IDs
                never start the job twice.
              </small>
            </fieldset>
          )}
          {triggerType === "calendar" && (
            <fieldset className="routine-fieldset">
              <legend>Which Calendar events?</legend>
              <div className="trigger-fields">
                <label>
                  <span>Minutes before</span>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={minutesBefore}
                    onChange={(e) => setMinutesBefore(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Title contains</span>
                  <input
                    value={titleContains}
                    onChange={(e) => setTitleContains(e.target.value)}
                    placeholder="Launch review (optional)"
                  />
                </label>
              </div>
              <small className="routine-help">
                Uses this teammate’s existing Google Calendar read permission.
              </small>
            </fieldset>
          )}
          {triggerType === "todoist" && (
            <fieldset className="routine-fieldset">
              <legend>Which Todoist changes?</legend>
              <div className="trigger-fields one">
                <label>
                  <span>Task activity</span>
                  <select value={todoistEvent} onChange={(event) => setTodoistEvent(event.target.value as typeof todoistEvent)}>
                    <option value="any">Any task change</option>
                    <option value="added">Task added</option>
                    <option value="updated">Task updated</option>
                    <option value="completed">Task completed</option>
                  </select>
                </label>
              </div>
              <small className="routine-help">OpenBot checks Todoist in the background and keeps an event receipt, so a repeated delivery cannot start duplicate work.</small>
            </fieldset>
          )}
          {triggerType === "dropbox" && (
            <fieldset className="routine-fieldset">
              <legend>Which Dropbox files?</legend>
              <div className="trigger-fields one">
                <label>
                  <span>Folder path</span>
                  <input value={dropboxPath} onChange={(event) => setDropboxPath(event.target.value)} placeholder="/Projects/Launch (optional)" />
                </label>
              </div>
              <small className="routine-help">OpenBot starts from a fresh Dropbox cursor, so turning this on never floods the studio with old files.</small>
            </fieldset>
          )}
          {triggerType === "slack" && (
            <fieldset className="routine-fieldset">
              <legend>Which Slack activity?</legend>
              <div className="trigger-fields">
                <label>
                  <span>Activity</span>
                  <select value={slackEvent} onChange={(event) => setSlackEvent(event.target.value as typeof slackEvent)}>
                    <option value="mention">Someone mentions the app</option>
                    <option value="message">A subscribed message arrives</option>
                    <option value="reaction">A reaction changes</option>
                    <option value="any">Any subscribed activity</option>
                  </select>
                </label>
                <label>
                  <span>Channel ID</span>
                  <input value={slackChannel} onChange={(event) => setSlackChannel(event.target.value)} placeholder="C012345 (optional)" />
                </label>
              </div>
              <small className="routine-help">Slack verifies every delivery. Retries share the same receipt and cannot start duplicate work.</small>
            </fieldset>
          )}
          {triggerType === "notion" && (
            <fieldset className="routine-fieldset">
              <legend>Which Notion changes?</legend>
              <div className="trigger-fields">
                <label>
                  <span>Change</span>
                  <select value={notionEvent} onChange={(event) => setNotionEvent(event.target.value as typeof notionEvent)}>
                    <option value="page_updated">A page changes</option>
                    <option value="page_created">A page is created</option>
                    <option value="comment">A comment changes</option>
                    <option value="database">A database changes</option>
                    <option value="any">Any subscribed change</option>
                  </select>
                </label>
                <label>
                  <span>Page or database ID</span>
                  <input value={notionEntityId} onChange={(event) => setNotionEntityId(event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <small className="routine-help">The webhook is only a signal. Your teammate still needs explicit Notion read access to fetch current content.</small>
            </fieldset>
          )}
          <fieldset className="routine-fieldset">
            <legend>Who should do it?</legend>
            <div className="routine-teammates">
              {bots.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  className={bot.id === selectedBot?.id ? "selected" : ""}
                  onClick={() => setBotId(bot.id)}
                  style={{ "--bot-color": bot.color } as React.CSSProperties}
                >
                  <Mascot bot={bot} size="small" />
                  <span>
                    <b>{bot.name}</b>
                    <small>{bot.role}</small>
                  </span>
                  {bot.id === selectedBot?.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>What should happen?</span>
            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Read the event, check the related context and post a concise next action…"
              required
            />
          </label>
          <label className="routine-start">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>
              <b>Turn it on</b>
              <small>
                {enabled
                  ? triggerType === "schedule"
                    ? "See the checked run times above"
                    : triggerType === "webpage" ? "First check saves a baseline; later changes start the job" : "It will wait safely for a matching event"
                  : "Keep it as a paused draft"}
              </small>
            </span>
            <i>
              <Check size={12} />
            </i>
          </label>
          <div className="routine-preview">
            {triggerType === "schedule" ? (
              <Clock3 size={15} />
            ) : triggerType === "calendar" ? (
              <CalendarDays size={15} />
            ) : triggerType === "todoist" ? (
              <span className="trigger-connector-icon"><ConnectorIcon id="todoist" /></span>
            ) : triggerType === "dropbox" ? (
              <span className="trigger-connector-icon"><ConnectorIcon id="dropbox" /></span>
            ) : triggerType === "slack" ? (
              <span className="trigger-connector-icon"><ConnectorIcon id="slack" /></span>
            ) : triggerType === "notion" ? (
              <span className="trigger-connector-icon"><ConnectorIcon id="notion" /></span>
            ) : (
              <Webhook size={15} />
            )}
            <p>
              <strong>{selectedBot?.name || "Your teammate"}</strong> will run “
              {name.trim() || "your automation"}” when{" "}
              {triggerType === "webpage" ? "the saved page content changes" : triggerType === "schedule"
                ? (scheduleDescription || "the schedule above is ready")
                : triggerType === "calendar"
                  ? `a matching event is ${minutesBefore} minutes away`
                  : triggerType === "todoist"
                    ? todoistEvent === "any"
                      ? "anything changes in Todoist"
                      : todoistEvent === "added"
                        ? "a task is added to Todoist"
                        : todoistEvent === "updated"
                          ? "a task is updated in Todoist"
                          : "a task is completed in Todoist"
                    : triggerType === "dropbox"
                      ? `a file changes${dropboxPath ? ` inside ${dropboxPath}` : " in Dropbox"}`
                    : triggerType === "slack"
                      ? `${slackEvent === "any" ? "subscribed activity" : `a ${slackEvent}`} arrives${slackChannel ? ` in ${slackChannel}` : " from Slack"}`
                    : triggerType === "notion"
                      ? `${notionEvent === "any" ? "a subscribed change" : notionEvent.replace("_", " ")} arrives from Notion`
                  : triggerType === "github"
                    ? "a signed GitHub event matches these filters"
                    : "a correctly signed webhook arrives"}
              . Test runs use the same real permissions.
            </p>
          </div>
          <div className="form-actions">
            <button type="button" className="button-secondary" onClick={reset}>
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={!intervalValid || (triggerType === "schedule" && !scheduleValid) || saving}
            >
              {saving ? (
                <>
                  <LoaderCircle className="spinner" size={15} /> Saving…
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Create automation"
              )}
            </button>
          </div>
        </form>
      ) : (
        <button className="add-routine" onClick={startCreate}>
          <Plus size={17} /> Add an automation
        </button>
      )}
    </div>
  );
}

export function ComputerPanel({ bot, onTeach }: { bot: Bot; onTeach: () => void }) {
  const [status, setStatus] = useState<ComputerStatus | null>(null),
    [url, setUrl] = useState("https://example.com"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(
    () =>
      api<ComputerStatus>(`/api/bots/${bot.id}/computer`)
        .then(setStatus)
        .catch((e) => setError(e.message)),
    [bot.id],
  );
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3500);
    return () => clearInterval(timer);
  }, [refresh]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(
        await api(`/api/bots/${bot.id}/computer/start`, { method: "POST" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/bots/${bot.id}/browser/open`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="computer-panel">
      <div className="computer-status-row">
        <div>
          <span
            className={`status-light ${status?.container === "ready" ? "on" : ""}`}
          />
          <strong>Private computer</strong>
          <small>{status?.container || "checking"}</small>
        </div>
        <div>
          <span
            className={`status-light ${status?.browser === "ready" ? "on" : ""}`}
          />
          <strong>Private browser</strong>
          <small>{status?.browser || "checking"}</small>
        </div>
      </div>
      <div className="computer-screen">
        {status?.screenshot ? (
          <img src={status.screenshot} alt={`${bot.name}'s current browser`} />
        ) : (
          <div className="screen-empty">
            <Mascot bot={bot} size="large" />
            <h3>{bot.name}'s own little computer</h3>
            <p>Browser history, sign-ins and files stay with this teammate.</p>
          </div>
        )}
        <div className="screen-bar">
          <span>
            <i />
            {status?.title || "No page open"}
          </span>
          <button onClick={() => void refresh()} aria-label="Refresh preview">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <form className="browser-address" onSubmit={open}>
        <Globe2 size={16} />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          aria-label="Web address"
        />
        <button disabled={busy} aria-label="Open web page">
          {busy ? (
            <LoaderCircle className="spinner" size={16} />
          ) : (
            <ArrowUp size={16} />
          )}
        </button>
      </form>
      {error && <p className="panel-error">{error}</p>}
      <div className="computer-actions">
        <button
          className="button-secondary"
          onClick={() => void start()}
          disabled={busy}
        >
          <Power size={15} /> Start computer
        </button>
        <button className="button-primary" onClick={onTeach}>
          <WandSparkles size={15} /> Teach a workflow
        </button>
      </div>
      <div className="security-footnote">
        <ShieldCheck size={16} />
        <p>
          <strong>Safer by design.</strong> Terminal work runs with dropped
          privileges and resource limits. Browser actions use this bot's
          isolated profile. Destructive and external actions stop for approval.
        </p>
      </div>
    </div>
  );
}

export function TeachPanel({
  bot,
  bots,
  onBotChange,
  onUse,
  onNotice,
  hideOwnerSwitcher = false,
}: {
  bot: Bot;
  bots: Bot[];
  onBotChange: (botId: string) => void;
  onUse: (workflow: TaughtWorkflow) => Promise<void>;
  onNotice: (message: string) => void;
  hideOwnerSwitcher?: boolean;
}) {
  const [name, setName] = useState(""),
    [startUrl, setStartUrl] = useState("https://example.com"),
    [recording, setRecording] = useState(false),
    [stepCount, setStepCount] = useState(0),
    [allWorkflows, setAllWorkflows] = useState<TaughtWorkflow[]>([]),
    [templates, setTemplates] = useState<SkillTemplate[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editingWorkflow, setEditingWorkflow] = useState<TaughtWorkflow | null>(
      null,
    ),
    [editName, setEditName] = useState(""),
    [editDescription, setEditDescription] = useState(""),
    [editInstructions, setEditInstructions] = useState(""),
    [editUrl, setEditUrl] = useState(""),
    [historyWorkflow, setHistoryWorkflow] = useState<TaughtWorkflow | null>(null),
    [versions, setVersions] = useState<SkillVersion[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const [checkingWorkflow, setCheckingWorkflow] = useState<TaughtWorkflow | null>(null);
  const workflows = allWorkflows.filter((workflow) => workflow.botId === bot.id);
  const studioSkills = allWorkflows.filter((workflow) => workflow.botId !== bot.id);
  const refresh = useCallback(async () => {
    const [status, list, starters] = await Promise.all([
      api<{ recording: boolean; stepCount: number }>(
        `/api/bots/${bot.id}/teach`,
      ),
      api<TaughtWorkflow[]>("/api/workflows"),
      api<SkillTemplate[]>("/api/skill-templates"),
    ]);
    setRecording(status.recording);
    setStepCount(status.stepCount);
    setAllWorkflows(list);
    setTemplates(starters);
  }, [bot.id]);
  useEffect(() => {
    let alive = true;
    const connectionNotice = "Reconnecting to your Mac. Your saved skills are kept; no check will be started again automatically.";
    const reload = async () => {
      try { await refresh(); if (alive) setError((current) => current === connectionNotice ? "" : current); }
      catch { if (alive) setError(connectionNotice); }
    };
    void reload();
    const timer = setInterval(() => void reload(), 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    setEditingWorkflow(null);
    setHistoryWorkflow(null);
    setVersions([]);
    setError("");
  }, [bot.id]);
  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/bots/${bot.id}/teach/start`, {
        method: "POST",
        body: JSON.stringify({ name, startUrl }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await api(`/api/bots/${bot.id}/teach/stop`, { method: "POST" });
      await refresh();
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const edit = (workflow: TaughtWorkflow) => {
    setEditingWorkflow(workflow);
    setEditName(workflow.name);
    setEditDescription(workflow.description);
    setEditInstructions(workflow.instructions);
    setEditUrl(workflow.startUrl);
    setError("");
  };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingWorkflow) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/workflows/${editingWorkflow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          instructions: editInstructions,
          startUrl: editUrl,
        }),
      });
      setEditingWorkflow(null);
      await refresh();
      onNotice("Skill updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (workflow: TaughtWorkflow) => {
    if (
      !window.confirm(
        `Delete /${workflow.skillSlug}? This removes the learned steps from ${bot.name}.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/workflows/${workflow.id}`, { method: "DELETE" });
      if (editingWorkflow?.id === workflow.id) setEditingWorkflow(null);
      await refresh();
      onNotice("Skill deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const download = async (workflow: TaughtWorkflow) => {
    setBusy(true);
    setError("");
    try {
      const portable = await api<unknown>(`/api/workflows/${workflow.id}/export`);
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(portable, null, 2)}\n`], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${workflow.skillSlug}.openbot-skill.json`;
      link.click();
      URL.revokeObjectURL(url);
      onNotice("Safe skill file exported");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const importSkill = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 256_000)
        throw new Error("That skill file is too large. Choose one under 256 KB.");
      const portable = JSON.parse(await file.text()) as unknown;
      await api("/api/skills/import", {
        method: "POST",
        body: JSON.stringify({ botId: bot.id, package: portable }),
      });
      await refresh();
      onNotice(`Skill added to ${bot.name}`);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "That file is not a valid OpenBot skill."
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      if (importInput.current) importInput.current.value = "";
      setBusy(false);
    }
  };
  const installTemplate = async (template: SkillTemplate) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/skill-templates/${template.id}/install`, {
        method: "POST",
        body: JSON.stringify({ botId: bot.id }),
      });
      await refresh();
      onNotice(`${template.name} added to ${bot.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const assign = async (workflow: TaughtWorkflow) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/workflows/${workflow.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ botId: bot.id }),
      });
      await refresh();
      onNotice(`${workflow.name} added to ${bot.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const openHistory = async (workflow: TaughtWorkflow) => {
    setHistoryWorkflow(workflow);
    setVersions([]);
    setError("");
    try {
      setVersions(
        await api<SkillVersion[]>(`/api/workflows/${workflow.id}/versions`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const rollback = async (workflow: TaughtWorkflow, version: number) => {
    if (
      !window.confirm(
        `Restore version ${version}? OpenBot will keep the current version in history too.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const restored = await api<TaughtWorkflow>(
        `/api/workflows/${workflow.id}/rollback`,
        { method: "POST", body: JSON.stringify({ version }) },
      );
      await refresh();
      await openHistory(restored);
      onNotice(`Version ${version} restored as version ${restored.version}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="teach-panel skill-library">
      {!hideOwnerSwitcher && <div className="skill-owner-switcher">
        <span>
          <Mascot bot={bot} size="medium" />
          <span>
            <strong>{bot.name}'s library</strong>
            <small>Skills stay owned by the teammate you choose</small>
          </span>
        </span>
        <label>
          <span>Teammate</span>
          <select value={bot.id} onChange={(event) => onBotChange(event.target.value)}>
            {bots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.role}
              </option>
            ))}
          </select>
        </label>
      </div>}
      <div className={`teach-hero ${recording ? "recording" : ""}`}>
        <div className="teach-visual">
          <Mascot
            bot={{ ...bot, status: recording ? "working" : "ready" }}
            size="large"
          />
        </div>
        <h3>
          {recording
            ? `${bot.name} is watching the steps`
            : `Show ${bot.name} how you do it`}
        </h3>
        <p>
          {recording
            ? `${stepCount} meaningful action${stepCount === 1 ? "" : "s"} captured. Secrets are replaced with placeholders.`
            : "Demonstrate a browser task, install a safe starter, or bring in a reviewed OpenBot skill file."}
        </p>
      </div>
      <ol className="teaching-journey" aria-label="How teaching works">
        <li><span>1</span><div><strong>Show</strong><small>Demonstrate your task in the browser.</small></div></li>
        <li><span>2</span><div><strong>Review</strong><small>Keep the steps and details you want.</small></div></li>
        <li><span>3</span><div><strong>Check</strong><small>Try two different examples before scheduling.</small></div></li>
      </ol>
      {recording ? (
        <button
          className="button-primary button-wide stop-teaching"
          onClick={() => void stop()}
          disabled={busy}
        >
          <Square size={14} fill="currentColor" /> Stop and save workflow
        </button>
      ) : (
        <form className="teach-form" onSubmit={start}>
          <label className="field">
            <span>What should this be called?</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Update the weekly tracker"
              required
            />
          </label>
          <label className="field">
            <span>Starting web page</span>
            <input
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              required
            />
          </label>
          <button className="button-primary button-wide" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spinner" size={16} />
            ) : (
              <Eye size={16} />
            )}{" "}
            Open teaching browser
          </button>
        </form>
      )}
      {error && <p className="panel-error">{error}</p>}
      <div className="skill-portability-bar">
        <input
          ref={importInput}
          type="file"
          className="visually-hidden"
          accept=".json,.openbot-skill.json,application/json"
          onChange={(event) => void importSkill(event.target.files?.[0])}
        />
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => importInput.current?.click()}
        >
          <ArrowUp size={15} /> Import reviewed skill
        </button>
        <span>
          <ShieldCheck size={15} /> Integrity checked · secrets blocked · rollback ready
        </span>
      </div>
      <div className="privacy-note">
        <KeyRound size={16} />
        <p>Passwords are replaced with placeholders. Imported files are rejected if they contain credentials, private keys, or changed integrity data.</p>
      </div>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Useful starters</h3>
            <p>Small, editable foundations—not opaque automations</p>
          </div>
        </div>
        <div className="skill-template-grid">
          {templates.map((template) => (
            <article key={template.id}>
              <span className="skill-template-icon"><WandSparkles size={17} /></span>
              <span className="skill-category">{template.category}</span>
              <h4>{template.name}</h4>
              <p>{template.description}</p>
              <button disabled={busy} onClick={() => void installTemplate(template)}>
                <Plus size={13} /> Add to {bot.name}
              </button>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Learned skills</h3>
            <p>Type / in chat, edit safely, or return to an earlier version</p>
          </div>
        </div>
        {workflows.length ? (
          <div className="workflow-list">
            {workflows.map((workflow) => (
              <div key={workflow.id}>
                <WandSparkles size={18} />
                <span>
                  <strong>/{workflow.skillSlug}</strong>
                  <small>
                    {workflow.name} · v{workflow.version} · {workflow.stepCount ? `${workflow.stepCount} recorded steps` : "Reusable instructions"} ·{" "}
                    {workflow.startUrl ? new URL(workflow.startUrl).hostname : "No starting website needed"}
                  </small>
                  <em>{workflow.description}</em>
                </span>
                <div className="workflow-actions">
                  <button onClick={() => void onUse(workflow)}>
                    <Play size={12} /> Use
                  </button>
                  <button onClick={() => edit(workflow)}>
                    <Settings2 size={12} /> Edit
                  </button>
                  <button onClick={() => setCheckingWorkflow(checkingWorkflow?.id === workflow.id ? null : workflow)}>
                    <Check size={12} /> Checks
                  </button>
                  <button onClick={() => void openHistory(workflow)}>
                    <RotateCcw size={12} /> History
                  </button>
                  <button onClick={() => void download(workflow)}>
                    <Download size={12} /> Export
                  </button>
                  <button
                    className="danger"
                    onClick={() => void remove(workflow)}
                    aria-label={`Delete ${workflow.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-panel compact">
            <PanelTop size={28} />
            <h3>Nothing taught yet</h3>
            <p>Your first demonstrated workflow will appear here.</p>
          </div>
        )}
      </section>
      {checkingWorkflow?.botId === bot.id && <WorkflowChecksPanel key={checkingWorkflow.id} workflow={workflows.find((w) => w.id === checkingWorkflow.id) || checkingWorkflow} />}
      {studioSkills.length > 0 && (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>From your studio</h3>
              <p>Copy a teammate's setup without copying their private history</p>
            </div>
          </div>
          <div className="studio-skill-list">
            {studioSkills.map((workflow) => (
              <article key={workflow.id}>
                <span className="skill-share-mark"><Copy size={15} /></span>
                <span>
                  <strong>{workflow.name}</strong>
                  <small>/{workflow.skillSlug} · {workflow.botName} · v{workflow.version}</small>
                  <p>{workflow.description}</p>
                </span>
                <button disabled={busy} onClick={() => void assign(workflow)}>
                  Add to {bot.name}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {editingWorkflow && (
        <form className="workflow-edit-form" onSubmit={saveEdit}>
          <header>
            <span>
              <Settings2 size={15} />
            </span>
            <div>
              <strong>Edit /{editingWorkflow.skillSlug}</strong>
              <small>Changing the name also updates its slash command.</small>
            </div>
          </header>
          <label className="field">
            <span>Skill name</span>
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>What it is for</span>
            <input
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              maxLength={300}
              required
            />
          </label>
          <label className="field">
            <span>How it should work</span>
            <textarea
              value={editInstructions}
              onChange={(event) => setEditInstructions(event.target.value)}
              maxLength={5000}
              rows={5}
              required
            />
          </label>
          <label className="field">
            <span>Starting web page (optional)</span>
            <input
              value={editUrl}
              onChange={(event) => setEditUrl(event.target.value)}
              type="url"
              placeholder="Leave empty for file or project work"
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setEditingWorkflow(null)}
            >
              Cancel
            </button>
            <button className="button-primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spinner" size={14} />
              ) : (
                <Check size={14} />
              )}{" "}
              Save skill
            </button>
          </div>
        </form>
      )}
      {historyWorkflow && (
        <section className="skill-history-panel">
          <header>
            <span><RotateCcw size={16} /></span>
            <div>
              <strong>{historyWorkflow.name} history</strong>
              <small>Restoring creates a new version, so nothing is lost.</small>
            </div>
            <button className="icon-button" onClick={() => setHistoryWorkflow(null)} aria-label="Close skill history"><X size={15} /></button>
          </header>
          <div className="skill-version-list">
            {versions.map((version) => (
              <article key={version.id}>
                <b>v{version.version}</b>
                <span>
                  <strong>{version.name}</strong>
                  <small>{version.stepCount} steps · {relativeTime(version.createdAt)}</small>
                  <p>{version.description}</p>
                </span>
                {version.version === historyWorkflow.version ? (
                  <em>Current</em>
                ) : (
                  <button disabled={busy} onClick={() => void rollback(historyWorkflow, version.version)}>Restore</button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function ArtifactsPanel({ onOpenThread }: { onOpenThread: (id: string) => void }) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]),
    [selected, setSelected] = useState<ArtifactSummary | null>(null),
    [revisions, setRevisions] = useState<Attachment[]>([]),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api<ArtifactSummary[]>("/api/artifacts")
      .then(setArtifacts)
      .finally(() => setLoading(false));
  }, []);
  const open = async (artifact: ArtifactSummary) => {
    setSelected(artifact);
    setRevisions(await api<Attachment[]>(`/api/artifacts/${artifact.id}/revisions`));
  };
  if (selected)
    return (
      <div className="file-preview">
        <button className="back-button" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} /> All artifacts
        </button>
        <div className="file-preview-title">
          <FileText size={18} />
          <strong>{selected.name}</strong>
        </div>
        <p className="quiet-copy">
          {selected.revisions > 1
            ? `${selected.revisions} revisions · latest from ${relativeTime(selected.createdAt)}`
            : `Delivered ${relativeTime(selected.createdAt)}`}
          {selected.botName ? ` by ${selected.botName}` : ""} in {selected.threadTitle}.
        </p>
        <div className="file-list">
          {revisions.map((revision) => (
            <article className="artifact-revision" key={revision.id}>
              <File size={18} />
              <span>
                <strong>{revision.revision > 1 ? `Revision ${revision.revision}` : "First delivery"}</strong>
                <small>{relativeTime(revision.createdAt)} · {Math.max(1, Math.round(revision.size / 1024))} KB</small>
              </span>
              <span className="artifact-revision-actions">
                {revision.previewUrl && (
                  <a href={revision.previewUrl} target="_blank" rel="noreferrer">
                    <Eye size={14} /> Preview
                  </a>
                )}
                <a href={revision.url} target="_blank" rel="noreferrer">
                  <Download size={14} /> Open
                </a>
              </span>
            </article>
          ))}
        </div>
        <button className="text-action" onClick={() => { onOpenThread(selected.threadId); setSelected(null); }}>
          Open {selected.threadTitle} <ArrowRight size={14} />
        </button>
      </div>
    );
  return (
    <div className="files-view">
      <div className="friendly-note">
        <FolderOpen size={18} />
        <p>
          <strong>Work your teammates finished.</strong>
          <br />
          Reports, briefs, notes and delivered code — newest first, with every
          revision kept.
        </p>
      </div>
      {loading ? (
        <div className="empty-panel">
          <LoaderCircle className="spinner" />
        </div>
      ) : artifacts.length ? (
        <div className="file-list">
          {artifacts.map((artifact) => (
            <button key={artifact.id} onClick={() => void open(artifact)}>
              {artifact.kind === "image" ? (
                <FileImage size={18} />
              ) : artifact.kind === "spreadsheet" ? (
                <FileSpreadsheet size={18} />
              ) : artifact.kind === "archive" ? (
                <FileArchive size={18} />
              ) : (
                <FileText size={18} />
              )}
              <span>
                <strong>{artifact.name}</strong>
                <small>
                  {artifact.botName ? `${artifact.botName} · ` : ""}
                  {artifact.threadTitle} · {relativeTime(artifact.createdAt)}
                </small>
              </span>
              {artifact.revisions > 1 && <small>v{artifact.revision}</small>}
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <div className="empty-illustration">
            <FolderOpen size={30} />
          </div>
          <h3>Nothing here yet</h3>
          <p>Ask your team for a brief, report or plan — finished work lands here.</p>
        </div>
      )}
    </div>
  );
}

const receiptStatusLabels: Record<string, string> = {
  queued: "Queued", running: "Working", awaiting_approval: "Waiting on you",
  completed: "Completed", failed: "Failed", cancelled: "Stopped", steering: "Working",
};

export function WorkReceipt({ runId }: { runId: string }) {
  const [receipt, setReceipt] = useState<RunReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setReceipt(null);
    setError(null);
    setProposal(null);
    void fetch(`/api/runs/${encodeURIComponent(runId)}/receipt`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The receipt is unavailable for this task.");
        const result = (await response.json()) as RunReceipt;
        if (!abort.signal.aborted) setReceipt(result);
      })
      .catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "The receipt is unavailable."); });
    return () => abort.abort();
  }, [runId]);
  async function propose() {
    if (proposing || proposal) return;
    setProposing(true);
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/skill-draft`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const result = await response.json() as { created?: boolean; name?: string; botName?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "The skill draft could not be saved.");
      setProposal(result.created
        ? `Saved “${result.name}” as a draft linked to this task’s receipt. Review two different test inputs in the skill’s Checks before scheduling.`
        : `This task is already saved as “${result.name}”.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The skill draft could not be saved.");
    } finally {
      setProposing(false);
    }
  }
  if (error) return <p className="work-receipt-missing">{error}</p>;
  if (!receipt) return <p className="work-receipt-missing">Assembling the receipt…</p>;
  const status = receipt.outcome === "blocked" ? "Blocked — no result" : receiptStatusLabels[receipt.status] || receipt.status;
  const duration = receipt.durationMs ? formatReceiptDuration(receipt.durationMs) : null;
  return (
    <article className="work-receipt" aria-label="Work receipt">
      <header className="work-receipt-head">
        <div className="work-receipt-title">
          <ShieldCheck size={17} aria-hidden />
          <h4>Work receipt</h4>
          <span className={`work-receipt-status is-${receipt.outcome === "blocked" ? "blocked" : receipt.status}`}>{status}</span>
          {duration && <span className="work-receipt-duration">{duration}</span>}
        </div>
        {(receipt.goal || receipt.deliverable) && (
          <p className="work-receipt-goal">
            {receipt.goal}
            {receipt.deliverable && receipt.goal && receipt.deliverable !== receipt.goal ? ` — ${receipt.deliverable}` : ""}
          </p>
        )}
        {receipt.status === "failed" && receipt.error && <p className="work-receipt-warn">{receipt.error}</p>}
      </header>

      {receipt.team.length > 1 && (
        <section className="work-receipt-team">
          <h5>Team</h5>
          {receipt.team.map((member, index) => (
            <div className="work-receipt-row" key={index}>
              <span className="work-receipt-strong">{member.botName}</span>
              <span className="work-receipt-dim">{member.role || "Teammate"}</span>
              <span className="work-receipt-dim">{member.model || "Default model"}</span>
              <span className="work-receipt-num">{member.tokens.toLocaleString()} tok</span>
              <span className={`work-receipt-status is-${member.status}`}>{receiptStatusLabels[member.status] || member.status}</span>
            </div>
          ))}
        </section>
      )}

      {receipt.checks.length > 0 && (
        <section className="work-receipt-checks">
          <h5>Checks</h5>
          {receipt.checks.map((check, index) => (
            <div className="work-receipt-row" key={index}>
              <span className={check.passed ? "work-receipt-ok" : "work-receipt-warn"}>{check.passed ? "✓" : "✕"}</span>
              <span>{check.label}</span>
              <span className={`work-receipt-source is-${check.source}`}>{check.source === "host" ? check.passed ? "Verified here" : "Host check failed" : "Teammate-reported"}</span>
            </div>
          ))}
        </section>
      )}

      {receipt.workLog.length > 0 && (
        <section className="work-receipt-log">
          <h5>Work log</h5>
          <ul>
            {receipt.workLog.slice(0, 6).map((entry, index) => (
              <li key={index}><span>{entry.label}</span>{entry.detail && <span className="work-receipt-dim">{entry.detail}</span>}</li>
            ))}
          </ul>
        </section>
      )}

      {receipt.inputs.length > 0 && (
        <section className="work-receipt-files">
          <h5>Sources kept</h5>
          {receipt.inputs.map((input, index) => (
            <span className="work-receipt-file" key={index}>
              <FileText size={14} aria-hidden />
              <span>{input.name}</span>
            </span>
          ))}
        </section>
      )}

      <section className="work-receipt-files">
        <h5>{receipt.status === "completed" && receipt.outcome !== "blocked" ? "Delivered" : "Saved (partial)"}</h5>
        {receipt.artifacts.filter((artifact) => artifact.classification !== "evidence").length > 0 ? receipt.artifacts.filter((artifact) => artifact.classification !== "evidence").map((artifact, index) => (
          <a className="work-receipt-file" key={index} href={artifact.url || "#"} target="_blank" rel="noreferrer">
            <FileText size={14} aria-hidden />
            <span>{artifact.name}</span>
            {artifact.revision > 1 && <span className="work-receipt-dim">v{artifact.revision}</span>}
          </a>
        )) : (
          <p className="work-receipt-missing">
            {receipt.status === "completed" && receipt.outcome !== "blocked"
              ? "No result files are registered for this task."
              : "No result files are registered for this task. Any sources listed above are kept; no output has been delivered."}
          </p>
        )}
      </section>

      {receipt.artifacts.some((artifact) => artifact.classification === "evidence") && (
        <section className="work-receipt-files">
          <h5>Evidence</h5>
          {receipt.artifacts.filter((artifact) => artifact.classification === "evidence").map((artifact, index) => (
            <a className="work-receipt-file" key={index} href={artifact.url || "#"} target="_blank" rel="noreferrer">
              <FileText size={14} aria-hidden />
              <span>{artifact.name}</span>
            </a>
          ))}
        </section>
      )}

      {receipt.externalActions.length > 0 && (
        <section className="work-receipt-actions">
          <h5>External actions</h5>
          {receipt.externalActions.map((action, index) => (
            <div className="work-receipt-row" key={index}>
              <span>{action.label}</span>
              <span className={`work-receipt-status is-${action.status}`}>{action.status}</span>
              {action.detail && <span className="work-receipt-dim">{action.detail}</span>}
            </div>
          ))}
        </section>
      )}

      <footer className="work-receipt-foot">
        <span><Coins size={13} aria-hidden /> {receipt.usage.tokens.toLocaleString()} tokens{receipt.usage.cost > 0 ? ` · $${receipt.usage.cost.toFixed(4)}` : ""}</span>
        <span><Users size={13} aria-hidden /> {receipt.usage.runs} {receipt.usage.runs === 1 ? "run" : "runs"}</span>
        {receipt.uncertainty.length === 0
          ? <span className="work-receipt-ok">No unresolved items recorded</span>
          : <span className="work-receipt-warn">{receipt.uncertainty.length} uncertain {receipt.uncertainty.length === 1 ? "item" : "items"} — see below</span>}
      </footer>
      {receipt.uncertainty.length > 0 && (
        <ul className="work-receipt-uncertain">
          {receipt.uncertainty.slice(0, 4).map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      )}
      {receipt.status === "completed" && (
        <div className="work-receipt-propose">
          {proposal
            ? <p role="status">{proposal}</p>
            : <button type="button" disabled={proposing} onClick={() => void propose()}>{proposing ? "Drafting…" : "Save as a skill draft"}</button>}
        </div>
      )}
    </article>
  );
}

function formatReceiptDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
