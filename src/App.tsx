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
  ArrowLeft,
  ArrowUp,
  AtSign,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
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
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  GitPullRequest,
  Globe2,
  HardDrive,
  KeyRound,
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
  Routine,
  RunnerCareStatus,
  RunnerHealth,
  Run,
  SlackMessageSummary,
  SkillTemplate,
  SkillVersion,
  StudioDraft,
  StudioSearchResult,
  TaughtWorkflow,
  Thread,
  WorkspaceFile,
} from "./shared/types";
import { mentionedBotIds, mentionSlug } from "./shared/routing";
import { presentBotMessage, signalKindLabels } from "./shared/presentation";
import { routineScheduleLabel, routineStartsInLabel } from "./shared/routines";
import { ProviderIcon } from "./ProviderIcon";
import { ConnectorIcon } from "./ConnectorIcon";

const MarkdownMessage = lazy(() =>
  import("./MarkdownMessage").then((module) => ({
    default: module.MarkdownMessage,
  })),
);

type Panel =
  | "provider"
  | "connectors"
  | "projects"
  | "bot"
  | "files"
  | "routines"
  | "control"
  | "computer"
  | "teach"
  | "remote"
  | "live"
  | "search"
  | null;
type ConnectionState = "online" | "reconnecting" | "offline";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type SpeechResultEvent = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const PANEL_VALUES: Panel[] = [
  "provider",
  "connectors",
  "projects",
  "bot",
  "files",
  "routines",
  "control",
  "computer",
  "teach",
  "remote",
  "live",
  "search",
];
function panelFromLocation(): Panel {
  const value = new URLSearchParams(window.location.search).get(
    "panel",
  ) as Panel;
  return PANEL_VALUES.includes(value) ? value : null;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
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

function pushApplicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
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
const MASCOT_KINDS: MascotKind[] = [
  "orbit",
  "nova",
  "blob",
  "sprout",
  "pebble",
  "sunny",
];
const MASCOT_COLORS = [
  "#ee8b46",
  "#6757d9",
  "#ef6a8a",
  "#27a67a",
  "#3187dc",
  "#d49b16",
];
function Mascot({
  bot,
  size = "medium",
  state,
}: {
  bot: MascotBot;
  size?: "tiny" | "small" | "medium" | "large";
  state?: BotStatus;
}) {
  const status = state || bot.status || "ready";
  const instanceId = useId();
  const motion = useMemo(
    () =>
      Array.from(`${bot.name}:${bot.mascot}:${instanceId}`).reduce(
        (sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0,
        7,
      ),
    [bot.name, bot.mascot, instanceId],
  );
  const style = {
    "--mascot-color": bot.color,
    "--blink-duration": `${4.4 + (motion % 29) / 10}s`,
    "--blink-delay": `${-((motion % 43) / 10)}s`,
    "--idle-duration": `${3.7 + (motion % 17) / 10}s`,
    "--idle-delay": `${-((motion % 31) / 10)}s`,
  } as React.CSSProperties;
  return (
    <div
      className={`mascot mascot-${size} mascot-${bot.mascot} mascot-state-${status}`}
      style={style}
      aria-label={`${bot.name} is ${status}`}
      data-mood={status}
    >
      <span className="mascot-shadow" />
      <span className="mascot-antenna">
        <i />
      </span>
      <span className="mascot-ear mascot-ear-left" />
      <span className="mascot-ear mascot-ear-right" />
      <span className="mascot-body">
        <span className="mascot-sheen" />
        <span className="mascot-face">
          <i className="mascot-eye" />
          <i className="mascot-eye" />
          <b className="mascot-mouth" />
        </span>
        <span className="mascot-cheek mascot-cheek-left" />
        <span className="mascot-cheek mascot-cheek-right" />
        <span className="mascot-mark">
          {bot.mascot === "nova"
            ? "✦"
            : bot.mascot === "sprout"
              ? "⌁"
              : bot.mascot === "sunny"
                ? "•"
                : ""}
        </span>
      </span>
      <span className="mascot-spark mascot-spark-a">✦</span>
      <span className="mascot-spark mascot-spark-b">·</span>
      <span className="mascot-presence" aria-hidden="true" />
    </div>
  );
}

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-orbit brand-orbit-a" />
      <span className="brand-orbit brand-orbit-b" />
      <span className="brand-dot" />
    </div>
  );
}

const STARTUP_MASCOTS: MascotBot[] = [
  { id: "startup-nova", name: "Nova", color: "#6757d9", mascot: "nova", status: "ready" },
  { id: "startup-pixel", name: "Pixel", color: "#ef6a8a", mascot: "blob", status: "working" },
  { id: "startup-scout", name: "Scout", color: "#27a67a", mascot: "sprout", status: "ready" },
];

function localStudioRecoveryUrl() {
  if (!["127.0.0.1", "localhost"].includes(window.location.hostname))
    return null;
  if (window.location.port !== "4310") return null;
  const url = new URL(window.location.href);
  url.port = "4311";
  return url.toString();
}

function StudioStartup({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  const recoveryUrl = localStudioRecoveryUrl();
  return (
    <main className={`splash ${error ? "splash-attention" : ""}`}>
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-stage">
        <RoomCluster bots={STARTUP_MASCOTS} hero />
        <span className="splash-spark splash-spark-one">✦</span>
        <span className="splash-spark splash-spark-two">·</span>
      </div>
      {error ? (
        <div className="splash-copy">
          <span className="splash-kicker">
            <WifiOff size={13} /> Your studio is still safe
          </span>
          <h1>The page is open, but your studio isn’t answering.</h1>
          <p>
            Make sure the Mac or private host running OpenBot is online. We’ll
            keep trying in the background.
          </p>
          <div className="splash-actions">
            <button className="button-primary" onClick={onRetry}>
              <RefreshCw size={15} /> Try again
            </button>
            {recoveryUrl && (
              <a className="button-secondary" href={recoveryUrl}>
                Open the running studio <ArrowUp size={14} />
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="splash-copy splash-copy-loading">
          <span className="splash-kicker">
            <span className="splash-live-dot" /> Private studio
          </span>
          <h1>Waking up your teammates…</h1>
          <p>Bringing back your conversations, tools and ongoing work.</p>
          <LoaderCircle className="spinner" />
        </div>
      )}
    </main>
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

function Sidebar({
  state,
  provider,
  connectors,
  activeThreadId,
  onSelectThread,
  onCreateBot,
  onOpenPanel,
  onOpenSearch,
  open,
  onClose,
}: {
  state: AppState;
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onCreateBot: () => void;
  provider: ProviderStatus | null;
  connectors: ConnectorStatus | null;
  onOpenPanel: (panel: Panel) => void;
  onOpenSearch: (query: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const threadFor = (bot: Bot) =>
    state.threads.find((thread) => thread.id === bot.threadId);
  const bots = state.bots.filter(
    (bot) =>
      !threadFor(bot)?.hidden &&
      (!normalizedQuery ||
        `${bot.name} ${bot.role}`.toLowerCase().includes(normalizedQuery)),
  );
  const pinned = bots.filter((bot) => threadFor(bot)?.pinned);
  const unpinned = bots.filter((bot) => !threadFor(bot)?.pinned);
  const sectionNames = [
    ...new Set(unpinned.map((bot) => threadFor(bot)?.section || "Teammates")),
  ];
  const groups = [
    ...(pinned.length ? [{ name: "Pinned", bots: pinned }] : []),
    ...sectionNames.map((name) => ({
      name,
      bots: unpinned.filter(
        (bot) => (threadFor(bot)?.section || "Teammates") === name,
      ),
    })),
  ];
  const mainBot = state.bots[0],
    mainConnection = provider?.instances.find(
      (instance) => instance.id === mainBot?.providerInstanceId,
    );
  const connectedApps =
    connectors?.catalog.filter((item) => item.connected).length || 0;
  const attentionCount =
    state.approvals.length +
    state.automationAlerts.length +
    state.studioRuns.filter((run) => run.status === "failed").length;
  return (
    <>
      {open && (
        <button
          className="mobile-scrim"
          aria-label="Close menu"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-lockup">
            <Logo />
            <span>OpenBot</span>
            <small>{state.runner.deployment?.mode === "private_runner" ? "private" : "local"}</small>
          </div>
          <button className="icon-button mobile-only" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form
          className="search-box"
          onSubmit={(event) => {
            event.preventDefault();
            onOpenSearch(query);
          }}
        >
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search OpenBot"
            aria-label="Search teammates or all studio work"
          />
          <button type="submit" title="Search everything">
            ⌘K
          </button>
        </form>
        {normalizedQuery.length >= 2 && (
          <button
            className="search-everything"
            onClick={() => onOpenSearch(query)}
          >
            <Search size={13} /> Search all messages, files and work
          </button>
        )}
        <nav className="sidebar-scroll" aria-label="Conversations">
          <p className="eyebrow">Together</p>
          <button
            className={`nav-row room-row ${activeThreadId === "team-room" ? "active" : ""}`}
            onClick={() => onSelectThread("team-room")}
          >
            <RoomCluster bots={state.bots} />
            <div className="nav-copy">
              <strong>The studio</strong>
              <span>
                {state.usage.activeRuns
                  ? `${state.usage.activeRuns} things in motion`
                  : "Everyone in one room"}
              </span>
            </div>
          </button>
          <div className="section-label-row">
            <p className="eyebrow">Your teammates</p>
            <button
              className="mini-add"
              onClick={onCreateBot}
              aria-label="Create a teammate"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="bot-list">
            {groups.map((group) => (
              <section className="sidebar-bot-section" key={group.name}>
                <p>{group.name}</p>
                {group.bots.map((bot) => (
                  <button
                    key={bot.id}
                    className={`nav-row ${activeThreadId === bot.threadId ? "active" : ""}`}
                    onClick={() => onSelectThread(bot.threadId)}
                  >
                    <div className="avatar-wrap">
                      <Mascot bot={bot} size="small" />
                      <span className={`presence presence-${bot.status}`} />
                    </div>
                    <div className="nav-copy">
                      <strong>{bot.name}</strong>
                      <span>
                        {bot.status === "working"
                          ? "Working on it…"
                          : bot.status === "waiting"
                            ? "Waiting…"
                            : bot.status === "failed"
                              ? "Needs a hand"
                              : bot.role}
                      </span>
                    </div>
                    {threadFor(bot)?.pinned && (
                      <Pin className="nav-pin" size={11} fill="currentColor" />
                    )}
                    <time>{relativeTime(bot.lastActiveAt)}</time>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <button className="live-pill" onClick={() => onOpenPanel("live")}>
            <span className="live-pill-icon">
              <MonitorPlay size={17} />
            </span>
            <span>
              <strong>Live Studio</strong>
              <small>
                {state.usage.activeRuns
                  ? `${state.usage.activeRuns} teammate${state.usage.activeRuns === 1 ? "" : "s"} working`
                  : "Watch the team work"}
              </small>
            </span>
            {attentionCount > 0 && <b>{attentionCount}</b>}
          </button>
          <button
            className="control-pill"
            onClick={() => onOpenPanel("control")}
          >
            <span className="control-icon">
              <Gauge size={16} />
            </span>
            <span>
              <strong>Control center</strong>
              <small>
                {compactNumber(state.usage.totalTokens)} tokens this week
              </small>
            </span>
            {state.approvals.length > 0 && <b>{state.approvals.length}</b>}
          </button>
          <button
            className="apps-pill"
            onClick={() => onOpenPanel("connectors")}
          >
            <span className="apps-icon">
              <ConnectorIcon
                id={
                  connectors?.slack.connected
                    ? "slack"
                    : connectors?.notion.connected
                      ? "notion"
                      : "gmail"
                }
              />
            </span>
            <span>
              <strong>Apps & tools</strong>
              <small>
                {connectedApps
                  ? `${connectedApps} app${connectedApps === 1 ? "" : "s"} ready`
                  : "Connect your work"}
              </small>
            </span>
            <i className={connectedApps ? "ready" : ""} />
          </button>
          <button
            className="provider-pill"
            onClick={() => onOpenPanel("provider")}
          >
            <span
              className={`provider-spark provider-brand-${mainConnection?.provider || "opencode"}`}
            >
              <ProviderIcon id={mainConnection?.provider || "opencode"} />
            </span>
            <span>
              <strong>
                {mainBot ? shortModel(mainBot.model) : "AI connections"}
              </strong>
              <small>{mainConnection?.name || "Choose a connection"}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

function ConversationHeader({
  threadTitle,
  activeBot,
  roomBots,
  runner,
  onMenu,
  onOpenPanel,
  connection = "online",
}: {
  threadTitle: string;
  activeBot: Bot | null;
  roomBots: Bot[];
  runner: RunnerHealth;
  onMenu: () => void;
  onOpenPanel: (panel: Panel) => void;
  connection?: ConnectionState;
}) {
  const privateRunner = runner.deployment?.mode === "private_runner";
  return (
    <header className="conversation-header">
      <button
        className="icon-button mobile-only"
        onClick={onMenu}
        aria-label="Open conversations"
      >
        <Menu size={20} />
      </button>
      <button
        className="conversation-identity"
        onClick={() => onOpenPanel(activeBot ? "bot" : "control")}
      >
        {activeBot ? (
          <Mascot bot={activeBot} size="medium" />
        ) : (
          <RoomCluster bots={roomBots} large />
        )}
        <div>
          <h1>{threadTitle}</h1>
          <p>
            <i className={`header-live-dot header-live-${connection}`} />
            {connection === "online"
              ? privateRunner ? "Live from your private home" : "Live on your Mac"
              : connection === "reconnecting"
                ? privateRunner ? "Reconnecting to your private home…" : "Syncing with your Mac…"
                : privateRunner ? "Your private home is offline" : "Your Mac is offline"}
          </p>
        </div>
        <ChevronDown size={15} />
      </button>
      <div className="header-actions">
        <span
          className={`connection-indicator connection-${connection}`}
          title={
            connection === "online"
              ? "OpenBot is connected"
              : connection === "reconnecting"
                ? "Reconnecting"
                : "Offline"
          }
        >
          <i />
          {connection === "online"
            ? "Live"
            : connection === "reconnecting"
              ? "Reconnecting"
              : "Offline"}
        </span>
        <button
          className="icon-button header-search"
          onClick={() => onOpenPanel("search")}
          aria-label="Search all studio work"
        >
          <Search size={18} />
        </button>
        <button
          className="icon-button header-live-studio"
          onClick={() => onOpenPanel("live")}
          aria-label="Open Live Studio"
        >
          <PanelTop size={19} />
        </button>
        {activeBot && (
          <button
            className="icon-button"
            onClick={() => onOpenPanel("computer")}
            aria-label="Open computer"
          >
            <MonitorPlay size={19} />
          </button>
        )}
        {activeBot && (
          <button
            className="icon-button header-files"
            onClick={() => onOpenPanel("files")}
            aria-label="Open files"
          >
            <FolderOpen size={19} />
          </button>
        )}
        <button
          className="icon-button header-projects"
          onClick={() => onOpenPanel("projects")}
          aria-label="Open code projects"
        >
          <Code2 size={19} />
        </button>
        <button
          className="icon-button"
          onClick={() => onOpenPanel("routines")}
          aria-label="Open automations"
        >
          <Workflow size={19} />
        </button>
        <button
          className="icon-button"
          onClick={() => onOpenPanel(activeBot ? "bot" : "control")}
          aria-label="More settings"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>
    </header>
  );
}

function MessageText({
  body,
  attachments = [],
}: {
  body: string;
  attachments?: Attachment[];
}) {
  return (
    <div className="message-content">
      <Suspense fallback={<p>{body}</p>}>
        <MarkdownMessage body={body} attachments={attachments} />
      </Suspense>
    </div>
  );
}

function fileSize(bytes: number) {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.ceil(bytes / 1_000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function attachmentKindLabel(attachment: Attachment) {
  const labels: Record<Attachment["kind"], string> = {
    text: "Text",
    document: "Document",
    spreadsheet: "Spreadsheet",
    presentation: "Presentation",
    image: "Image",
    audio: "Audio",
    video: "Video",
    archive: "Archive",
    file: "File",
  };
  return labels[attachment.kind];
}

function AttachmentIcon({ kind }: { kind: Attachment["kind"] }) {
  if (kind === "image") return <FileImage size={17} />;
  if (kind === "audio") return <FileAudio size={17} />;
  if (kind === "video") return <FileVideo size={17} />;
  if (kind === "spreadsheet") return <FileSpreadsheet size={17} />;
  if (kind === "presentation") return <Presentation size={17} />;
  if (kind === "archive") return <FileArchive size={17} />;
  return <FileText size={17} />;
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const imagePreview = attachment.kind === "image" && attachment.previewUrl;
  const prepared =
    attachment.processingStatus === "ready" ||
    attachment.processingStatus === "partial";
  return (
    <article className={`attachment-card attachment-kind-${attachment.kind}`}>
      {imagePreview && (
        <a
          className="attachment-image"
          href={attachment.previewUrl!}
          target="_blank"
          rel="noreferrer"
          aria-label={`Preview ${attachment.name}`}
        >
          <img src={attachment.previewUrl!} alt="" loading="lazy" />
        </a>
      )}
      <div className="attachment-main">
        <span className="attachment-kind-icon">
          <AttachmentIcon kind={attachment.kind} />
        </span>
        <span className="attachment-copy">
          <strong>{attachment.name}</strong>
          <small>
            {attachmentKindLabel(attachment)} · {fileSize(attachment.size)}
            {attachment.source === "artifact"
              ? attachment.revision > 1
                ? ` · Updated result v${attachment.revision}`
                : " · Result"
              : ""}
          </small>
        </span>
        <span
          className={`attachment-state ${prepared ? "prepared" : ""}`}
          title={prepared ? "Ready" : "Saved"}
        >
          {prepared ? <Check size={10} /> : "·"}
        </span>
      </div>
      {attachment.summary && <p>{attachment.summary}</p>}
      {attachment.previewText && (
        <details className="attachment-text-preview">
          <summary>Read preview</summary>
          <pre>{attachment.previewText}</pre>
        </details>
      )}
      <footer>
        {attachment.previewUrl && (
          <a href={attachment.previewUrl} target="_blank" rel="noreferrer">
            <Eye size={12} /> Preview
          </a>
        )}
        <a href={attachment.url}>
          <Download size={12} /> Download
        </a>
      </footer>
    </article>
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

function TaskStepMark({
  status,
}: {
  status: Run["task"]["steps"][number]["status"];
}) {
  if (status === "completed") return <Check size={11} />;
  if (status === "active")
    return <LoaderCircle className="spinner" size={11} />;
  if (status === "blocked") return <>!</>;
  if (status === "skipped") return <>–</>;
  return <i />;
}

function ResultReceipt({ run }: { run: Run }) {
  const task = run.task;
  const passed = task.verificationStatus === "passed",
    partial = task.verificationStatus === "partial";
  const completed = task.steps.filter(
    (step) => step.status === "completed",
  ).length;
  return (
    <div
      className={`result-receipt ${passed ? "verified" : partial ? "partial" : ""}`}
    >
      <div className="result-receipt-top">
        <span>{passed ? <ShieldCheck size={13} /> : <Check size={13} />}</span>
        <strong>
          {passed
            ? "Finished and checked"
            : partial
              ? "Finished with a note"
              : "Result delivered"}
        </strong>
        {task.steps.length > 0 && (
          <b>
            {completed}/{task.steps.length}
          </b>
        )}
      </div>
      {task.verificationSummary && <p>{task.verificationSummary}</p>}
      {(task.verificationChecks.length > 0 || task.steps.length > 0) && (
        <details>
          <summary>See the work behind this result</summary>
          <div className="result-checks">
            {task.steps
              .filter((step) => step.status !== "skipped")
              .map((step) => (
                <div
                  key={`step-${step.id}`}
                  className={step.status === "completed" ? "passed" : "warning"}
                >
                  <span>
                    {step.status === "completed" ? <Check size={10} /> : "!"}
                  </span>
                  {step.title}
                </div>
              ))}
            {task.verificationChecks.map((check, index) => (
              <div
                key={`${check.label}-${index}`}
                className={check.passed ? "passed" : "warning"}
              >
                <span>{check.passed ? <Check size={10} /> : "!"}</span>
                {check.label}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const MESSAGE_REACTIONS = ["👍", "❤️", "✅", "👀", "🎉"] as const;

function MessageBubble({
  message,
  previous,
  macAccessEnabled = false,
  run,
  onReply,
  onReact,
}: {
  message: Message;
  previous?: Message;
  macAccessEnabled?: boolean;
  run?: Run;
  onReply: (message: Message) => void;
  onReact: (
    message: Message,
    emoji: (typeof MESSAGE_REACTIONS)[number],
  ) => void;
}) {
  if (message.senderType === "system")
    return (
      <div className="system-message">
        <Sparkles size={13} />
        {message.body}
      </div>
    );
  const user = message.senderType === "user";
  const grouped =
    previous?.senderType === message.senderType &&
    previous?.senderId === message.senderId;
  const miniBot: MascotBot = {
    name: message.senderName,
    color: message.senderColor || "#777",
    mascot: message.senderMascot || "orbit",
    status: "ready",
  };
  return (
    <article
      id={`message-${message.id}`}
      className={`message-row ${user ? "message-user" : "message-bot"} ${grouped ? "message-grouped" : ""}`}
    >
      {!user && !grouped ? (
        <Mascot bot={miniBot} size="tiny" />
      ) : !user ? (
        <div className="message-avatar-placeholder" />
      ) : null}
      <div className="message-column">
        {!user && !grouped && (
          <span className="message-sender">{message.senderName}</span>
        )}
        <div className="message-bubble">
          {message.replyTo && (
            <button
              className="message-reply-preview"
              onClick={() =>
                document
                  .getElementById(`message-${message.replyTo!.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              <MessageCircleReply size={12} />
              <span>
                <strong>{message.replyTo.senderName}</strong>
                <small>{message.replyTo.body}</small>
              </span>
            </button>
          )}
          <MessageText
            body={
              user
                ? message.body
                : presentBotMessage(message.body, { macAccessEnabled })
            }
            attachments={message.attachments}
          />
          {message.attachments.length > 0 && (
            <div className="message-attachments">
              {message.attachments.map((attachment) => (
                <AttachmentCard key={attachment.id} attachment={attachment} />
              ))}
            </div>
          )}
          {!user && run?.status === "completed" && run.task.tracked && (
            <ResultReceipt run={run} />
          )}
        </div>
        <div className="message-under">
          <div className="message-reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                className={reaction.reactedByYou ? "mine" : ""}
                onClick={() =>
                  onReact(
                    message,
                    reaction.emoji as (typeof MESSAGE_REACTIONS)[number],
                  )
                }
              >
                {reaction.emoji}
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
          <div className="message-actions">
            <button onClick={() => onReply(message)} title="Reply">
              <MessageCircleReply size={12} /> Reply
            </button>
            {MESSAGE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                className="reaction-choice"
                onClick={() => onReact(message, emoji)}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        {!grouped && (
          <time className="message-time">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        )}
      </div>
    </article>
  );
}

function RunCard({
  run,
  onApprove,
  onCancel,
}: {
  run: Run;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (["completed", "cancelled"].includes(run.status)) return null;
  const waiting = run.status === "awaiting_approval",
    consulting = run.status === "waiting_for_teammate",
    failed = run.status === "failed";
  const status: BotStatus =
    waiting || consulting ? "waiting" : failed ? "failed" : "working";
  const bot: MascotBot = {
    name: run.botName,
    color: run.botColor,
    mascot: run.botMascot,
    status,
  };
  const completedSteps = run.task.steps.filter((step) =>
    ["completed", "skipped"].includes(step.status),
  ).length;
  const progress = run.task.steps.length
    ? Math.round((completedSteps / run.task.steps.length) * 100)
    : 8;
  return (
    <article
      className={`run-card ${waiting ? "run-approval" : ""} ${consulting ? "run-consulting" : ""} ${failed ? "run-failed" : ""}`}
    >
      <div className="run-topline">
        <Mascot bot={bot} size="small" />
        <div className="run-title">
          <strong>
            {waiting
              ? `${run.botName} needs your okay`
              : consulting
                ? `${run.botName} is consulting the team`
                : failed
                  ? `${run.botName} hit a snag`
                  : run.task.goal}
          </strong>
          <span>
            {failed
              ? run.error
              : consulting
                ? "Bringing their ideas into one answer"
                : `${run.botName} · ${taskStageLabels[run.task.stage]}`}
          </span>
        </div>
        {(run.status === "running" || consulting) && (
          <LoaderCircle className="spinner" size={18} />
        )}
      </div>
      {!failed && run.task.tracked && (
        <>
          <div className="task-progress-head">
            <span>
              {waiting
                ? "Paused safely"
                : consulting
                  ? "Comparing ideas"
                  : taskStageLabels[run.task.stage]}
            </span>
            {run.task.steps.length > 0 && (
              <b>
                {completedSteps} of {run.task.steps.length}
              </b>
            )}
          </div>
          <div className="task-progress-track">
            <i
              style={{
                width: `${waiting || consulting ? progress : Math.max(progress, run.status === "running" ? 7 : 0)}%`,
              }}
            />
          </div>
          <div className="task-step-list">
            {run.task.steps.map((step) => (
              <div
                key={step.id}
                className={`task-step task-step-${step.status}`}
              >
                <span>
                  <TaskStepMark status={step.status} />
                </span>
                <p>
                  {step.title}
                  {step.detail && <small>{step.detail}</small>}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      {!run.task.tracked && !waiting && run.activities.length > 0 && (
        <div className="activity-list">
          {run.activities.slice(-3).map((activity, index, rows) => (
            <div
              key={activity.id}
              className={index === rows.length - 1 ? "current" : ""}
            >
              <span>
                {activity.kind === "error" ? "!" : <Check size={11} />}
              </span>
              <p>
                {activity.label}
                {activity.detail && <small>{activity.detail}</small>}
              </p>
            </div>
          ))}
        </div>
      )}
      {waiting && (
        <div className="approval-details">
          <ShieldCheck size={15} />
          <p>{run.approvalReason}</p>
        </div>
      )}
      {waiting && (
        <div className="approval-copy">
          <Clock3 size={14} />
          <span>This stays here until you decide.</span>
        </div>
      )}
      {waiting && (
        <div className="approval-actions">
          <button className="button-secondary" onClick={() => onCancel(run.id)}>
            Not now
          </button>
          <button className="button-primary" onClick={() => onApprove(run.id)}>
            <Check size={16} /> Allow once
          </button>
        </div>
      )}
      {(run.status === "running" || consulting) && (
        <button className="stop-button" onClick={() => onCancel(run.id)}>
          <Square size={10} fill="currentColor" /> Stop
        </button>
      )}
    </article>
  );
}

function Composer({
  threadId,
  sharedDraft,
  bots,
  apps = [],
  skills = [],
  isRoom,
  selectedBotIds,
  setSelectedBotIds,
  workingBotIds = [],
  replyingTo,
  onCancelReply,
  onSend,
  sending,
  onNotice,
}: {
  threadId: string;
  sharedDraft: StudioDraft;
  bots: Bot[];
  isRoom: boolean;
  selectedBotIds: string[];
  setSelectedBotIds: (ids: string[]) => void;
  apps?: ConnectorStatus["catalog"];
  skills?: TaughtWorkflow[];
  workingBotIds?: string[];
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  onSend: (body: string, files: File[]) => Promise<void>;
  sending: boolean;
  onNotice?: (message: string) => void;
}) {
  const [body, setBody] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [mentionQuery, setMentionQuery] = useState<string | null>(null),
    [skillQuery, setSkillQuery] = useState<string | null>(null),
    [routingOpen, setRoutingOpen] = useState(false),
    [listening, setListening] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    recognition = useRef<SpeechRecognitionLike | null>(null);
  const draftThread = useRef(""),
    seenDraft = useRef<string | null>(null),
    appliedDraftBody = useRef<string | null>(null);
  const mentionIds = useMemo(() => mentionedBotIds(body, bots), [body, bots]);
  const routedBots = mentionIds.length
    ? bots.filter((bot) => mentionIds.includes(bot.id))
    : bots.filter((bot) => selectedBotIds.includes(bot.id));
  const steeringBots = routedBots.filter((bot) =>
    workingBotIds.includes(bot.id),
  );
  const mentionChoices = bots
    .filter(
      (bot) =>
        !mentionQuery ||
        mentionSlug(bot.name).startsWith(mentionSlug(mentionQuery)),
    )
    .slice(0, 6);
  const appAliases: Partial<
    Record<ConnectorStatus["catalog"][number]["id"], string>
  > = {
    gmail: "gmail",
    "google-drive": "drive",
    "google-calendar": "calendar",
    github: "github",
    slack: "slack",
    notion: "notion",
  };
  const appChoices = apps
    .filter((app) => app.connected)
    .filter(
      (app) =>
        !mentionQuery ||
        mentionSlug(appAliases[app.id] || app.name).startsWith(
          mentionSlug(mentionQuery),
        ),
    );
  const availableSkills = skills.filter((skill) =>
    bots.some((bot) => bot.id === skill.botId),
  );
  const skillChoices = availableSkills
    .filter(
      (skill) =>
        !skillQuery || skill.skillSlug.startsWith(mentionSlug(skillQuery)),
    )
    .slice(0, 8);
  const resize = () => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  };
  useEffect(() => {
    const changedThread = draftThread.current !== threadId;
    const cameFromIPhone =
      sharedDraft.source === "ios" &&
      sharedDraft.updatedAt !== seenDraft.current;
    if (changedThread || cameFromIPhone) {
      appliedDraftBody.current = sharedDraft.body;
      setBody(sharedDraft.body);
      requestAnimationFrame(resize);
    }
    draftThread.current = threadId;
    seenDraft.current = sharedDraft.updatedAt;
  }, [threadId, sharedDraft.body, sharedDraft.source, sharedDraft.updatedAt]);
  useEffect(() => {
    if (appliedDraftBody.current === body) {
      appliedDraftBody.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      void api<StudioDraft>(`/api/drafts/${encodeURIComponent(threadId)}`, {
        method: "PUT",
        body: JSON.stringify({ body, source: "web" }),
      }).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [body, threadId]);
  const updateMention = (value: string, cursor: number | null) => {
    const before = value.slice(0, cursor ?? value.length),
      match = before.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u);
    setMentionQuery(match ? match[1] : null);
    const skillMatch = before.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
    setSkillQuery(skillMatch ? skillMatch[1] : null);
  };
  const insertSkill = (skill: TaughtWorkflow) => {
    const element = textarea.current,
      cursor = element?.selectionStart ?? body.length,
      before = body.slice(0, cursor),
      after = body.slice(cursor);
    const match = before.match(/(?:^|\s)\/([a-z0-9-]*)$/i),
      start = match ? cursor - (match[1]?.length || 0) - 1 : cursor;
    const prefix = start > 0 && !/\s$/.test(body.slice(0, start)) ? " " : "";
    setBody(`${body.slice(0, start)}${prefix}/${skill.skillSlug} ${after}`);
    setSkillQuery(null);
    setMentionQuery(null);
    setRoutingOpen(false);
    setSelectedBotIds([skill.botId]);
    requestAnimationFrame(() => {
      element?.focus();
      resize();
    });
  };
  const insertMention = (name: string) => {
    const element = textarea.current,
      cursor = element?.selectionStart ?? body.length,
      before = body.slice(0, cursor),
      after = body.slice(cursor);
    const match = before.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u),
      start = match ? cursor - (match[1]?.length || 0) - 1 : cursor;
    const prefix = start > 0 && !/\s$/.test(body.slice(0, start)) ? " " : "";
    const next = `${body.slice(0, start)}${prefix}@${mentionSlug(name)} ${after}`;
    setBody(next);
    setMentionQuery(null);
    setRoutingOpen(false);
    requestAnimationFrame(() => {
      element?.focus();
      resize();
    });
  };
  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const accepted = [...files];
    for (const file of Array.from(incoming)) {
      if (accepted.length >= 6) {
        onNotice?.("You can attach up to six files at once.");
        break;
      }
      if (file.size > 25_000_000) {
        onNotice?.(`${file.name} is larger than 25 MB.`);
        continue;
      }
      accepted.push(file);
    }
    setFiles(accepted);
    if (fileInput.current) fileInput.current.value = "";
  };
  const startVoice = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Constructor =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor)
      return onNotice?.("Voice typing is not available in this browser yet.");
    const next = new Constructor(),
      original = body.trim();
    let transcript = "";
    next.continuous = false;
    next.interimResults = true;
    next.lang = navigator.language || "en-US";
    next.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      setBody(`${original}${original && transcript ? " " : ""}${transcript}`);
      requestAnimationFrame(resize);
    };
    next.onerror = () => {
      setListening(false);
      onNotice?.("I couldn’t hear that clearly. You can try again.");
    };
    next.onend = () => setListening(false);
    recognition.current = next;
    setListening(true);
    next.start();
  };
  const submit = async () => {
    if ((!body.trim() && !files.length) || sending) return;
    await onSend(body.trim(), files);
    setBody("");
    setFiles([]);
    setMentionQuery(null);
    setSkillQuery(null);
    setRoutingOpen(false);
    onCancelReply?.();
    if (textarea.current) textarea.current.style.height = "auto";
    textarea.current?.focus();
  };
  return (
    <div className="composer-wrap" data-testid="composer-wrap">
      {replyingTo && (
        <div className="composer-reply">
          <MessageCircleReply size={14} />
          <span>
            <strong>Replying to {replyingTo.senderName}</strong>
            <small>{replyingTo.body.replace(/\s+/g, " ").slice(0, 130)}</small>
          </span>
          <button onClick={onCancelReply} aria-label="Cancel reply">
            <X size={14} />
          </button>
        </div>
      )}
      {isRoom && (
        <div className="recipient-summary-wrap">
          <button
            className={`recipient-summary ${mentionIds.length ? "mentioned" : ""}`}
            onClick={() => {
              setRoutingOpen(!routingOpen);
              setMentionQuery(null);
            }}
            aria-expanded={routingOpen}
          >
            <AtSign size={13} />
            {mentionIds.length
              ? `Mentioned: ${routedBots.map((bot) => bot.name).join(", ")}`
              : routedBots.length
                ? `To ${routedBots.map((bot) => bot.name).join(", ")}`
                : "Auto-pick a teammate"}
            <ChevronDown size={12} />
          </button>
          <span>Use @ for teammates · / for skills</span>
        </div>
      )}
      {sharedDraft.source === "ios" &&
        sharedDraft.body &&
        body === sharedDraft.body && (
          <div className="draft-handoff" role="status">
            <Smartphone size={12} />
            Continued from your iPhone
          </div>
        )}
      {steeringBots.length > 0 && (
        <div className="steering-note" role="status">
          <RefreshCw size={13} />
          <span>
            <strong>
              {steeringBots.map((bot) => bot.name).join(" and ")}{" "}
              {steeringBots.length === 1 ? "is" : "are"} working
            </strong>
            Your next message updates the job in progress.
          </span>
        </div>
      )}
      {(routingOpen || mentionQuery !== null) && isRoom && (
        <div
          className="routing-popover"
          role="listbox"
          aria-label={
            mentionQuery !== null
              ? "Mention a teammate"
              : "Choose who receives this"
          }
        >
          {mentionQuery === null && (
            <>
              <button
                className={!selectedBotIds.length ? "selected" : ""}
                onClick={() => {
                  setSelectedBotIds([]);
                  setRoutingOpen(false);
                }}
              >
                <span className="route-symbol">
                  <Sparkles size={15} />
                </span>
                <span>
                  <strong>Auto</strong>
                  <small>Pick one teammate from the request</small>
                </span>
                {!selectedBotIds.length && <Check size={14} />}
              </button>
              <button
                onClick={() => {
                  setSelectedBotIds(bots.map((bot) => bot.id));
                  setRoutingOpen(false);
                }}
              >
                <span className="route-symbol">
                  <Users size={15} />
                </span>
                <span>
                  <strong>Everyone</strong>
                  <small>Work in parallel</small>
                </span>
                {selectedBotIds.length === bots.length && <Check size={14} />}
              </button>
            </>
          )}
          {(mentionQuery !== null ? mentionChoices : bots).map((bot) => (
            <button
              key={bot.id}
              onClick={() =>
                mentionQuery !== null
                  ? insertMention(bot.name)
                  : (setSelectedBotIds([bot.id]), setRoutingOpen(false))
              }
            >
              <Mascot bot={bot} size="small" />
              <span>
                <strong>{bot.name}</strong>
                <small>{bot.role}</small>
              </span>
              {mentionQuery === null &&
                selectedBotIds.length === 1 &&
                selectedBotIds[0] === bot.id && <Check size={14} />}
            </button>
          ))}
          {mentionQuery !== null &&
            appChoices.map((app) => (
              <button
                key={`app-${app.id}`}
                className="route-app"
                onClick={() => insertMention(appAliases[app.id] || app.name)}
              >
                <span className="route-app-icon">
                  <ConnectorIcon id={app.id} />
                </span>
                <span>
                  <strong>
                    @{appAliases[app.id] || mentionSlug(app.name)}
                  </strong>
                  <small>Use {app.name} in this request</small>
                </span>
                <Check size={13} />
              </button>
            ))}
          {mentionQuery !== null &&
            (!mentionQuery ||
              "everyone".startsWith(mentionQuery.toLowerCase())) && (
              <button onClick={() => insertMention("everyone")}>
                <span className="route-symbol">
                  <Users size={15} />
                </span>
                <span>
                  <strong>@everyone</strong>
                  <small>Ask the whole studio</small>
                </span>
              </button>
            )}
        </div>
      )}
      {skillQuery !== null && (
        <div
          className="routing-popover skill-popover"
          role="listbox"
          aria-label="Choose a learned skill"
        >
          {skillChoices.length ? (
            skillChoices.map((skill) => {
              const owner = bots.find((bot) => bot.id === skill.botId);
              return (
                <button key={skill.id} onClick={() => insertSkill(skill)}>
                  <span className="route-symbol">
                    <WandSparkles size={16} />
                  </span>
                  <span>
                    <strong>/{skill.skillSlug}</strong>
                    <small>
                      {skill.name} · {owner?.name || skill.botName}
                    </small>
                  </span>
                  <ArrowUp size={13} />
                </button>
              );
            })
          ) : (
            <div className="skill-empty">
              <WandSparkles size={17} />
              <span>
                <strong>No matching skill</strong>
                <small>Teach a teammate once, then reuse it here.</small>
              </span>
            </div>
          )}
        </div>
      )}
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}`}>
              <FileText size={14} />
              <span>
                <strong>{file.name}</strong>
                <small>
                  {file.size < 1_000_000
                    ? `${Math.ceil(file.size / 1_000)} KB`
                    : `${(file.size / 1_000_000).toFixed(1)} MB`}
                </small>
              </span>
              <button
                onClick={() =>
                  setFiles(files.filter((_, fileIndex) => fileIndex !== index))
                }
                aria-label={`Remove ${file.name}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={`composer ${listening ? "is-listening" : ""}`}>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.json,.yaml,.yml,.txt,.md,.html,.js,.ts,.tsx,.py"
          onChange={(event) => addFiles(event.target.files)}
        />
        <button
          className="composer-plus"
          onClick={() => fileInput.current?.click()}
          title="Attach files"
          aria-label="Attach files"
        >
          <Paperclip size={18} />
        </button>
        {isRoom && (
          <button
            className="composer-mention"
            onClick={() => {
              setBody(`${body}${body && !body.endsWith(" ") ? " " : ""}@`);
              setMentionQuery("");
              requestAnimationFrame(() => textarea.current?.focus());
            }}
            title="Mention a teammate"
            aria-label="Mention a teammate"
          >
            <AtSign size={17} />
          </button>
        )}
        {availableSkills.length > 0 && (
          <button
            className="composer-skill"
            onClick={() => {
              setBody(`${body}${body && !body.endsWith(" ") ? " " : ""}/`);
              setSkillQuery("");
              setMentionQuery(null);
              requestAnimationFrame(() => textarea.current?.focus());
            }}
            title="Use a learned skill"
            aria-label="Use a learned skill"
          >
            <WandSparkles size={16} />
          </button>
        )}
        <textarea
          data-testid="message-input"
          ref={textarea}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            updateMention(event.target.value, event.target.selectionStart);
            resize();
          }}
          onClick={(event) =>
            updateMention(body, event.currentTarget.selectionStart)
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setMentionQuery(null);
              setSkillQuery(null);
              setRoutingOpen(false);
            } else if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            steeringBots.length
              ? `Add a direction for ${steeringBots.map((bot) => bot.name).join(" and ")}…`
              : isRoom
                ? "Message the studio"
                : `Message ${bots[0]?.name || "your teammate"}`
          }
          rows={1}
        />
        <button
          className={`voice-button ${listening ? "active" : ""}`}
          onClick={startVoice}
          aria-label={listening ? "Stop voice typing" : "Start voice typing"}
          aria-pressed={listening}
        >
          {listening ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button
          className="send-button"
          onClick={() => void submit()}
          disabled={(!body.trim() && !files.length) || sending}
          aria-label="Send message"
        >
          {sending ? (
            <LoaderCircle className="spinner" size={18} />
          ) : (
            <ArrowUp size={19} strokeWidth={2.5} />
          )}
        </button>
      </div>
      <p className="composer-note">
        Private by default · sensitive actions wait for your okay
      </p>
    </div>
  );
}

function Sheet({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="sheet-layer">
      <button
        className="sheet-scrim"
        onClick={onClose}
        aria-label="Close panel"
      />
      <aside className={`sheet ${wide ? "sheet-wide" : ""}`}>
        <div className="sheet-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={19} />
          </button>
        </div>
        <div className="sheet-content">{children}</div>
      </aside>
    </div>
  );
}

function ControlPanel({
  state,
  onNotify,
  onOpenProvider,
  onOpenRemote,
  onOpenConnectors,
  onOpenProjects,
  onOpenSkills,
  onSetMacAccess,
}: {
  state: AppState;
  onNotify: () => void;
  onOpenProvider: () => void;
  onOpenRemote: () => void;
  onOpenConnectors: () => void;
  onOpenProjects: () => void;
  onOpenSkills: () => void;
  onSetMacAccess: (enabled: boolean) => Promise<void>;
}) {
  const active = state.bots.filter((bot) =>
    ["working", "waiting"].includes(bot.status),
  );
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
              accessible app controls. File moves, clicks and typing still wait
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

function SearchPanel({
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
    [entry, setEntry] = useState(""),
    [busy, setBusy] = useState(false);
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
  const perform = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      merge(
        await api<TakeoverResult>(`/api/bots/${bot.id}/browser/${path}`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "The browser needs another try.",
      );
    } finally {
      setBusy(false);
    }
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
  const clickPreview = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!status?.screenshot || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    void perform("takeover/click", {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 820,
    });
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
              Click the screen, type privately, then hand control back.
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
        {status?.screenshot ? (
          <button
            className="live-screen"
            onClick={clickPreview}
            disabled={busy}
            aria-label="Interactive browser screen"
          >
            <img
              src={status.screenshot}
              alt={`${bot.name}'s current browser`}
            />
            {busy && (
              <span>
                <LoaderCircle className="spinner" /> Updating screen…
              </span>
            )}
            <i>
              <MousePointer2 size={13} /> Click anywhere to take control
            </i>
          </button>
        ) : (
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
        )}
      </div>
      <div className="takeover-controls">
        <div className="takeover-copy">
          <ShieldCheck size={16} />
          <span>
            <strong>Private keyboard</strong>
            <small>
              Text goes directly to the focused field. It is never saved in chat
              or added to the bot’s activity.
            </small>
          </span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (entry)
              void perform("takeover/type", {
                value: entry,
                replace: false,
              });
            setEntry("");
          }}
        >
          <Keyboard size={15} />
          <input
            type="password"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            placeholder="Type into the selected field"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={!entry || busy}
            onClick={() => {
              void perform("takeover/type", { value: entry, replace: true });
              setEntry("");
            }}
          >
            Replace
          </button>
          <button className="primary" disabled={!entry || busy}>
            Type
          </button>
        </form>
        <div className="takeover-keys">
          {(["Tab", "Enter", "Escape", "Backspace"] as const).map((key) => (
            <button
              key={key}
              disabled={busy || status?.browser !== "ready"}
              onClick={() => void perform("takeover/key", { key })}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveStudioPanel({
  state,
  onOpenThread,
  onApprove,
  onCancel,
  onUpdateThread,
  onOpenControl,
  onNotice,
}: {
  state: AppState;
  onOpenThread: (threadId: string) => void;
  onApprove: (runId: string) => Promise<void>;
  onCancel: (runId: string) => Promise<void>;
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
  return (
    <div className="live-studio-panel">
      <div className="live-hero">
        <div>
          <span>
            <i /> {state.runner.deployment?.mode === "private_runner" ? "Private home online" : state.runner.backgroundService === "installed" ? "Background protection active" : "Live from this Mac"}
          </span>
          <h3>
            {state.usage.activeRuns
              ? `${state.usage.activeRuns} teammate${state.usage.activeRuns === 1 ? " is" : "s are"} moving work forward`
              : "Your team is ready"}
          </h3>
          <p>
            Watch progress, step in when a website needs you, or redirect the
            next move. Interrupted work resumes from its saved checkpoint.
          </p>
        </div>
        <RoomCluster bots={state.bots} hero />
      </div>
      <div className="live-summary">
        <div>
          <MonitorPlay size={17} />
          <strong>
            {state.bots.filter((bot) => bot.status === "working").length}
          </strong>
          <span>working now</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <strong>{state.approvals.length}</strong>
          <span>waiting for you</span>
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
      {(attentionRuns.length > 0 || state.automationAlerts.length > 0) && (
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
          {attentionRuns.slice(0, 5).map((run) => (
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
                  {run.error || run.approvalReason || run.task.goal}
                </small>
              </span>
              <button onClick={() => onOpenThread(run.threadId)}>Open</button>
              {run.status === "awaiting_approval" && (
                <button
                  className="allow"
                  onClick={() => void onApprove(run.id)}
                >
                  <Check size={13} /> Allow
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
                        <div>
                          <i
                            style={{
                              width: `${total ? Math.max(7, (completed / total) * 100) : 7}%`,
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
function CodeProjectsPanel({
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

function ConnectorPanel({
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
  onStartWorkflow: (prompt: string) => Promise<void>;
}) {
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
  const gmailReady = Boolean(
      status?.catalog.find((entry) => entry.id === "gmail")?.connected,
    ),
    driveReady = Boolean(
      status?.catalog.find((entry) => entry.id === "google-drive")?.connected,
    ),
    calendarReady = Boolean(
      status?.catalog.find((entry) => entry.id === "google-calendar")
        ?.connected,
    );
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
      <div className="connector-hero">
        <div className="connector-hero-copy">
          <span className="control-kicker">
            <Sparkles size={13} /> A calmer way to get things done
          </span>
          <h3>Connect once. Give each teammate only what they need.</h3>
          <p>
            Mail, conversations, knowledge and code come into one studio—while
            every external write still waits for your okay.
          </p>
        </div>
        <div className="connector-stage" aria-hidden="true">
          <Mascot
            bot={{
              name: "Pip",
              color: "#6657d8",
              mascot: "orbit",
              status: status?.catalog.some((item) => item.connected)
                ? "ready"
                : "working",
            }}
            size="large"
          />
          <span className="connector-float connector-float-gmail">
            <ConnectorIcon id="slack" />
          </span>
          <span className="connector-float connector-float-drive">
            <ConnectorIcon id="notion" />
          </span>
          <span className="connector-line" />
        </div>
      </div>

      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Apps your team can use</h3>
            <p>Working connections are clearly separated from the roadmap</p>
          </div>
          {connected && (
            <span className="connector-ready">
              <i /> Google ready
            </span>
          )}
        </div>
        <div className="connector-catalog">
          {status?.catalog
            .filter((entry) => entry.id !== "github")
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
                </div>
              </article>
            )) || (
            <div className="connector-loading">
              <LoaderCircle className="spinner" /> Checking your apps…
            </div>
          )}
        </div>
      </section>

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
            (!gmailReady || !driveReady || !calendarReady) && (
              <button className="upgrade-google" onClick={() => void connect()}>
                <RefreshCw size={15} /> Reconnect once to add the newest Google
                apps
              </button>
            )}
          <section>
            <div className="panel-section-heading">
              <div>
                <h3>Ready-made jobs</h3>
                <p>
                  Each one gathers the facts, produces something useful, and
                  checks its own work.
                </p>
              </div>
            </div>
            <div className="workflow-starters">
              <button
                disabled={!gmailReady || !calendarReady}
                onClick={() =>
                  void onStartWorkflow(
                    "Use @calendar and @gmail to create my morning brief for the next 24 hours. Deliver one concise brief with: today’s schedule, important unread mail, decisions I owe, preparation needed, and direct source links. Check dates, remove duplicates, and confirm every claim comes from a calendar event or email. Do not send or change anything.",
                  )
                }
              >
                <span>
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>Morning brief</strong>
                  <small>
                    A checked plan for today, with every source linked
                  </small>
                </div>
                <ArrowUp size={14} />
              </button>
              <button
                disabled={!gmailReady || !driveReady || !calendarReady}
                onClick={() =>
                  void onStartWorkflow(
                    "Use @calendar, @drive, and @gmail to prepare me for my next meeting. Deliver a short briefing with the event details, attendees, recent related documents, the latest relevant email thread, likely decisions, and five useful questions. Link every source, verify that the material is about the same meeting, and do not change anything.",
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
                disabled={!gmailReady}
                onClick={() =>
                  void onStartWorkflow(
                    "Use @gmail to find important messages from the last seven days that are genuinely waiting on me. Read the full relevant messages, group them by urgency, explain the evidence for each choice, and deliver short reply drafts in my voice. Verify dates and recipients and exclude anything already answered. Do not send anything unless I separately approve the exact email.",
                  )
                }
              >
                <span>
                  <Mail size={16} />
                </span>
                <div>
                  <strong>Clear my follow-ups</strong>
                  <small>
                    Verified open loops with reviewable reply drafts
                  </small>
                </div>
                <ArrowUp size={14} />
              </button>
            </div>
          </section>
          <section>
            <div className="panel-section-heading">
              <div>
                <h3>Who can use each app</h3>
                <p>
                  OpenBot adds per-teammate controls that shared plugin accounts
                  usually lack.
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
                          !gmailReady || busy === `access-gmail-${bot.id}`
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
                        className={gmail?.canSend ? "on send" : "send"}
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
      <GitHubConnectorPanel
        status={status}
        bots={bots}
        onRefresh={onRefresh}
        onNotice={onNotice}
      />
      <OAuthConnectorPanel
        kind="slack"
        status={status}
        bots={bots}
        onRefresh={onRefresh}
        onNotice={onNotice}
      />
      <OAuthConnectorPanel
        kind="notion"
        status={status}
        bots={bots}
        onRefresh={onRefresh}
        onNotice={onNotice}
      />
      <OAuthConnectorPanel
        kind="todoist"
        status={status}
        bots={bots}
        onRefresh={onRefresh}
        onNotice={onNotice}
      />
      <OAuthConnectorPanel
        kind="dropbox"
        status={status}
        bots={bots}
        onRefresh={onRefresh}
        onNotice={onNotice}
      />
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
                A clear trail without exposing private message or page contents
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
function RemotePanel({
  bots,
  runner,
  installPrompt,
  onInstalled,
  onNotice,
}: {
  bots: Bot[];
  runner: RunnerHealth;
  installPrompt: InstallPrompt | null;
  onInstalled: () => void;
  onNotice: (message: string) => void;
}) {
  const [access, setAccess] = useState<AccessInfo | null>(null),
    [loading, setLoading] = useState(true),
    [showKey, setShowKey] = useState(false);
  const localHost = ["127.0.0.1", "localhost", "::1"].includes(
    window.location.hostname,
  );
  const privateRunner = runner.deployment?.mode === "private_runner";
  const nativeIOS =
    new URLSearchParams(window.location.search).get("native") === "ios" ||
    navigator.userAgent.includes("OpenBot-iOS/");
  const loadAccess = useCallback(
    () =>
      api<AccessInfo>("/api/access")
        .then(setAccess)
        .catch(() => setAccess(null))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);
  useEffect(() => {
    if (!localHost || !access?.remoteEnabled || access.tailscaleUrl) return;
    const timer = window.setInterval(() => void loadAccess(), 2_500);
    return () => window.clearInterval(timer);
  }, [access?.remoteEnabled, access?.tailscaleUrl, loadAccess, localHost]);
  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") onInstalled();
      return;
    }
    onNotice(
      /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? "On iPhone: tap Share, then Add to Home Screen."
        : "Use your browser menu and choose Install OpenBot.",
    );
  };
  const copy = async (value: string, success: string) => {
    await navigator.clipboard.writeText(value);
    onNotice(success);
  };
  const shareWithIPhone = async (value: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "OpenBot",
          text: "Connect my iPhone to this OpenBot studio.",
          url: value,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    await copy(value, "iPhone connection link copied");
  };
  const openTailscale = async () => {
    try {
      await api("/api/access/tailscale/open", { method: "POST" });
      onNotice(
        "Tailscale opened — turn it on, then use the same account on your iPhone",
      );
      window.setTimeout(() => void loadAccess(), 1_500);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Open Tailscale on this Mac",
      );
    }
  };
  return (
    <div className="remote-panel">
      <div className="remote-hero">
        <div className="remote-orbit">
          <RoomCluster bots={bots} large />
          <Smartphone size={22} />
        </div>
        <span className="control-kicker">
          <Wifi size={13} /> Your studio, in your pocket
        </span>
        <h3>Talk to the team while you’re away.</h3>
        <p>
          Install OpenBot on your phone, dictate a task, watch progress and
          handle approvals without opening your laptop screen.
        </p>
      </div>
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>
              {nativeIOS
                ? "Native iPhone companion"
                : "Install the phone remote"}
            </h3>
            <p>
              {nativeIOS
                ? "Securely connected through the OpenBot iOS app"
                : "Use the native companion or add the web app to your Home Screen"}
            </p>
          </div>
        </div>
        {nativeIOS ? (
          <div className="remote-status good">
            <Smartphone size={17} />
            <span>
              <strong>This iPhone is connected</strong>
              <small>Your private key stays in Keychain</small>
            </span>
          </div>
        ) : (
          <button className="install-app-card" onClick={() => void install()}>
            <span>
              <Smartphone size={19} />
            </span>
            <div>
              <strong>Add OpenBot to Home Screen</strong>
              <small>
                {installPrompt ? "Ready to install" : "Takes about ten seconds"}
              </small>
            </div>
            <ChevronDown size={16} />
          </button>
        )}
      </section>
      {localHost && access?.nativePush && (
        <section>
          <div className="panel-section-heading">
            <div>
              <h3>Native notifications</h3>
              <p>Private APNs delivery from this Mac to the signed iPhone app</p>
            </div>
          </div>
          <div className={`remote-status ${access.nativePush.configured ? "good" : ""}`}>
            <Bell size={17} />
            <span>
              <strong>{access.nativePush.configured ? "Native push is ready" : "Add your Apple push key"}</strong>
              <small>{access.nativePush.configured ? `${access.nativePush.devices} iPhone${access.nativePush.devices === 1 ? "" : "s"} registered` : "Set the APNs team ID, key ID and private-key path on this Mac"}</small>
            </span>
          </div>
        </section>
      )}
      <section>
        <div className="panel-section-heading">
          <div>
            <h3>Private connection</h3>
            <p>
              {privateRunner ? "Your private host stays in control; the access key protects every new device" : "Your Mac remains the host; the access key protects other devices"}
            </p>
          </div>
        </div>
        {loading ? (
          <div className="remote-status">
            <LoaderCircle className="spinner" size={17} /> Checking this Mac…
          </div>
        ) : !localHost ? (
          <div className="remote-status good">
            <Wifi size={17} />
            <span>
              <strong>Connected remotely</strong>
              <small>{window.location.origin}</small>
            </span>
          </div>
        ) : access?.remoteEnabled ? (
          <div className="remote-setup">
            <div className="remote-status good">
              <Wifi size={17} />
              <span>
                <strong>
                  {access.tailscaleUrl
                    ? "Away access is ready"
                    : "Phone access is ready nearby"}
                </strong>
                <small>
                  {access.tailscaleUrl
                    ? "Works on cellular or any Wi-Fi through your private Tailscale network"
                    : "Local Wi-Fi works now; add Tailscale for access from anywhere"}
                </small>
              </span>
            </div>
            {!access.tailscaleUrl && (
              <div className="away-access-card">
                <span>
                  <Globe2 size={18} />
                </span>
                <div>
                  <strong>Use OpenBot away from home</strong>
                  <small>
                    Turn on Tailscale here and on your iPhone with the same
                    account. OpenBot will detect it automatically.
                  </small>
                </div>
                <button onClick={() => void openTailscale()}>
                  Open Tailscale
                </button>
                <a
                  href="https://tailscale.com/docs/install/ios"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get it for iPhone <ExternalLink size={11} />
                </a>
              </div>
            )}
            <div className="remote-links">
              {access.urls.map((url, index) => (
                <div
                  className={url === access.tailscaleUrl ? "is-away" : ""}
                  key={url}
                >
                  <button
                    onClick={() => void copy(url, "Phone address copied")}
                  >
                    <span>
                      <strong>{url}</strong>
                      <small>
                        {url === access.tailscaleUrl
                          ? "Private address that works across networks"
                          : "Address for this Wi-Fi network"}
                      </small>
                    </span>
                    <Copy size={14} />
                  </button>
                  {access.iosConnectUrls?.[index] && (
                    <button
                      onClick={() =>
                        void shareWithIPhone(access.iosConnectUrls![index]!)
                      }
                    >
                      <span>
                        <strong>Send pairing link to iPhone</strong>
                        <small>
                          Shares the address only—never your private key
                        </small>
                      </span>
                      <Smartphone size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="access-key-row">
              <span>
                <strong>Access key</strong>
                <code>{showKey ? access.token : "••••••••••••••••••••"}</code>
              </span>
              <button onClick={() => setShowKey(!showKey)}>
                {showKey ? "Hide" : "Show"}
              </button>
              <button
                onClick={() =>
                  void copy(access.token, "Private access key copied")
                }
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="remote-setup">
            <div className="remote-status warning">
              <WifiOff size={17} />
              <span>
                <strong>Phone access is off</strong>
                <small>Local-only is the secure default</small>
              </span>
            </div>
            <div className="remote-command">
              <span>On this Mac, start the launch build with</span>
              <code>npm run remote</code>
              <button
                onClick={() =>
                  void copy("npm run remote", "Start command copied")
                }
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}
      </section>
      <div className="security-footnote">
        <ShieldCheck size={16} />
        <p>
          <strong>Tailscale keeps away access private and encrypted.</strong>
          <br />
          Use the same Tailscale account on the Mac and iPhone. Never expose
          OpenBot’s plain HTTP port directly to the public internet. Dictation
          does not store microphone audio in OpenBot.
        </p>
      </div>
    </div>
  );
}

function ProviderPanel({
  provider,
  bots,
  onUpdateBot,
  onAdd,
  onConnect,
  onFinish,
}: {
  provider: ProviderStatus | null;
  bots: Bot[];
  onUpdateBot: (id: string, patch: Partial<Bot>) => Promise<void>;
  onAdd: (input: {
    name: string;
    provider: ProviderKind;
    authMode: "api_key";
    runtime: "opencode";
    envName: string;
    secret: string;
  }) => Promise<void>;
  onConnect: (
    providerId: ProviderCatalogEntry["id"],
  ) => Promise<ProviderLoginAttempt>;
  onFinish: (attemptId: string, code: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false),
    [name, setName] = useState("My OpenAI API"),
    [envName, setEnvName] = useState("OPENAI_API_KEY"),
    [secret, setSecret] = useState(""),
    [apiProvider, setApiProvider] = useState<ProviderKind>("openai"),
    [apiPreset, setApiPreset] = useState("openai"),
    [activeAttempt, setActiveAttempt] = useState<ProviderLoginAttempt | null>(
      null,
    ),
    [code, setCode] = useState(""),
    [busyProvider, setBusyProvider] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onAdd({
      name,
      provider: apiProvider,
      authMode: "api_key",
      runtime: "opencode",
      envName,
      secret,
    });
    setSecret("");
    setAdding(false);
  };
  const connect = async (entry: ProviderCatalogEntry) => {
    setBusyProvider(entry.id);
    try {
      const attempt = await onConnect(entry.id);
      setActiveAttempt(attempt);
      if (attempt.url)
        window.open(attempt.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyProvider(null);
    }
  };
  const chooseApi = (value: string) => {
    setApiPreset(value);
    setApiProvider(
      value === "openai" ? "openai" : value === "claude" ? "claude" : "custom",
    );
    if (value === "openai") {
      setName("My OpenAI API");
      setEnvName("OPENAI_API_KEY");
    } else if (value === "claude") {
      setName("My Anthropic API");
      setEnvName("ANTHROPIC_API_KEY");
    } else if (value === "openrouter") {
      setName("My OpenRouter API");
      setEnvName("OPENROUTER_API_KEY");
    } else {
      setName("My provider");
      setEnvName("PROVIDER_API_KEY");
    }
  };
  return (
    <div className="settings-stack">
      <div className="connection-hero">
        <span>
          <Sparkles size={15} /> Bring your own AI
        </span>
        <h3>One studio, the accounts you already trust.</h3>
        <p>
          Subscriptions sign in with their official tools. API keys stay
          encrypted on this Mac.
        </p>
      </div>
      <section>
        <div className="setting-section-title">
          <h3>Subscriptions and accounts</h3>
          <p>Pick any mix. Every teammate can use a different connection.</p>
        </div>
        <div className="provider-catalog">
          {provider?.catalog.map((entry) => (
            <article
              key={entry.id}
              className={`provider-choice provider-choice-${entry.id} ${entry.connected ? "is-connected" : ""}`}
            >
              <div className="provider-choice-top">
                <span className="provider-logo">
                  <ProviderIcon id={entry.id} />
                </span>
                <div>
                  <h4>{entry.name}</h4>
                  <small>{entry.badge}</small>
                </div>
                <span
                  className={`connection-state ${entry.connected ? "connected" : ""}`}
                >
                  <i />
                  {entry.connected
                    ? "Ready"
                    : entry.installed
                      ? "Available"
                      : "Needs app"}
                </span>
              </div>
              <p>{entry.description}</p>
              <footer>
                <small>{entry.note}</small>
                {entry.connected ? (
                  <Check size={16} />
                ) : entry.canConnect ? (
                  <button
                    onClick={() => void connect(entry)}
                    disabled={busyProvider === entry.id}
                  >
                    {busyProvider === entry.id ? (
                      <LoaderCircle className="spinner" size={14} />
                    ) : (
                      "Connect"
                    )}
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      </section>
      {activeAttempt?.status === "waiting" &&
        !provider?.catalog.find(
          (entry) => entry.id === activeAttempt.providerId,
        )?.connected && (
          <div className="login-progress">
            <div className="login-pulse">
              <i />
              <i />
              <i />
            </div>
            <span>
              <strong>Finish the secure sign-in</strong>
              <small>{activeAttempt.instructions}</small>
            </span>
            {activeAttempt.url && (
              <button
                onClick={() =>
                  window.open(
                    activeAttempt.url!,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Open again
              </button>
            )}
            {activeAttempt.callbackMode === "code" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void onFinish(activeAttempt.id, code);
                }}
              >
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Paste sign-in code"
                />
                <button className="button-primary">Finish</button>
              </form>
            )}
          </div>
        )}
      <div className="friendly-note">
        <ShieldCheck size={17} />
        <p>
          <strong>No passwords pass through OpenBot.</strong>
          <br />
          Claude uses Claude Code; supported subscription providers use
          OpenCode. Provider rules and metering still apply.
        </p>
      </div>
      <section>
        <div className="setting-section-title">
          <h3>Models and ownership</h3>
          <p>Each teammate uses only the connection assigned here.</p>
        </div>
        <div className="model-bot-list">
          {bots.map((bot) => {
            const connection = provider?.instances.find(
              (instance) => instance.id === bot.providerInstanceId,
            );
            const choices = connection?.models?.length
              ? connection.models
              : [bot.model];
            const models = choices.includes(bot.model)
              ? choices
              : [bot.model, ...choices];
            return (
              <div key={bot.id} className="provider-bot-block">
                <div className="model-bot-row">
                  <Mascot bot={bot} size="small" />
                  <span>
                    <strong>{bot.name}</strong>
                    <small>{connection?.name || bot.role}</small>
                  </span>
                  <select
                    value={bot.model}
                    onChange={(event) =>
                      void onUpdateBot(bot.id, { model: event.target.value })
                    }
                  >
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {shortModel(model)}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="provider-owner">
                  <span>Connection</span>
                  <select
                    value={bot.providerInstanceId || ""}
                    onChange={(event) => {
                      const next = provider?.instances.find(
                        (instance) => instance.id === event.target.value,
                      );
                      void onUpdateBot(bot.id, {
                        providerInstanceId: event.target.value,
                        ...(next?.defaultModel
                          ? { model: next.defaultModel }
                          : {}),
                      });
                    }}
                  >
                    {provider?.instances.map((instance) => (
                      <option key={instance.id} value={instance.id}>
                        {instance.name}
                        {instance.hasSecret
                          ? " · encrypted"
                          : instance.connected
                            ? " · ready"
                            : " · check"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </section>
      {adding ? (
        <form className="routine-form api-key-form" onSubmit={submit}>
          <label className="field">
            <span>Provider</span>
            <select
              value={apiPreset}
              onChange={(event) => chooseApi(event.target.value)}
            >
              <option value="openai">OpenAI API</option>
              <option value="claude">Anthropic API</option>
              <option value="openrouter">OpenRouter</option>
              <option value="custom">Other compatible provider</option>
            </select>
          </label>
          <label className="field">
            <span>Connection name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Environment variable</span>
            <input
              value={envName}
              onChange={(e) => setEnvName(e.target.value.toUpperCase())}
              placeholder="OPENAI_API_KEY"
            />
          </label>
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <p className="field-help">
            <KeyRound size={13} /> Encrypted with AES-256-GCM before it reaches
            local storage.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button className="button-primary">Save privately</button>
          </div>
        </form>
      ) : (
        <button className="add-routine" onClick={() => setAdding(true)}>
          <Plus size={17} /> Add an API-key connection
        </button>
      )}
      <div className="claude-boundary">
        <strong>About Claude subscriptions</strong>
        <p>
          OpenBot uses Anthropic’s official Claude Code login, never an
          unofficial OpenCode subscription plug-in. Depending on Anthropic’s
          current policy and your account, third-party use may count toward plan
          limits or usage credits.
        </p>
      </div>
      <div className="tiny-details">
        <span>OpenCode {provider?.version || "not found"}</span>
        <span>Local owner · isolated per teammate</span>
      </div>
    </div>
  );
}

function BotPanel({
  bot,
  thread,
  provider,
  apps = [],
  onSave,
  onUpdateThread,
  onDuplicate,
  onOpenTeach,
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
    [duplicating, setDuplicating] = useState(false);
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
      <fieldset className="appearance-editor">
        <legend>Appearance</legend>
        <p>
          Pick a shape and color. Your teammate updates everywhere, including
          iPhone.
        </p>
        <div className="mascot-picker">
          {MASCOT_KINDS.map((kind) => (
            <button
              type="button"
              aria-label={`Use ${kind} shape`}
              key={kind}
              className={form.mascot === kind ? "chosen" : ""}
              onClick={() => setForm({ ...form, mascot: kind })}
            >
              <Mascot bot={{ ...preview, mascot: kind }} size="small" />
            </button>
          ))}
        </div>
        <div className="color-picker">
          {MASCOT_COLORS.map((value) => (
            <button
              type="button"
              aria-label={`Use ${value} color`}
              key={value}
              className={form.color === value ? "chosen" : ""}
              style={{ background: value }}
              onClick={() => setForm({ ...form, color: value })}
            />
          ))}
          <label className="custom-color" title="Choose any color">
            <input
              aria-label="Choose a custom mascot color"
              type="color"
              value={form.color}
              onChange={(event) =>
                setForm({ ...form, color: event.target.value })
              }
            />
            <span>+</span>
          </label>
        </div>
      </fieldset>
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
      </div>
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
            className="quiet-danger"
            onClick={() => void onUpdateThread({ hidden: true })}
          >
            <EyeOff size={15} />
            Hide from sidebar
          </button>
        </div>
        <small>
          Duplicating copies this teammate’s setup and access, but never their
          private history or memory.
        </small>
      </fieldset>
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

function FilesPanel({ bot }: { bot: Bot }) {
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
  if (routine.triggerType === "schedule")
    return routineScheduleLabel(routine.intervalMinutes);
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

function RoutinesPanel({
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
      "5" | "60" | "1440" | "10080" | "custom"
    >("1440"),
    [customAmount, setCustomAmount] = useState(2),
    [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">(
      "hours",
    );
  const [triggerType, setTriggerType] =
      useState<AutomationTriggerType>("schedule"),
    [eventName, setEventName] = useState(""),
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
    triggerType !== "schedule" ||
    (intervalMinutes >= 5 && intervalMinutes <= 43_200);
  const copy = (value: string) => void navigator.clipboard.writeText(value);
  const reset = () => {
    setName("");
    setPrompt("");
    setSchedule("1440");
    setCustomAmount(2);
    setCustomUnit("hours");
    setTriggerType("schedule");
    setEventName("");
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
    setEditing(routine);
    setCreating(true);
    setCreatedHook(null);
    setName(routine.name);
    setPrompt(routine.prompt);
    setBotId(routine.botId);
    setEnabled(routine.enabled);
    setTriggerType(routine.triggerType);
    setEventName(routine.triggerConfig.eventName || "");
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
    const preset = [5, 60, 1440, 10080].includes(routine.intervalMinutes)
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
    if (!selectedBot || !intervalValid || saving) return;
    setSaving(true);
    const triggerConfig =
      triggerType === "github"
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
        threadId: selectedBot.threadId,
        intervalMinutes: triggerType === "schedule" ? intervalMinutes : 1440,
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
      <section className="routine-hero">
        <div className="routine-orbit">
          <Workflow size={22} />
          <i />
          <i />
          <i />
        </div>
        <span>
          <b>Dependable automations</b>
          <h3>One event. One checked result.</h3>
          <p>
            Schedules, connected apps and signed hooks—with retries you can understand.
          </p>
        </span>
      </section>

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
                  </div>
                  <button
                    className="routine-test"
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
                    <Play size={12} /> Test
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
              placeholder="New issue triage"
              required
            />
          </label>
          <fieldset className="routine-fieldset">
            <legend>What starts it?</legend>
            <div className="trigger-presets">
              {[
                {
                  value: "schedule" as const,
                  label: "Schedule",
                  icon: <Clock3 size={14} />,
                },
                {
                  value: "calendar" as const,
                  label: "Calendar",
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
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={triggerType === item.value ? "selected" : ""}
                  onClick={() => setTriggerType(item.value)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {triggerType === "schedule" && (
            <fieldset className="routine-fieldset">
              <legend>How often?</legend>
              <div className="schedule-presets">
                {[
                  { value: "5", label: "5 min" },
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
                    min={customUnit === "minutes" ? 5 : 1}
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
                  Choose a repeat time from 5 minutes to 30 days.
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
                    ? routineStartsInLabel(intervalMinutes)
                    : "It will wait safely for a matching event"
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
              {triggerType === "schedule"
                ? routineScheduleLabel(intervalMinutes).toLowerCase()
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
              disabled={!intervalValid || saving}
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

function ComputerPanel({ bot, onTeach }: { bot: Bot; onTeach: () => void }) {
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

function TeachPanel({
  bot,
  bots,
  onBotChange,
  onUse,
  onNotice,
}: {
  bot: Bot;
  bots: Bot[];
  onBotChange: (botId: string) => void;
  onUse: (workflow: TaughtWorkflow) => Promise<void>;
  onNotice: (message: string) => void;
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
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
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
      <div className="skill-owner-switcher">
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
      </div>
      <div className={`teach-hero ${recording ? "recording" : ""}`}>
        <div className="teach-visual">
          <Mascot
            bot={{ ...bot, status: recording ? "working" : "ready" }}
            size="large"
          />
          <span className="teach-pointer">↖</span>
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
                    {workflow.name} · v{workflow.version} · {workflow.stepCount} steps ·{" "}
                    {new URL(workflow.startUrl).hostname}
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
            <span>Starting web page</span>
            <input
              value={editUrl}
              onChange={(event) => setEditUrl(event.target.value)}
              required
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

function CreateBotDialog({
  provider,
  onClose,
  onCreate,
}: {
  provider: ProviderStatus | null;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    emoji: string;
    mascot: MascotKind;
    color: string;
    role: string;
    instructions: string;
    model: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [mascot, setMascot] = useState<MascotKind>("orbit"),
    [color, setColor] = useState("#ee8b46"),
    [role, setRole] = useState(""),
    [instructions, setInstructions] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onCreate({
        name,
        emoji: "•",
        mascot,
        color,
        role,
        instructions,
        model:
          provider?.defaultModel || "opencode/muse-spark-1.2-contributor-free",
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const preview: MascotBot = {
    name: name || "New teammate",
    mascot,
    color,
    status: "ready",
  };
  return (
    <div className="dialog-layer">
      <button className="dialog-scrim" onClick={onClose} />
      <form className="dialog" onSubmit={submit}>
        <button type="button" className="dialog-close" onClick={onClose}>
          <X size={19} />
        </button>
        <div className="dialog-heading">
          <Mascot bot={preview} size="large" />
          <h2>New teammate</h2>
          <p>Give them a clear job and a little personality.</p>
        </div>
        <div className="mascot-picker">
          {MASCOT_KINDS.map((kind) => (
            <button
              type="button"
              aria-label={`Use ${kind} shape`}
              key={kind}
              className={mascot === kind ? "chosen" : ""}
              onClick={() => setMascot(kind)}
            >
              <Mascot bot={{ ...preview, mascot: kind }} size="small" />
            </button>
          ))}
        </div>
        <div className="color-picker">
          {MASCOT_COLORS.map((value) => (
            <button
              type="button"
              aria-label={`Use ${value} color`}
              key={value}
              className={color === value ? "chosen" : ""}
              style={{ background: value }}
              onClick={() => setColor(value)}
            />
          ))}
          <label className="custom-color" title="Choose any color">
            <input
              aria-label="Choose a custom mascot color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <span>+</span>
          </label>
        </div>
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mochi"
            required
          />
        </label>
        <label className="field">
          <span>What are they great at?</span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Travel planner, thoughtful editor…"
            required
          />
        </label>
        <label className="field">
          <span>How should they work with you?</span>
          <textarea
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Warm, curious and concise. Show me options before big decisions."
            required
          />
        </label>
        <button className="button-primary button-wide" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spinner" size={18} />
          ) : (
            <Sparkles size={17} />
          )}{" "}
          Create teammate
        </button>
      </form>
    </div>
  );
}

function LoginScreen({
  onLogin,
}: {
  onLogin: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-screen">
      <div className="login-card">
        <Logo />
        <span className="login-kicker">Private remote access</span>
        <h1>Welcome back to your studio</h1>
        <p>Enter the access key shown on the computer running OpenBot.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await onLogin(token);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Access key</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              required
            />
          </label>
          <button className="button-primary button-wide">
            {busy ? (
              <LoaderCircle className="spinner" size={17} />
            ) : (
              <KeyRound size={17} />
            )}{" "}
            Unlock OpenBot
          </button>
        </form>
        {error && <p className="panel-error">{error}</p>}
        <small>
          <ShieldCheck size={13} /> The key stays in a secure browser cookie.
        </small>
      </div>
    </main>
  );
}

export function App() {
  const urlParams = new URLSearchParams(window.location.search),
    googleResult = urlParams.get("google"),
    connectorResult = urlParams.get("status"),
    connectorName = urlParams.get("connector"),
    linkedThread = urlParams.get("thread") || "team-room";
  const callbackNotice =
    googleResult === "connected"
      ? "Google is connected"
      : googleResult === "attention"
        ? "Google needs one more step"
        : connectorName && connectorResult === "connected"
          ? `${connectorName === "slack" ? "Slack" : "Notion"} is connected`
          : connectorName && connectorResult === "attention"
            ? `${connectorName === "slack" ? "Slack" : "Notion"} needs another try`
            : null;
  const [state, setState] = useState<AppState | null>(null),
    [activeThreadId, setActiveThreadId] = useState(linkedThread),
    [selectedBotIds, setSelectedBotIds] = useState<string[]>([]),
    [provider, setProvider] = useState<ProviderStatus | null>(null),
    [connectors, setConnectors] = useState<ConnectorStatus | null>(null),
    [panel, setPanelState] = useState<Panel>(panelFromLocation),
    [creatingBot, setCreatingBot] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [sending, setSending] = useState(false),
    [replyingTo, setReplyingTo] = useState<Message | null>(null),
    [skillBotId, setSkillBotId] = useState(""),
    [searchQuery, setSearchQuery] = useState(""),
    [toast, setToast] = useState<string | null>(callbackNotice),
    [authRequired, setAuthRequired] = useState(false),
    [bootError, setBootError] = useState<string | null>(null),
    [connection, setConnection] = useState<ConnectionState>(
      navigator.onLine ? "reconnecting" : "offline",
    ),
    [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null),
    previousRuns = useRef<Record<string, string>>({}),
    previousAlerts = useRef<Set<string> | null>(null);
  const setPanel = useCallback((next: Panel) => {
    setPanelState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("panel", next);
    else url.searchParams.delete("panel");
    url.searchParams.delete("google");
    url.searchParams.delete("connector");
    url.searchParams.delete("status");
    window.history.replaceState(null, "", url);
  }, []);
  const loadState = useCallback(
    async (threadId = activeThreadId, quiet = false) => {
      try {
        const next = await api<AppState>(
          `/api/state?threadId=${encodeURIComponent(threadId)}`,
        );
        setState(next);
        setAuthRequired(false);
        setBootError(null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          setAuthRequired(true);
        else {
          setBootError(
            error instanceof Error ? error.message : "OpenBot could not wake up.",
          );
          if (!quiet)
          setToast(
            error instanceof Error
              ? error.message
              : "OpenBot could not wake up.",
          );
        }
      }
    },
    [activeThreadId],
  );
  const loadConnectors = useCallback(async () => {
    try {
      setConnectors(await api<ConnectorStatus>("/api/connectors"));
    } catch {
      /* the main connection indicator handles server outages */
    }
  }, []);
  useEffect(() => {
    void loadState(activeThreadId);
  }, [activeThreadId, loadState]);
  useEffect(() => {
    if (state || authRequired) return;
    const timer = window.setInterval(
      () => void loadState(activeThreadId, true),
      3_000,
    );
    return () => window.clearInterval(timer);
  }, [activeThreadId, authRequired, loadState, state]);
  useEffect(() => {
    if (!authRequired) {
      api<ProviderStatus>("/api/provider")
        .then(setProvider)
        .catch(() => undefined);
      void loadConnectors();
    }
  }, [authRequired, loadConnectors]);
  useEffect(() => {
    if (authRequired) return;
    const events = new EventSource("/api/events");
    events.onopen = () => setConnection("online");
    events.onerror = () =>
      setConnection(navigator.onLine ? "reconnecting" : "offline");
    events.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type: string };
      if (data.type === "state" || data.type === "draft")
        void loadState(activeThreadId, true);
      if (data.type === "provider")
        api<ProviderStatus>("/api/provider")
          .then(setProvider)
          .catch(() => undefined);
      if (data.type === "connector") void loadConnectors();
    };
    return () => events.close();
  }, [activeThreadId, authRequired, loadConnectors, loadState]);
  useEffect(() => {
    const online = () => setConnection("reconnecting"),
      offline = () => setConnection("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  useEffect(() => {
    if (panel !== "provider" || authRequired) return;
    const refresh = () =>
      api<ProviderStatus>("/api/provider")
        .then(setProvider)
        .catch(() => undefined);
    void refresh();
    const timer = setInterval(refresh, 3_000);
    return () => clearInterval(timer);
  }, [panel, authRequired]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    state?.messages.length,
    state?.runs
      .map(
        (run) =>
          `${run.status}:${run.partialText?.length || 0}:${run.task.stage}:${run.task.steps.filter((step) => step.status === "completed").length}`,
      )
      .join(","),
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchQuery("");
        setPanel("search");
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, [setPanel]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("google")) return;
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => {
    if (!state) return;
    for (const run of state.runs) {
      const prior = previousRuns.current[run.id];
      if (
        !run.parentRunId &&
        prior &&
        prior !== run.status &&
        ["completed", "awaiting_approval", "failed"].includes(run.status) &&
        document.hidden &&
        localStorage.getItem("openbot_push_enabled") !== "1" &&
        Notification.permission === "granted"
      ) {
        const message =
          run.status === "completed"
            ? `${run.botName} finished a task.`
            : run.status === "awaiting_approval"
              ? `${run.botName} needs your okay.`
              : `${run.botName} needs a hand.`;
        new Notification("OpenBot", { body: message, icon: "/icon.svg" });
      }
      previousRuns.current[run.id] = run.status;
    }
    const currentAlerts = new Set(
      state.automationAlerts.map((alert) => alert.id),
    );
    for (const alert of state.automationAlerts) {
      if (
        previousAlerts.current &&
        !previousAlerts.current.has(alert.id) &&
        document.hidden &&
        localStorage.getItem("openbot_push_enabled") !== "1" &&
        Notification.permission === "granted"
      )
        new Notification("OpenBot automation", {
          body: alert.message,
          icon: "/icon.svg",
        });
    }
    previousAlerts.current = currentAlerts;
  }, [state]);

  const mutate = async (
    operation: () => Promise<unknown>,
    success?: string,
  ) => {
    try {
      await operation();
      await loadState(activeThreadId, true);
      if (success) setToast(success);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      throw error;
    }
  };
  const enableNotifications = async (): Promise<boolean> => {
    if (!("Notification" in window)) {
      setToast("Notifications are not supported here");
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setToast("Notifications stayed off");
      return false;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      localStorage.removeItem("openbot_push_enabled");
      setToast("Notifications work while OpenBot is open on this device");
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register("/sw.js");
      const { publicKey } = await api<{ publicKey: string }>("/api/notifications/key");
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushApplicationKey(publicKey),
      });
      const saved = subscription.toJSON();
      if (!saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) throw new Error("This device did not finish notification setup.");
      await api("/api/notifications/subscriptions", { method: "POST", body: JSON.stringify({ endpoint: saved.endpoint, keys: saved.keys }) });
      localStorage.setItem("openbot_push_enabled", "1");
      setToast("Background notifications are on");
      return true;
    } catch (error) {
      localStorage.removeItem("openbot_push_enabled");
      setToast(error instanceof Error ? error.message : "OpenBot could not enable background notifications here");
      return false;
    }
  };
  const selectThread = (id: string) => {
    setActiveThreadId(id);
    setSidebarOpen(false);
    setReplyingTo(null);
    const thread = state?.threads.find((item) => item.id === id);
    setSelectedBotIds(thread?.botId ? [thread.botId] : []);
  };
  const activeThread =
    state?.threads.find((thread) => thread.id === activeThreadId) ||
    state?.threads.find((thread) => thread.id === "team-room") ||
    state?.threads[0] ||
    null;
  const activeBot = activeThread?.botId
    ? state?.bots.find((bot) => bot.id === activeThread.botId) || null
    : null;
  const skillBot =
    state?.bots.find((bot) => bot.id === skillBotId) ||
    activeBot ||
    state?.bots[0] ||
    null;
  const activeRuns =
    state?.runs
      .filter(
        (run) =>
          (!run.parentRunId || run.status === "awaiting_approval") &&
          !["completed", "cancelled"].includes(run.status),
      )
      .reverse() || [];
  const updateBot = async (id: string, patch: Partial<Bot>) =>
    mutate(
      () =>
        api(`/api/bots/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      "Saved",
    );
  const updateThread = async (
    id: string,
    patch: Partial<Pick<Thread, "section" | "pinned" | "hidden">>,
  ) =>
    mutate(() =>
      api(`/api/threads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const openSearch = (query = "") => {
    setSearchQuery(query);
    setPanel("search");
    setSidebarOpen(false);
  };
  const openPanel = (next: Panel) => setPanel(next);

  if (authRequired)
    return (
      <LoginScreen
        onLogin={async (token) => {
          await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ token }),
          });
          await loadState(activeThreadId);
        }}
      />
    );
  if (!state || !activeThread)
    return (
      <StudioStartup
        error={bootError}
        onRetry={() => {
          setBootError(null);
          void loadState(activeThreadId);
        }}
      />
    );

  return (
    <div className="app-shell">
      <Sidebar
        state={state}
        provider={provider}
        connectors={connectors}
        activeThreadId={activeThreadId}
        onSelectThread={selectThread}
        onCreateBot={() => setCreatingBot(true)}
        onOpenPanel={openPanel}
        onOpenSearch={openSearch}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="conversation">
        <ConversationHeader
          threadTitle={activeThread.title}
          activeBot={activeBot}
          roomBots={state.bots}
          runner={state.runner}
          onMenu={() => setSidebarOpen(true)}
          onOpenPanel={openPanel}
          connection={connection}
        />
        <div className="message-scroll">
          <div className="conversation-intro">
            {activeBot ? (
              <>
                <Mascot bot={activeBot} size="large" />
                <h2>{activeBot.name}</h2>
                <p>{activeBot.role}</p>
                <span>{shortModel(activeBot.model)}</span>
              </>
            ) : (
              <>
                <div className="studio-stage">
                  <RoomCluster bots={state.bots} hero />
                  <span className="stage-spark">✦</span>
                  <span className="stage-spark stage-spark-small">·</span>
                </div>
                <h2>Your studio</h2>
                <p>
                  Ask naturally. OpenBot picks the right teammate, or you can
                  choose one before sending.
                </p>
                <span>{state.bots.map((bot) => bot.name).join(" · ")}</span>
              </>
            )}
          </div>
          <div className="messages">
            {state.messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                previous={state.messages[index - 1]}
                macAccessEnabled={state.settings.macAccessEnabled}
                run={
                  message.runId
                    ? state.runs.find((run) => run.id === message.runId)
                    : undefined
                }
                onReply={setReplyingTo}
                onReact={(item, emoji) =>
                  void mutate(() =>
                    api(`/api/messages/${item.id}/reactions`, {
                      method: "POST",
                      body: JSON.stringify({ emoji }),
                    }),
                  )
                }
              />
            ))}
            <div className="run-list">
              {activeRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  onApprove={(id) =>
                    void mutate(() =>
                      api(`/api/runs/${id}/approve`, { method: "POST" }),
                    )
                  }
                  onCancel={(id) =>
                    void mutate(() =>
                      api(`/api/runs/${id}/cancel`, { method: "POST" }),
                    )
                  }
                />
              ))}
            </div>
            <div ref={messagesEnd} />
          </div>
        </div>
        <Composer
          threadId={activeThreadId}
          sharedDraft={state.draft}
          bots={
            activeThread.kind === "room"
              ? state.bots
              : activeBot
                ? [activeBot]
                : []
          }
          apps={connectors?.catalog}
          skills={state.workflows}
          isRoom={activeThread.kind === "room"}
          selectedBotIds={selectedBotIds}
          setSelectedBotIds={setSelectedBotIds}
          workingBotIds={state.runs
            .filter((run) =>
              ["running", "waiting_for_teammate"].includes(run.status),
            )
            .map((run) => run.botId)}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onNotice={setToast}
          onSend={async (body, files) => {
            setSending(true);
            try {
              const uploaded = await Promise.all(
                files.map((file) =>
                  api<Attachment>(
                    `/api/attachments?threadId=${encodeURIComponent(activeThreadId)}`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/octet-stream",
                        "X-File-Name": encodeURIComponent(file.name),
                        "X-File-Type": file.type || "application/octet-stream",
                      },
                      body: file,
                    },
                  ),
                ),
              );
              await mutate(() =>
                api("/api/messages", {
                  method: "POST",
                  body: JSON.stringify({
                    threadId: activeThreadId,
                    body,
                    targetBotIds: selectedBotIds,
                    attachmentIds: uploaded.map((attachment) => attachment.id),
                    replyToId: replyingTo?.id || null,
                  }),
                }),
              );
            } finally {
              setSending(false);
            }
          }}
          sending={sending}
        />
      </main>
      {panel === "control" && (
        <Sheet
          title="Control center"
          subtitle="Your studio at a glance"
          onClose={() => setPanel(null)}
        >
          <ControlPanel
            state={state}
            onNotify={() => void enableNotifications()}
            onOpenProvider={() => setPanel("provider")}
            onOpenRemote={() => setPanel("remote")}
            onOpenConnectors={() => setPanel("connectors")}
            onOpenProjects={() => setPanel("projects")}
            onOpenSkills={() => {
              setSkillBotId(state.bots[0]?.id || "");
              setPanel("teach");
            }}
            onSetMacAccess={async (enabled) => {
              await mutate(
                () =>
                  api("/api/settings", {
                    method: "PATCH",
                    body: JSON.stringify({ macAccessEnabled: enabled }),
                  }),
                enabled
                  ? "Every teammate can now use visible Mac files and apps"
                  : "Mac access is off for the studio",
              );
            }}
          />
        </Sheet>
      )}
      {panel === "live" && (
        <Sheet
          wide
          title="Live Studio"
          subtitle="Watch the team, step in, and keep work moving"
          onClose={() => setPanel(null)}
        >
          <LiveStudioPanel
            state={state}
            onOpenThread={(threadId) => {
              setPanel(null);
              selectThread(threadId);
            }}
            onApprove={async (runId) => {
              await mutate(() =>
                api(`/api/runs/${runId}/approve`, { method: "POST" }),
              );
            }}
            onCancel={async (runId) => {
              await mutate(() =>
                api(`/api/runs/${runId}/cancel`, { method: "POST" }),
              );
            }}
            onUpdateThread={updateThread}
            onOpenControl={() => setPanel("control")}
            onNotice={setToast}
          />
        </Sheet>
      )}
      {panel === "search" && (
        <Sheet
          wide
          title="Search your studio"
          subtitle="Messages, files, automations, skills and teammates"
          onClose={() => setPanel(null)}
        >
          <SearchPanel
            initialQuery={searchQuery}
            onOpenResult={(result) => {
              setPanel(null);
              selectThread(result.threadId);
              window.setTimeout(() => {
                document
                  .getElementById(`message-${result.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 350);
            }}
          />
        </Sheet>
      )}
      {panel === "connectors" && (
        <Sheet
          wide
          title="Apps & tools"
          subtitle="Useful connections, under your control"
          onClose={() => setPanel(null)}
        >
          <ConnectorPanel
            status={connectors}
            bots={state.bots}
            onRefresh={loadConnectors}
            onNotice={setToast}
            onStartWorkflow={async (prompt) => {
              try {
                setPanel(null);
                setActiveThreadId("team-room");
                setSelectedBotIds([]);
                await api("/api/messages", {
                  method: "POST",
                  body: JSON.stringify({
                    threadId: "team-room",
                    body: prompt,
                    targetBotIds: [],
                    attachmentIds: [],
                  }),
                });
                await loadState("team-room", true);
                setToast("Started in the studio");
              } catch (reason) {
                setToast(
                  reason instanceof Error
                    ? reason.message
                    : "Could not start that workflow.",
                );
              }
            }}
          />
        </Sheet>
      )}
      {panel === "projects" && (
        <Sheet
          wide
          title="Code projects"
          subtitle="Approved folders for building and testing"
          onClose={() => setPanel(null)}
        >
          <CodeProjectsPanel bots={state.bots} onNotice={setToast} />
        </Sheet>
      )}
      {panel === "remote" && (
        <Sheet
          title="Phone remote"
          subtitle="Speak, check in and approve from anywhere"
          onClose={() => setPanel(null)}
        >
          <RemotePanel
            bots={state.bots}
            runner={state.runner}
            installPrompt={installPrompt}
            onInstalled={() => setInstallPrompt(null)}
            onNotice={setToast}
          />
        </Sheet>
      )}
      {panel === "provider" && (
        <Sheet
          title="Your AI connections"
          subtitle="Bring your own models and subscriptions"
          onClose={() => setPanel(null)}
        >
          <ProviderPanel
            provider={provider}
            bots={state.bots}
            onUpdateBot={updateBot}
            onAdd={async (input) => {
              await mutate(
                () =>
                  api("/api/providers", {
                    method: "POST",
                    body: JSON.stringify(input),
                  }),
                "Connection saved privately",
              );
              setProvider(await api("/api/provider"));
            }}
            onConnect={async (providerId) => {
              const attempt = await api<ProviderLoginAttempt>(
                "/api/provider/connect",
                { method: "POST", body: JSON.stringify({ providerId }) },
              );
              setToast("Secure sign-in started");
              return attempt;
            }}
            onFinish={async (attemptId, code) => {
              await api(`/api/provider/connect/${attemptId}/callback`, {
                method: "POST",
                body: JSON.stringify({ code }),
              });
              setProvider(await api("/api/provider"));
              setToast("Connection ready");
            }}
          />
        </Sheet>
      )}
      {panel === "bot" && activeBot && (
        <Sheet
          title={`${activeBot.name}’s details`}
          subtitle="Role, limits and capabilities"
          onClose={() => setPanel(null)}
        >
          <BotPanel
            bot={activeBot}
            thread={activeThread}
            provider={provider}
            apps={connectors?.access}
            onSave={updateBot}
            onUpdateThread={(patch) => updateThread(activeThread.id, patch)}
            onDuplicate={async () => {
              const duplicate = await api<Bot>(
                `/api/bots/${activeBot.id}/duplicate`,
                {
                  method: "POST",
                },
              );
              await loadState(duplicate.threadId, true);
              setPanel(null);
              setActiveThreadId(duplicate.threadId);
              setSelectedBotIds([duplicate.id]);
              setToast(`${duplicate.name} joined your studio`);
            }}
            onOpenTeach={() => {
              setSkillBotId(activeBot.id);
              setPanel("teach");
            }}
          />
        </Sheet>
      )}
      {panel === "files" && activeBot && (
        <Sheet
          title={`${activeBot.name}’s workspace`}
          subtitle="Persistent files, private to this teammate"
          onClose={() => setPanel(null)}
        >
          <FilesPanel bot={activeBot} />
        </Sheet>
      )}
      {panel === "computer" && activeBot && (
        <Sheet
          title={`${activeBot.name}’s computer`}
          subtitle="A persistent workspace and private browser"
          onClose={() => setPanel(null)}
        >
          <ComputerPanel
            bot={activeBot}
            onTeach={() => {
              setSkillBotId(activeBot.id);
              setPanel("teach");
            }}
          />
        </Sheet>
      )}
      {panel === "teach" && skillBot && (
        <Sheet
          wide
          title="Skill Library"
          subtitle="Teach once, reuse safely, and keep every version"
          onClose={() => setPanel(null)}
        >
          <TeachPanel
            bot={skillBot}
            bots={state.bots}
            onBotChange={setSkillBotId}
            onNotice={setToast}
            onUse={async (workflow) => {
              setPanel(null);
              const owner = state.bots.find((bot) => bot.id === workflow.botId) || skillBot;
              selectThread(owner.threadId);
              await api("/api/messages", {
                method: "POST",
                body: JSON.stringify({
                  threadId: owner.threadId,
                  body: `/${workflow.skillSlug}`,
                  targetBotIds: [owner.id],
                  attachmentIds: [],
                }),
              });
              await loadState(owner.threadId, true);
              setToast(`${workflow.name} started`);
            }}
          />
        </Sheet>
      )}
      {panel === "routines" && (
        <Sheet
          title="Automations"
          subtitle="Reliable work that wakes up at the right moment"
          onClose={() => setPanel(null)}
        >
          <RoutinesPanel
            routines={state.routines}
            events={state.automationEvents}
            alerts={state.automationAlerts}
            runner={state.runner}
            bots={state.bots}
            onCreate={async (input) => {
              const result = await api<RoutineSaveResult>("/api/routines", {
                method: "POST",
                body: JSON.stringify(input),
              });
              await loadState(activeThreadId, true);
              setToast("Automation created");
              return result;
            }}
            onUpdate={async (routine, input) => {
              const result = await api<RoutineSaveResult>(
                `/api/routines/${routine.id}`,
                { method: "PATCH", body: JSON.stringify(input) },
              );
              await loadState(activeThreadId, true);
              setToast("Automation updated");
              return result;
            }}
            onToggle={async (routine) => {
              await mutate(() =>
                api(`/api/routines/${routine.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ enabled: !routine.enabled }),
                }),
              );
            }}
            onDelete={async (routine) => {
              await mutate(
                () => api(`/api/routines/${routine.id}`, { method: "DELETE" }),
                "Automation deleted — past results were kept",
              );
            }}
            onRun={async (routine) => {
              await mutate(
                () =>
                  api(`/api/routines/${routine.id}/run`, {
                    method: "POST",
                    body: JSON.stringify({ confirmed: true }),
                  }),
                "Test run started",
              );
            }}
            onReplay={async (event) => {
              await mutate(
                () =>
                  api(`/api/automation-events/${event.id}/replay`, {
                    method: "POST",
                  }),
                "Event queued again",
              );
            }}
            onRotateSecret={async (routine) => {
              const result = await api<RoutineSaveResult>(
                `/api/routines/${routine.id}/rotate-secret`,
                { method: "POST" },
              );
              await loadState(activeThreadId, true);
              setToast("New signing secret created");
              return result;
            }}
            onResolveAlert={async (alert) => {
              await mutate(
                () =>
                  api(`/api/automation-alerts/${alert.id}/resolve`, {
                    method: "POST",
                  }),
                "Alert cleared",
              );
            }}
            onOpenResult={(routine) => {
              setPanel(null);
              selectThread(routine.threadId);
            }}
            onProtectRunner={async () => {
              await api("/api/runner/background", { method: "POST" });
              await loadState(activeThreadId, true);
              setToast("Background protection is on");
            }}
            onUnprotectRunner={async () => {
              await api("/api/runner/background", { method: "DELETE" });
              await loadState(activeThreadId, true);
              setToast("Background protection is off");
            }}
            onWakeRunner={async () => {
              await api("/api/runner/wake", { method: "POST" });
              await loadState(activeThreadId, true);
              setToast("OpenBot checked for waiting work");
            }}
            onEnableNotifications={enableNotifications}
          />
        </Sheet>
      )}
      {creatingBot && (
        <CreateBotDialog
          provider={provider}
          onClose={() => setCreatingBot(false)}
          onCreate={async (input) => {
            const bot = await api<Bot>("/api/bots", {
              method: "POST",
              body: JSON.stringify(input),
            });
            await loadState(bot.threadId, true);
            setActiveThreadId(bot.threadId);
            setSelectedBotIds([bot.id]);
            setToast(`${bot.name} joined your studio`);
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
