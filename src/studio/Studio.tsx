import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Layers3,
  LoaderCircle,
  MessageCircle,
  Monitor,
  Pin,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { BrowserSignInPanel } from "../components/BrowserSignInPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Temporal } from "@js-temporal/polyfill";
import { calendarMonthDays } from "../shared/calendar-grid";
import { activeNowBots } from "../shared/presence";
import type {
  AppState,
  Bot,
  ConnectorCatalogEntry,
  ConnectorStatus,
  Message,
  Run,
  Routine,
  Thread,
} from "../shared/types";
import type { CommunitySkill } from "../shared/extensions";
import { ConnectorIcon } from "../ConnectorIcon";
import { Character } from "./Character";
import { CreateTeammate } from "./CreateTeammate";
import { ConversationContext } from "./ConversationContext";
import { ConversationActions } from "./ConversationActions";
import { ComputerTakeover } from "./LiveComputer";
import { GroupEditor } from "./GroupEditor";
import { AutoReviewRules } from "./AutoReviewRules";
import { useConversationDraft } from "./useConversationDraft";
import { useConversationAttachments } from "./useConversationAttachments";
import { RunControls } from "./RunControls";
import { ConversationProgress } from "./ConversationProgress";
import { DeliveryReceipt, DeliveredFile, DeliveryCard } from "./DeliveryReceipt";
import { WorkReceipt } from "../CapabilityPanels";
import { cancelledRunForTrigger, latestCancelledWithoutTrigger } from "./cancelled-run-outcome";
import { groupConsecutiveActionEvents } from "./action-event-groups";
import { MarkdownMessage } from "../MarkdownMessage";
import { ChoiceMenu } from "./ChoiceMenu";
import { AppearanceEditor } from "./AppearanceEditor";
import { useAppearance, type Appearance } from "./useAppearance";
import "./character-context.css";
import { capabilityTitles, isCapabilityPanel, type CapabilityPanel } from "./capability-navigation";
const CapabilityPanelHost = lazy(() => import("./CapabilityPanelHost").then((module) => ({ default: module.CapabilityPanelHost })));

type Page = "home" | "activity" | "schedule" | "library" | "chat";
type Detail =
  | { kind: "create" }
  | { kind: "group"; threadId?: string }
  | { kind: "workspace" }
  | { kind: "context" }
  | { kind: "teammate"; bot: Bot }
  | { kind: "run"; run: Run }
  | { kind: "app"; app: ConnectorCatalogEntry }
  | { kind: "skill"; skill: CommunitySkill }
  | { kind: "settings" }
  | { kind: "search" };
const activeStates = ["running", "queued", "waiting_for_teammate"];
const labelFor = (status: string) =>
  ({
    running: "Working",
    queued: "Up next",
    waiting_for_teammate: "Consulting the team",
    awaiting_approval: "Needs your review",
    completed: "Finished",
    failed: "Needs a hand",
    cancelled: "Stopped",
  })[status] || status;
const dayKey = (date: string | number | Date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const timeText = (date: string) =>
  new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dateText = (date: string) =>
  new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("openbot:locked"));
    throw new Error(
      "This studio is locked. Unlock it to continue.",
    );
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "That didn’t work. Please try again.");
  return result as T;
}
function Face({
  bot,
  size = 38,
}: {
  bot: Pick<Bot, "name" | "color" | "mascot" | "status">;
  size?: number;
}) {
  return (
    <Character
      name={bot.name}
      color={bot.color}
      variant={bot.mascot}
      status={bot.status}
      size={size}
    />
  );
}
function FaceGroup({ bots, size = 50 }: { bots: Bot[]; size?: number }) {
  return (
    <div className="faces">
      {bots.slice(0, 3).map((bot) => (
        <Face key={bot.id} bot={bot} size={size} />
      ))}
    </div>
  );
}
// Pinned teammates live above the list as large avatars —glanceable like a
// pinned chat, unpinned with one tap. The scrolling list never duplicates them.
function PinnedZone({ items, bots, onOpen, onUnpin }: {
  items: Thread[];
  bots: Bot[];
  onOpen: (threadId: string) => void;
  onUnpin: (item: Thread) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="pinned-zone">
      <span className="pinned-label">Pinned</span>
      <div className="pinned-avatars">
        {items.map((item) => {
          const bot = bots.find((b) => b.threadId === item.id);
          return (
            <div key={item.id} className="pinned-avatar">
              <button
                type="button"
                className="pinned-open"
                aria-label={`Open ${item.title}`}
                title={item.title}
                onClick={() => onOpen(item.id)}
              >
                {bot ? (
                  <Face bot={bot} size={52} />
                ) : (
                  <span className="room-mark">
                    <MessageCircle size={26} strokeWidth={1.3} />
                  </span>
                )}
                <span className="pinned-name">{item.title}</span>
                {item.needsYou && <i className="pinned-dot" aria-label="Needs you" />}
              </button>
              <button
                type="button"
                className="pinned-unpin"
                aria-label={`Unpin ${item.title}`}
                title="Unpin"
                onClick={() => onUnpin(item)}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-rule" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
function CancelledRunOutcome({ run, onReview, dated = false }: { run: Run; onReview: () => void; dated?: boolean }) {
  return <div className="chat-event cancelled-run-outcome" role="status" data-event="run_stopped">
    <span className="chat-event-mark" aria-hidden="true"><MessageCircle size={14} /></span>
    <span><strong>{run.botName} · Stopped{dated && run.finishedAt ? ` · ${dateText(run.finishedAt)}` : ""}</strong><button type="button" className="text-action" onClick={onReview}>Review saved progress</button></span>
  </div>;
}
function eventTitle(message: Message): string {
  const data = message.eventData || {};
  switch (message.eventType) {
    case "run_stopped":
    case "action_completed":
      return String(data.title || "Task update");
    case "routine_created":
      return `Created Routine ${data.name ?? message.body}`;
    case "routine_run":
      return `${data.name ?? "Routine"} started`;
    case "handoff":
      return `${data.fromName ?? "Teammate"} handed off to ${data.toName ?? "a teammate"}`;
    case "teammate_message":
      return `${data.fromName ?? "Teammate"} ${data.expectsReply === "true" ? "asked" : "messaged"} ${data.toName ?? "a teammate"}`;
    default:
      return "Studio event";
  }
}
function eventDetail(message: Message): string {
  const data = message.eventData || {};
  switch (message.eventType) {
    case "routine_created":
      return `${data.schedule ?? ""}${data.enabled === "false" ? " · Paused" : ""}`;
    case "routine_run":
      return `${data.source === "manual" ? "Test run" : `From ${data.source ?? "schedule"}`}${data.waiting === "true" ? " · Needs your okay" : ""}`;
    case "handoff":
      return String(data.task ?? message.body).replace(/\s+/g, " ").trim();
    case "teammate_message":
      return data.expectsReply === "true" ? "Reply requested" : "Update shared";
    default:
      return message.body;
  }
}

export function Studio() {
  const { appearance, setAppearance } = useAppearance();
  const [page, setPage] = useState<Page>("chat"),
    [thread, setThread] = useState(() => new URLSearchParams(window.location.search).get("thread")?.slice(0, 128) || "team-room");
  const [state, setState] = useState<AppState | null>(null),
    [connections, setConnections] = useState<ConnectorStatus | null>(null),
    [skills, setSkills] = useState<CommunitySkill[]>([]);
  const [error, setError] = useState(""),
    [draftNotice, setDraftNotice] = useState(""),
    [online, setOnline] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const sendError = sendErrors[thread] || "";
  const setSendError = (message: string) => setSendErrors((items) => ({ ...items, [thread]: message }));
  const firstLoad = useRef(true);
  const [detail, setDetail] = useState<Detail | null>(() => new URLSearchParams(location.search).get("panel") === "settings" ? {kind: "settings"} : null),
    [recipient, setRecipient] = useState(""),
    [sending, setSending] = useState(false);
  const [capability, setCapability] = useState<CapabilityPanel | null>(() => {
    const value = new URLSearchParams(location.search).get("panel");
    return isCapabilityPanel(value) ? value : null;
  });
  function openCapability(next: CapabilityPanel | null, targetThread?: string) {
    setDetail(null); setCapability(next);
    if (targetThread) setThread(targetThread);
    const url = new URL(location.href); url.pathname = "/";
    if (next) url.searchParams.set("panel", next); else url.searchParams.delete("panel");
    if (targetThread) url.searchParams.set("thread", targetThread);
    history.pushState(null, "", url);
  }
  function openSettings() {
    setCapability(null);
    setDetail({ kind: "settings" });
    const url = new URL(location.href);
    url.searchParams.set("panel", "settings");
    history.pushState(null, "", url);
  }
  useEffect(() => {
    const follow = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      // An explicit target (e.g. the provider setup link in the creation
      // sheet, "opens separately so you won't lose this draft") wins over
      // in-page capability routing.
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, location.href), panel = url.searchParams.get("panel");
      if (url.origin !== location.origin || !["/", "/studio.html"].includes(url.pathname) || !isCapabilityPanel(panel)) return;
      event.preventDefault(); openCapability(panel, url.searchParams.get("thread") || undefined);
    };
    const restore = () => {
      const url = new URL(location.href), panel = url.searchParams.get("panel");
      setCapability(isCapabilityPanel(panel) ? panel : null); setDetail(panel === "settings" ? {kind: "settings"} : null);
      if (url.searchParams.get("thread")) setThread(url.searchParams.get("thread")!);
    };
    document.addEventListener("click", follow); window.addEventListener("popstate", restore);
    return () => { document.removeEventListener("click", follow); window.removeEventListener("popstate", restore); };
  }, []);
  const composerDraft = useConversationDraft(thread, state?.draft);
  const attached = useConversationAttachments(thread);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = composerDraft.body,
    setDraft = composerDraft.setBody;
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null),
    [mentionAt, setMentionAt] = useState(0);
  const mentionChoices = useMemo(() => {
    const current = state?.threads.find((item) => item.id === thread) || null;
    if (!current || current.kind !== "room") return [];
    const members = current.botIds
      ? (state?.bots || []).filter((bot) => current.botIds?.includes(bot.id))
      : state?.bots || [];
    return [
      ...members.map((bot) => ({ key: bot.id, insert: bot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: bot.name, detail: bot.role, face: <Face bot={bot} size={22} /> })),
      { key: "everyone", insert: "everyone", label: "everyone", detail: "The whole team", face: <MessageCircle size={16} /> },
    ];
  }, [state, thread]);
  const visibleMentions = mention
    ? mentionChoices.filter((choice) => choice.insert.includes(mention.query.toLowerCase()))
    : [];
  const readMention = (value: string, caret: number) => {
    const match = value.slice(0, caret).match(/(?:^|\s)@([A-Za-z0-9_-]*)$/);
    return match ? { start: caret - match[1]!.length - 1, query: match[1]! } : null;
  };
  const applyMention = (insert: string) => {
    const textarea = input.current;
    if (!textarea || !mention) return;
    const caret = textarea.selectionStart;
    const before = draft.slice(0, mention.start);
    const next = `${before}@${insert} ${draft.slice(caret).replace(/^\s+/, "")}`;
    setDraft(next);
    setMention(null);
    requestAnimationFrame(() => {
      const position = before.length + insert.length + 2;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  };
  const [libraryTab, setLibraryTab] = useState<"apps" | "skills">("apps"),
    [query, setQuery] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [takeoverBot, setTakeoverBot] = useState<Bot | null>(null);
  const [signInPane, setSignInPane] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1050);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1049px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // Split view: when a teammate waits on a private sign-in in this
  // conversation, open the live website beside the chat, the way a second
  // column of work belongs next to the conversation. It closes itself once
  // the handoff is decided, and the task card reopens it on request.
  const pendingSignInId = useMemo(() => {
    if (!state || narrow) return null;
    const threadRuns = new Set(state.runs.filter((run) => run.threadId === thread).map((run) => run.id));
    return state.approvals.find((approval) => approval.kind === "browser" && approval.requiresSignIn === true && approval.status === "pending" && threadRuns.has(approval.runId))?.id || null;
  }, [state, thread, narrow]);
  useEffect(() => { setSignInPane(pendingSignInId); }, [pendingSignInId]);
  const [calendarDate, setCalendarDate] = useState(dayKey(new Date()));
  const [month, setMonth] = useState(dayKey(new Date()).slice(0, 7) + "-01");
  const input = useRef<HTMLTextAreaElement>(null),
    messagesEnd = useRef<HTMLDivElement>(null),
    messageScroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true),
    requestNumber = useRef(0);
  useEffect(() => {
    const url = new URL(window.location.href); url.searchParams.set("thread", thread);
    window.history.replaceState(null, "", url);
  }, [thread]);
  useEffect(() => {
    const abort = new AbortController(),
      current = ++requestNumber.current;
    void api<AppState>(
      `/api/state?threadId=${encodeURIComponent(thread)}`,
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (abort.signal.aborted || current !== requestNumber.current) return;
        setState(result);
        if (firstLoad.current) {
          firstLoad.current = false;
          setRecipient(result.bots.find((bot) => bot.threadId === result.activeThreadId)?.id || "");
        }
        if (result.activeThreadId !== thread) setThread(result.activeThreadId);
        setError("");
        setOnline(true);
      })
      .catch((reason: Error) => {
        if (!abort.signal.aborted) {
          setError(reason.message);
          setOnline(false);
        }
      });
    return () => abort.abort();
  }, [thread, refresh]);
  useEffect(() => {
    const events = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRefresh((n) => n + 1), 250);
    };
    events.onmessage = update;
    events.onopen = () => {
      setOnline(true);
      update();
    };
    events.onerror = () => setOnline(false);
    const fallback = setInterval(update, 15_000);
    window.addEventListener("focus", update);
    return () => {
      events.close();
      clearTimeout(timer);
      clearInterval(fallback);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    if (page === "library") {
      void Promise.all([
        api<ConnectorStatus>("/api/connectors", undefined, abort.signal),
        api<{ skills: CommunitySkill[] }>(
          "/api/extensions",
          undefined,
          abort.signal,
        ),
      ])
        .then(([apps, extensions]) => {
          if (!abort.signal.aborted) {
            setConnections(apps);
            setSkills(extensions.skills);
          }
        })
        .catch((reason: Error) => {
          if (!abort.signal.aborted) setError(reason.message);
        });
    }
    return () => abort.abort();
  }, [page, refresh]);
  useEffect(() => {
    if (page === "chat" && nearBottom.current)
      messagesEnd.current?.scrollIntoView({ block: "end" });
  }, [state?.messages, state?.runs, page]);
  useEffect(() => {
    setDetail((current) => {
      if (current?.kind !== "run" || !state) return current;
      const fresh = [...state.studioRuns, ...state.runs].find(
        (run) => run.id === current.run.id,
      );
      return fresh ? { kind: "run", run: fresh } : current;
    });
  }, [state]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDetail({ kind: "search" });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const openThread = (id: string) => {
    setThread(id);
    setPage("chat");
    setDetail(null);
    nearBottom.current = true;
    const bot = state?.bots.find((item) => item.threadId === id);
    setRecipient(bot?.id || "");
  };
  const navigate = (next: Page) => {
    setPage(next);
    setQuery("");
    setDetail(null);
    setCapability(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("panel")) {
      url.searchParams.delete("panel");
      window.history.pushState(null, "", url);
    }
  };
  const startPrompt = (text: string) => {
    setPage("chat");
    if (draft.trim())
      setDraftNotice(
        "Your draft is still here. Send it or clear it before starting something new.",
      );
    else {
      setDraft(text);
      setDraftNotice("");
    }
    setTimeout(() => input.current?.focus(), 0);
  };
  const botReady = Boolean(
    state?.bots.some(
      (bot) =>
        (!recipient || bot.id === recipient) &&
        bot.providerInstanceId &&
        bot.model,
    ),
  );
  const budgetBot = state?.bots.find(bot => bot.id === (recipient || state.threads.find(item => item.id === thread)?.botId));
  const budgetReached = budgetBot && budgetBot.weeklyTokenBudget > 0 && budgetBot.tokensUsedThisWeek >= budgetBot.weeklyTokenBudget;
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (
      (!draft.trim() && !attached.files.length) ||
      sending ||
      attached.uploading ||
      !attached.ready ||
      !composerDraft.ready ||
      !state ||
      state.activeThreadId !== thread ||
      !online
    )
      return;
    // No AI chosen yet: sending would only fail on the host. Open the
    // chooser right away; the draft stays typed and ready.
    if (!botReady) {
      setSendError("");
      openCapability("provider");
      return;
    }
    const body = draft.trim(),
      targetThread =
        page === "chat"
          ? thread
          : recipient
            ? state.bots.find((bot) => bot.id === recipient)!.threadId
            : "team-room";
    setSending(true);
    setSendError("");
    const sentDraft = composerDraft.capture();
    const sentFiles = attached.files.map((file) => file.id);
    try {
      await api("/api/messages", {
        threadId: targetThread,
        body,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        targetBotIds: recipient ? [recipient] : [],
        attachmentIds: sentFiles,
        replyToId: null,
      });
      composerDraft.clearSent(sentDraft);
      attached.clear(targetThread, sentFiles);
      setRefresh((n) => n + 1);
    } catch (reason) {
      setSendError(
        reason instanceof Error
          ? reason.message
          : "Your message wasn’t sent. It’s still here to try again.",
      );
    } finally {
      setSending(false);
    }
  };
  const active =
    state?.studioRuns.filter(
      (run) => !run.parentRunId && activeStates.includes(run.status),
    ) || [];
  const conversationFiles = useMemo(() => state?.messages.flatMap((message) => message.attachments) || [], [state?.messages]);
  const attention =
    state?.studioRuns.filter((run) =>
      ["failed", "awaiting_approval"].includes(run.status),
    ) || [];
  const uncertain =
    state?.approvedActions.filter((action) => action.status === "uncertain") ||
    [];
  const yoloMode = state?.settings.yoloMode === true;
  const [modeBusy, setModeBusy] = useState(false);
  async function toggleMode() {
    if (modeBusy) return;
    const next = !yoloMode;
    if (next && !window.confirm("YOLO mode auto-approves every new review exactly as if you had approved it instantly. Sign-ins, access grants and unapprovable reviews still pause. Turn it on?")) return;
    setModeBusy(true);
    try {
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yoloMode: next }) });
      if (!response.ok) throw new Error("The mode could not be changed.");
      setRefresh((value) => value + 1);
    } catch {
      setError("The mode could not be changed. Try again.");
    } finally {
      setModeBusy(false);
    }
  }
  const alerts =
    state?.automationAlerts.filter((alert) => !alert.resolvedAt) || [];
  const otherApprovals =
    state?.approvals.filter(
      (approval) => !attention.some((run) => run.id === approval.runId),
    ) || [];
  const attentionCount =
    attention.length + uncertain.length + alerts.length + otherApprovals.length;
  const finished =
    state?.studioRuns.filter(
      (run) => !run.parentRunId && run.status === "completed",
    ) || [];
  const upcoming =
    state?.routines
      .filter((routine) => routine.enabled && routine.nextRunAt)
      .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!)) || [];
  const threadTitle =
    state?.threads.find((item) => item.id === thread)?.title || "Conversation";
  const actionGroups = groupConsecutiveActionEvents(state?.messages || []);
  const actionGroupByFirstId = new Map(actionGroups.map((group) => [group[0]!.id, group]));
  const actionGroupMemberIds = new Set(actionGroups.flatMap((group) => group.slice(1).map((message) => message.id)));
  const conversationBot =
    page === "chat"
      ? state?.bots.find((bot) => bot.threadId === thread)
      : undefined;
  const conversationThread = page === "chat" ? state?.threads.find((item) => item.id === thread) : undefined;
  const title =
    page === "chat"
      ? threadTitle
      : {
          home: "Chats",
          activity: "Activity",
          schedule: "Schedule",
          library: "Library",
        }[page];
  const navItems = [
    ["home", "Chats", MessageCircle],
    ["activity", "Activity", Layers3],
    ["schedule", "Schedule", CalendarDays],
    ["library", "Library", FileText],
  ] as const;

  const composer = (
    <form
      className={`composer ${page === "chat" ? "composer-chat" : ""}`}
      onSubmit={send}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label="Choose files"
        onChange={(event) => {
          void attached.add(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      {attached.files.length > 0 && (
        <div className="compose-files">
          {attached.files.map((file) => (
            <span key={file.id}>
              <FileText size={14} />
              {file.name}
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => attached.remove(file.id)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="studio-message">
        Message your team
      </label>
      <textarea
        ref={input}
        id="studio-message"
        value={draft}
        disabled={!composerDraft.ready}
        aria-busy={!composerDraft.ready}
        onChange={(event) => {
          setDraft(event.target.value);
          setDraftNotice("");
          const info = readMention(event.target.value, event.target.selectionStart);
          setMention(info);
          setMentionAt(0);
        }}
        onSelect={(event) => {
          const info = readMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0);
          setMention(info);
        }}
        placeholder={
          !composerDraft.ready
            ? "Restoring your draft…"
            : conversationBot
            ? `Message ${conversationBot.name}…`
            : page === "chat"
              ? "Message your team…"
              : "Ask anything. Make a plan. Get something done."
        }
        rows={1}
        onKeyDown={(event) => {
          if (mention && visibleMentions.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setMentionAt((index) => (index + 1) % visibleMentions.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setMentionAt((index) => (index - 1 + visibleMentions.length) % visibleMentions.length);
              return;
            }
            if (event.key === "Escape") {
              setMention(null);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              applyMention(visibleMentions[mentionAt % visibleMentions.length]!.insert);
              return;
            }
          }
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {mention && visibleMentions.length > 0 && (
        <div className="composer-mention" role="listbox" aria-label="Mention a teammate">
          {visibleMentions.map((choice, index) => (
            <button
              type="button"
              key={choice.key}
              role="option"
              aria-selected={index === mentionAt % visibleMentions.length}
              className={index === mentionAt % visibleMentions.length ? "current" : ""}
              onMouseDown={(event) => { event.preventDefault(); applyMention(choice.insert); }}
              onMouseEnter={() => setMentionAt(index)}
            >
              {choice.face}
              <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
            </button>
          ))}
        </div>
      )}
      <div className="composer-bar">
        <button
          type="button"
          className={`composer-mode ${yoloMode ? "yolo" : ""}`}
          onClick={() => void toggleMode()}
          disabled={modeBusy}
          aria-pressed={yoloMode}
          title={yoloMode ? "YOLO mode is on: reviews are auto-approved. Click to go back to asking first." : "Ask first: work can start, but actions requiring review wait for your approval. Click to change approval mode."}
        >
          <ShieldQuestion size={15} />
          {yoloMode ? "YOLO" : "Ask first"}
        </button>
        <button
          type="button"
          className="add-file"
          aria-label="Add files"
          disabled={!attached.ready || attached.uploading || sending}
          onClick={() => fileInput.current?.click()}
        >
          {attached.uploading ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Plus size={20} />
          )}
        </button>
        <ChoiceMenu
            compact
            label="Choose a teammate"
            value={recipient}
            choices={[{ value: "", label: "Your team", detail: "Let the team choose who can help", icon: <MessageCircle size={19}/> }, ...(state?.bots || []).map((bot) => ({ value: bot.id, label: bot.name, detail: bot.role, icon: <Face bot={bot} size={25}/> }))]}
            onChange={(selected) => {
              setRecipient(selected);
              if (page === "chat" && thread !== "team-room") {
                setThread(
                  state?.bots.find((bot) => bot.id === selected)?.threadId ||
                    "team-room",
                );
                nearBottom.current = true;
              }
            }}
          />
        <span className="composer-hint">
          {sending ? "Sending…" : !composerDraft.ready ? "Restoring draft…" : "Enter to send"}
        </span>
        <button
          className="send"
          aria-label="Send message"
          disabled={
            (!draft.trim() && !attached.files.length) ||
            sending ||
            attached.uploading ||
            !attached.ready ||
            !composerDraft.ready ||
            state?.activeThreadId !== thread ||
            !online
          }
        >
          {sending ? (
            <LoaderCircle size={19} className="spin" />
          ) : (
            <ArrowUp size={20} />
          )}
        </button>
      </div>
      {!botReady && state && (
        <a className="provider-needed" href="/?panel=provider">
          Choose your AI connection to send a message <ArrowRight size={13} />
        </a>
      )}
      {budgetReached && !sendError && (
        <p className="send-error" role="status">
          {budgetBot.name} has reached the weekly budget configured in OpenBot. Your provider’s allowance is separate.{" "}
          <button type="button" onClick={() => openCapability("bot", budgetBot.threadId)}>Review budget</button>
        </p>
      )}
      {sendError && (
        <p className="send-error" role="alert">
          {sendError} Your draft has been kept.
          {budgetReached && <button type="button" onClick={() => openCapability("bot", budgetBot.threadId)}>Review budget</button>}
        </p>
      )}
      {attached.error && (
        <p className="send-error" role="alert">
          {attached.error}
          <button type="button" onClick={attached.retry}>Try again</button>
        </p>
      )}
      {composerDraft.error && (
        <p className="send-error" role="alert">
          {composerDraft.error}{" "}
          <button type="button" onClick={() => composerDraft.saveNow()}>
            Retry saving
          </button>
        </p>
      )}
      {composerDraft.conflict && (
        <div className="draft-conflict" role="status">
          <p>This conversation has a different draft on another device.</p>
          <blockquote>
            {composerDraft.conflict.body || "(Empty draft)"}
          </blockquote>
          <button type="button" onClick={composerDraft.keepLocal}>
            Keep this draft
          </button>
          <button type="button" onClick={composerDraft.useRemote}>
            Use other draft
          </button>
        </div>
      )}
      {draftNotice && (
        <p className="draft-notice" role="status">
          {draftNotice}
        </p>
      )}
    </form>
  );
  const runRow = (run: Run) => (
    <button
      className="work-row"
      key={run.id}
      onClick={() => setDetail({ kind: "run", run })}
    >
      <span className="work-document">
        {activeStates.includes(run.status) ? (
          <Character
            name={run.botName}
            color={run.botColor}
            variant={run.botMascot}
            status="working"
            size={39}
          />
        ) : (
          <FileText size={20} strokeWidth={1.3} />
        )}
      </span>
      <span>
        <strong>{run.task.goal}</strong>
        <small>
          {run.botName} <span>·</span> {labelFor(run.status)}
        </small>
      </span>
      <span className="work-meta">
        {run.finishedAt || run.startedAt
          ? dateText((run.finishedAt || run.startedAt)!)
          : ""}
        <ChevronRight size={15} />
      </span>
    </button>
  );
  const scheduleRow = (routine: Routine) => (
    <button
      className="agenda-row"
      key={routine.id}
      onClick={() => openThread(routine.threadId)}
    >
      <time>{timeText(routine.nextRunAt!)}</time>
      <span>
        <strong>{routine.name}</strong>
        <small>
          {routine.botName} · {dateText(routine.nextRunAt!)}
        </small>
      </span>
      <ChevronRight size={14} />
    </button>
  );
  const activeNow = activeNowBots(state?.bots || []);
  const setPin = (item: { id: string; title: string; pinned: boolean }, pinned: boolean) =>
    void (async () => {
      await fetch(`/api/threads/${encodeURIComponent(item.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      }).catch(() => {});
      setRefresh((n) => n + 1);
    })();
  const pinnedThreads = (state?.threads || []).filter((item) => !item.hidden && item.pinned);
  const conversationRows = state?.threads
    .filter(
      (item) =>
        !item.hidden &&
        !item.pinned &&
        `${item.title} ${item.lastMessage || ""}`
          .toLowerCase()
          .includes(conversationQuery.toLowerCase()),
    )
    .map((item) => {
      const bot = state.bots.find((bot) => bot.threadId === item.id);
      return (
        <div key={item.id} className="conversation-cell">
        <button
          aria-label={item.title}
          className={`conversation-row ${page === "chat" && thread === item.id ? "current" : ""}`}
          onClick={() => openThread(item.id)}
        >
          {bot ? (
            <Face bot={bot} size={43} />
          ) : (
            <span className="room-mark">
              <MessageCircle size={24} strokeWidth={1.3} />
            </span>
          )}
          <span className="conversation-copy">
            <span className="conversation-heading">
              <strong>{item.title}</strong>
              {item.needsYou && <span className="needs-you-pill">Needs you</span>}
              {item.lastMessageAt && (
                <time>
                  {dayKey(item.lastMessageAt) === dayKey(new Date())
                    ? timeText(item.lastMessageAt)
                    : dateText(item.lastMessageAt)}
                </time>
              )}
            </span>
            <small
              title={
                bot && ["working", "waiting"].includes(bot.status) && bot.currentAction
                  ? bot.currentAction
                  : undefined
              }
            >
              {bot && ["working", "waiting"].includes(bot.status) && bot.currentAction
                ? bot.currentAction
                : item.lastMessage?.replace(/[*#_`]/g, "") ||
                  bot?.role ||
                  "A conversation with your team"}
            </small>
          </span>
        </button>
        <button
          type="button"
          className="conversation-pin"
          aria-label={`Pin ${item.title} to the top`}
          title="Pin to the top"
          onClick={() => setPin(item, true)}
        >
          <Pin size={13} />
        </button>
        </div>
      );
    });
  return (
    <div
      className={`studio-shell ${contextOpen && !narrow && page === "chat" ? "with-context" : ""} ${signInPane && !narrow && page === "chat" ? "with-sign-in" : ""}`}
    >
      <aside className="sidebar">
        <a className="wordmark" href="/">
          <span className="wordmark-symbol">
            o<span />
          </span>
          openbot
        </a>
        <label className="conversation-search">
          <Search size={16} />
          <input
            aria-label="Find a conversation"
            placeholder="Search"
            value={conversationQuery}
            onChange={(event) => setConversationQuery(event.target.value)}
          />
        </label>
        <div className="sidebar-conversations">
          <header>
            <span>Conversations</span>
            <span className="conversation-new">
              <button aria-label="New group" onClick={() => setDetail({ kind: "group" })}>
                <UsersRound size={15} />
              </button>
              <button aria-label="New teammate" onClick={() => setDetail({ kind: "create" })}>
                <Plus size={15} />
              </button>
            </span>
          </header>
          {activeNow.length > 0 && (
            <div className="active-now" aria-label="Working right now">
              {activeNow.map((bot) => (
                <button key={bot.id} type="button" className="active-now-chip" title={`${bot.name} is working right now`} onClick={() => openThread(bot.threadId)}>
                  <Face bot={bot} size={19} />
                  <span>{bot.name}</span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <PinnedZone items={pinnedThreads} bots={state?.bots || []} onOpen={openThread} onUnpin={(item) => setPin(item, false)} />
          {conversationRows}
        </div>
        <div className="sidebar-bottom">
          <button
            className="workspace-link"
            aria-label="Open workspace"
            onClick={() => setDetail({ kind: "workspace" })}
          >
            <Layers3 size={17} /> Workspace{" "}
            {attentionCount > 0 && <b>{attentionCount} need you</b>}
          </button>
          <div>
            <span className={`connection-dot ${online ? "" : "offline"}`} />
            <span>{online ? "Studio connected" : "Reconnecting"}</span>
            <button
              aria-label="Settings"
              onClick={openSettings}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className={`workspace workspace-${page}`}>
        <header className="topbar">
          <span>
            <button
              className="topbar-control conversation-back"
              aria-label="All conversations"
              onClick={() => navigate("home")}
            >
              <ChevronLeft size={20} />
            </button>
            {conversationBot ? (
              <button
                className="topbar-control conversation-identity"
                aria-label={`About ${conversationBot.name}`}
                onClick={() =>
                  setDetail({ kind: "teammate", bot: conversationBot })
                }
              >
                <Face bot={conversationBot} size={33} />
                <span className="conversation-name">{title}</span>
                <ChevronDown size={12} />
              </button>
            ) : (
              title
            )}
          </span>
          <div>
            {page === "chat" && state?.bots.length ? (
              <button
                className="topbar-control"
                aria-label="Conversation details"
                onClick={() =>
                  narrow
                    ? setDetail({ kind: "context" })
                    : setContextOpen((value) => !value)
                }
              >
                <Monitor size={19} strokeWidth={1.5} />
              </button>
            ) : null}
            <button
              className="topbar-control mobile-search"
              aria-label="Search"
              onClick={() => setDetail({ kind: "search" })}
            >
              <Search size={18} />
            </button>
            {page === "chat" && conversationThread && <ConversationActions
              key={thread}
              thread={conversationThread}
              bot={conversationBot}
              onEditTeammate={conversationBot ? () => openCapability("bot", conversationBot.threadId) : undefined}
              onEditGroup={thread.startsWith("group-") ? () => setDetail({ kind: "group", threadId: thread }) : undefined}
              onDetails={() => narrow ? setDetail({ kind: "context" }) : setContextOpen(true)}
              onWorkspace={() => setDetail({ kind: "workspace" })}
              onNewTeammate={() => setDetail({ kind: "create" })}
              onRemoved={() => { setRefresh((value) => value + 1); openThread("team-room"); }}
            />}
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setRefresh((n) => n + 1)}>Try again</button>
            <button onClick={openSettings}>Settings</button>
          </div>
        )}
        {!state ? (
          <div className="loading">
            <LoaderCircle className="spin" size={22} />
            <p>Opening your studio…</p>
          </div>
        ) : (
          <>
            {page === "home" && (
              <div className="page-content conversations-page">
                <div className="page-heading">
                  <div>
                    <p className="overline">PICK UP WHERE YOU LEFT OFF</p>
                    <h1>Conversations</h1>
                  </div>
                  <button
                    className="text-action"
                    onClick={() => setDetail({ kind: "create" })}
                  >
                    <Plus size={16} /> New teammate
                  </button>
                </div>
                <label className="conversation-search">
                  <Search size={16} />
                  <input
                    aria-label="Search conversations"
                    placeholder="Search conversations"
                    value={conversationQuery}
                    onChange={(event) =>
                      setConversationQuery(event.target.value)
                    }
                  />
                </label>
                <div className="favorite-teammates">
                  {state.bots.slice(0, 3).map((bot) => (
                    <button
                      key={bot.id}
                      onClick={() => openThread(bot.threadId)}
                    >
                      <Face bot={bot} size={68} />
                      <span>{bot.name}</span>
                    </button>
                  ))}
                </div>
                <div className="inbox-conversations">
                  <PinnedZone items={pinnedThreads} bots={state?.bots || []} onOpen={openThread} onUnpin={(item) => setPin(item, false)} />
                  {conversationRows}
                </div>
                {!state.bots.length && (
                  <Empty title="Your first conversation starts here">
                    Create a teammate with a job that matters to you.
                  </Empty>
                )}
              </div>
            )}
            {page === "activity" && (
              <div className="page-content activity-page">
                <div className="page-heading">
                  <div>
                    <p className="overline">YOUR TEAM’S WORK</p>
                    <h1>Activity</h1>
                  </div>
                  <span className="count-label">
                    {active.length} in progress
                  </span>
                </div>
                {attentionCount > 0 && (
                  <section className="attention-section">
                    <h2>
                      <ShieldCheck size={18} /> Needs you
                    </h2>
                    {attention.map(runRow)}
                    {uncertain.map((action) => (
                      <a
                        className="attention-notice"
                        key={action.id}
                        href="/?panel=live"
                      >
                        <strong>Check before continuing</strong>
                        <span>
                          {action.actionLabel} may have completed. It will not
                          be repeated automatically.
                        </span>
                        <small>Review and resolve →</small>
                      </a>
                    ))}
                    {alerts.map((alert) => (
                      <a
                        className="attention-notice"
                        key={alert.id}
                        href="/?panel=routines"
                      >
                        <strong>{alert.routineName}</strong>
                        <span>{alert.message}</span>
                        <small>Review routine →</small>
                      </a>
                    ))}
                    {otherApprovals.length > 0 && (
                      <a className="attention-notice" href="/?panel=live">
                        <strong>
                          {otherApprovals.length} pending action{" "}
                          {otherApprovals.length === 1 ? "review" : "reviews"}
                        </strong>
                        <span>
                          Open the complete review to inspect the full action before
                          deciding.
                        </span>
                      </a>
                    )}
                  </section>
                )}
                <section>
                  <div className="section-heading">
                    <h2>In progress</h2>
                  </div>
                  {active.map(runRow)}
                  {!active.length && (
                    <Empty title="No tasks running">
                      New tasks will appear here as your team starts working.
                    </Empty>
                  )}
                </section>
                <section>
                  <div className="section-heading">
                    <h2>Finished</h2>
                  </div>
                  {finished.slice(0, 20).map(runRow)}
                  {!finished.length && (
                    <p className="quiet-copy">
                      Finished work will stay here for you to revisit.
                    </p>
                  )}
                </section>
              </div>
            )}
            {page === "schedule" && (
              <div className="page-content schedule-page">
                <div className="page-heading">
                  <div>
                    <p className="overline">A LITTLE MORE AUTOMATIC</p>
                    <h1>Your schedule</h1>
                  </div>
                  <button
                    className="primary"
                    onClick={() =>
                      startPrompt(
                        "Help me create a routine. Ask what should happen and when before scheduling it.",
                      )
                    }
                  >
                    <Plus size={15} /> New routine
                  </button>
                </div>
                <div className="schedule-layout">
                  <section className="month-view">
                    <header>
                      <h2>
                        {Temporal.PlainDate.from(month).toLocaleString([], {
                          month: "long",
                          year: "numeric",
                        })}
                      </h2>
                      <div>
                        <button
                          aria-label="Previous month"
                          onClick={() =>
                            setMonth(
                              Temporal.PlainDate.from(month)
                                .subtract({ months: 1 })
                                .toString(),
                            )
                          }
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <button
                          aria-label="Next month"
                          onClick={() =>
                            setMonth(
                              Temporal.PlainDate.from(month)
                                .add({ months: 1 })
                                .toString(),
                            )
                          }
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </header>
                    <div className="month-grid">
                      <div className="weekdays">
                        {["M", "T", "W", "T", "F", "S", "S"].map(
                          (day, index) => (
                            <span key={index}>{day}</span>
                          ),
                        )}
                      </div>
                      <div className="month-days">
                        {calendarMonthDays(month).map((day) => {
                          const key = day.toString(),
                            scheduled = upcoming.some(
                              (routine) => dayKey(routine.nextRunAt!) === key,
                            );
                          return (
                            <button
                              className={`${key.slice(0, 7) !== month.slice(0, 7) ? "outside" : ""} ${calendarDate === key ? "chosen" : ""}`}
                              key={key}
                              aria-label={day.toLocaleString([], {
                                dateStyle: "full",
                              })}
                              aria-pressed={calendarDate === key}
                              aria-current={
                                key === dayKey(new Date()) ? "date" : undefined
                              }
                              onClick={() => setCalendarDate(key)}
                            >
                              <span>{day.day}</span>
                              {scheduled && <i />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="calendar-note">
                      Dots mark the next scheduled run of each routine.
                      <br />
                      Times shown in{" "}
                      {Intl.DateTimeFormat()
                        .resolvedOptions()
                        .timeZone.replaceAll("_", " ")}
                      .
                    </p>
                  </section>
                  <section className="day-agenda">
                    <p className="overline">
                      {Temporal.PlainDate.from(calendarDate).toLocaleString(
                        [],
                        { weekday: "long" },
                      )}
                    </p>
                    <h2>
                      {Temporal.PlainDate.from(calendarDate).toLocaleString(
                        [],
                        { month: "long", day: "numeric" },
                      )}
                    </h2>
                    {upcoming
                      .filter(
                        (routine) =>
                          dayKey(routine.nextRunAt!) === calendarDate,
                      )
                      .map(scheduleRow)}
                    {!upcoming.some(
                      (routine) => dayKey(routine.nextRunAt!) === calendarDate,
                    ) && (
                      <Empty title="Room to breathe">
                        No next runs on this date. Recurring schedules continue
                        beyond the next run shown here.
                      </Empty>
                    )}
                    <a className="text-action" href="/?panel=routines">
                      Manage all routines <ArrowRight size={14} />
                    </a>
                  </section>
                </div>
              </div>
            )}
            {page === "library" && (
              <div className="page-content library-page">
                <div className="page-heading">
                  <div>
                    <p className="overline">MAKE IT YOURS</p>
                    <h1>Your library</h1>
                  </div>
                </div>
                <div className="library-toolbar">
                  <div
                    className="tabs"
                    role="group"
                    aria-label="Library section"
                  >
                    <button
                      aria-pressed={libraryTab === "apps"}
                      onClick={() => {
                        setLibraryTab("apps");
                        setQuery("");
                      }}
                    >
                      Apps
                    </button>
                    <button
                      aria-pressed={libraryTab === "skills"}
                      onClick={() => {
                        setLibraryTab("skills");
                        setQuery("");
                      }}
                    >
                      Skills
                    </button>
                  </div>
                  <label className="library-search">
                    <Search size={16} />
                    <input
                      aria-label="Search library"
                      placeholder={`Find ${libraryTab === "apps" ? "an app" : "a skill"}`}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                <p className="library-caption">
                  {libraryTab === "apps"
                    ? "Your apps, with you in control of what’s shared."
                    : "Useful methods your teammates can put to work."}
                </p>
                {libraryTab === "apps" ? (
                  <div className="app-list">
                    {connections?.catalog
                      .filter((app) =>
                        `${app.name} ${app.description}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((app) => (
                        <button
                          key={app.id}
                          className="app-row"
                          onClick={() => setDetail({ kind: "app", app })}
                        >
                          <span className="app-mark">
                            <ConnectorIcon id={app.id} />
                          </span>
                          <span>
                            <strong>{app.name}</strong>
                            <small>{app.description}</small>
                          </span>
                          <span className="app-state">
                            {app.connected ? (
                              <>
                                <Check size={13} /> Connected
                              </>
                            ) : app.availability === "next" ? (
                              "Coming later"
                            ) : (
                              "Not connected"
                            )}
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    {!connections && (
                      <p className="quiet-copy">Loading your apps…</p>
                    )}
                    {connections &&
                      !connections.catalog.some((app) =>
                        `${app.name} ${app.description}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      ) && (
                        <Empty title="No matching apps">
                          Try a different name.
                        </Empty>
                      )}
                  </div>
                ) : (
                  <div className="skill-list">
                    {skills
                      .filter((skill) =>
                        `${skill.name} ${skill.description}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((skill) => (
                        <button
                          key={skill.id}
                          className="skill-row"
                          onClick={() => setDetail({ kind: "skill", skill })}
                        >
                          <span className="skill-number">
                            <FileText size={20} strokeWidth={1.3} />
                          </span>
                          <span>
                            <strong>{skill.name.replaceAll("-", " ")}</strong>
                            <small>{skill.description}</small>
                          </span>
                          <span className="skill-tag">
                            {skill.bundled ? "Included" : "Added by you"}
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    {query &&
                      !skills.some((skill) =>
                        `${skill.name} ${skill.description}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      ) && <Empty title="No matching skills" />}
                    <a className="text-action" href="/?panel=teach">
                      <Plus size={15} /> Teach your own skill
                    </a>
                  </div>
                )}
                <a className="text-action" href="/?panel=artifacts">
                  <FileText size={15} /> Browse artifacts your team delivered
                </a>
              </div>
            )}
            {page === "chat" && (
              <>
                <div
                  className="chat-scroll"
                  ref={messageScroll}
                  onScroll={() => {
                    const el = messageScroll.current!;
                    nearBottom.current =
                      el.scrollHeight - el.clientHeight - el.scrollTop < 100;
                  }}
                >
                  <div className="chat-messages">
                    {!state.bots.length ? (
                      <div className="first-teammate">
                        <span className="first-teammate-mark">
                          <MessageCircle size={36} strokeWidth={1.2} />
                          <Plus size={18} />
                        </span>
                        <p className="overline">YOUR STUDIO, FROM THE START</p>
                        <h1>Make room for a little help.</h1>
                        <p>
                          Create a teammate for something you want off your
                          plate. Start with one—you can add more later.
                        </p>
                        <button
                          className="primary"
                          onClick={() => setDetail({ kind: "create" })}
                        >
                          Create your first teammate <ArrowRight size={16} />
                        </button>
                        <small>
                          You choose their personality, their job and the AI
                          they use.
                        </small>
                      </div>
                    ) : state.activeThreadId !== thread ? (
                      <p className="quiet-copy">Opening conversation…</p>
                    ) : !state.messages.length ? (
                      <div className="chat-empty">
                        <FaceGroup
                          bots={
                            recipient
                              ? state.bots.filter((bot) => bot.id === recipient)
                              : state.bots
                          }
                          size={78}
                        />
                        <h1>What’s on your mind?</h1>
                        <p>
                          Start with a question or something you’d like done.
                        </p>
                      </div>
                    ) : (
                      state.messages.map((message, index) => {
                        if (actionGroupMemberIds.has(message.id)) return null;
                        const actionGroup = actionGroupByFirstId.get(message.id);
                        const cancelledOutcome = cancelledRunForTrigger(state.runs, state.messages, message.id);
                        const previous = index > 0 ? state.messages[index - 1] : undefined;
                        const startsGroup =
                          !previous ||
                          previous.senderId !== message.senderId ||
                          previous.senderType === "system" ||
                          message.senderType === "system";
                        if (message.kind === "event") {
                          return (
                            <Fragment key={message.id}>{actionGroup ? <div className="chat-event action-completed-group" role="status" data-event="action_completed">
                              <details><summary><Check size={14} aria-hidden="true" /><span>{actionGroup.length} reviewed steps</span><ChevronDown size={14} aria-hidden="true" /></summary><div className="action-completed-records">{actionGroup.map((item) => <p key={item.id}><strong>{eventTitle(item)}</strong>{eventDetail(item) && <small>{eventDetail(item)}</small>}</p>)}</div></details>
                            </div> : <div className="chat-event" data-event={message.eventType || "note"} role={['run_stopped', 'action_completed'].includes(message.eventType || '') ? 'status' : undefined}>
                              <span className="chat-event-mark" aria-hidden="true">
                                {message.eventType === "routine_created" ? <Clock size={14} /> : message.eventType === "handoff" ? <ArrowRightLeft size={14} /> : message.eventType === "routine_run" ? <Zap size={14} /> : <MessageCircle size={14} />}
                              </span>
                              <span>
                                <strong>{eventTitle(message)}</strong>
                                {eventDetail(message) && <small>{eventDetail(message)}</small>}
                                {message.eventType === 'run_stopped' && (() => { const stopped = state.runs.find(run => run.id === message.runId); return stopped && <button type="button" className="text-action" onClick={() => setDetail({kind: 'run', run: stopped})}>Review saved progress</button>; })()}
                              </span>
                            </div>}{cancelledOutcome && <CancelledRunOutcome run={cancelledOutcome} onReview={() => setDetail({ kind: "run", run: cancelledOutcome })} />}</Fragment>
                          );
                        }
                        return (
                          <Fragment key={message.id}><article
                            className={`chat-message ${message.senderType === "user" ? "from-you" : "from-team"} ${startsGroup ? "" : "continues"}`}

                          >
                            {message.senderType !== "user" && startsGroup && (
                              <div className="message-author">
                                <Character
                                  name={message.senderName}
                                  color={message.senderColor || "#7265cf"}
                                  variant={message.senderMascot || "nova"}
                                  size={31}
                                />
                                <strong>{message.senderName}</strong>
                                <time>{timeText(message.createdAt)}</time>
                              </div>
                            )}
                            <div className="prose">
                              <MarkdownMessage body={message.body} attachments={message.attachments} />
                              {message.senderType === "bot" && !!message.progressUpdates?.length && (
                                <details className="message-work-updates">
                                  <summary>Work updates</summary>
                                  {message.progressUpdates.map((update, index) => <div key={index}><MarkdownMessage body={update} /></div>)}
                                </details>
                              )}
                            </div>
                            {message.senderType === "bot" && message.runId
                              ? <DeliveryCard message={message} run={state.runs.find((run) => run.id === message.runId)} childRuns={state.runs.filter((run) => run.parentRunId === message.runId)} teammates={state.bots} visibleFiles={conversationFiles} />
                              : <>{message.attachments.map((file) => <DeliveredFile key={file.id} file={file} />)}</>}
                          </article>{cancelledOutcome && <CancelledRunOutcome run={cancelledOutcome} onReview={() => setDetail({ kind: "run", run: cancelledOutcome })} />}</Fragment>
                        );
                      })
                    )}
                    {state.activeThreadId === thread && (() => {
                      const fallback = latestCancelledWithoutTrigger(state.runs, state.messages);
                      return fallback ? <CancelledRunOutcome run={fallback} dated onReview={() => setDetail({ kind: "run", run: fallback })} /> : null;
                    })()}
                    {state.activeThreadId === thread &&
                      state.approvals.filter((approval) => approval.status === "pending").map((approval) => {
                        const run = state.runs.find((item) => item.id === approval.runId);
                        return run ? <RunControls key={approval.id} run={run} approval={approval} onChange={() => setRefresh((value) => value + 1)} onSignInPane={page === "chat" ? (id) => setSignInPane(id) : undefined} /> : null;
                      })}
                    {state.activeThreadId === thread &&
                      state.runs
                        .filter(
                          (run) =>
                            !run.parentRunId &&
                            activeStates.includes(run.status),
                        )
                        .map((run) => (
                          <ConversationProgress key={run.id} run={run} onDetails={() => setDetail({ kind: "run", run })} onChange={() => setRefresh((value) => value + 1)} />
                        ))}
                    <div ref={messagesEnd} />
                  </div>
                </div>
                {state.bots.length > 0 && (
                  <div className="chat-compose">
                    {composer}
                    <p>
                      Connected apps and actions keep their existing permission
                      rules.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      {signInPane && !narrow && page === "chat" && (
        <aside className="browser-pane" aria-label="Private browser">
          <header>
            <h2>Private browser</h2>
            <button aria-label="Close the private browser" onClick={() => setSignInPane(null)}>
              <X size={19} />
            </button>
          </header>
          <BrowserSignInPanel key={signInPane} approvalId={signInPane} disabled={false}
            onBusyChange={() => {}} onInteraction={() => {}} />
        </aside>
      )}
      {contextOpen && !narrow && page === "chat" && state && (
        <aside
          className="conversation-context"
          aria-label="Conversation details"
        >
          <header>
            <h2>Alongside this conversation</h2>
            <button
              aria-label="Close conversation details"
              onClick={() => setContextOpen(false)}
            >
              <X size={19} />
            </button>
          </header>
          <ConversationContext
            state={state}
            bot={conversationBot}
            threadId={thread}
            onRun={(run) => setDetail({ kind: "run", run })}
            onSchedule={() => navigate("schedule")}
            onTakeover={setTakeoverBot}
            onEditGroup={thread.startsWith("group-") ? () => setDetail({ kind: "group", threadId: thread }) : undefined}
          />
        </aside>
      )}
      {capability && state && <Drawer title={capabilityTitles[capability]} settings onBack={openSettings} onClose={() => openCapability(null)}>
        <Suspense fallback={<p className="quiet-copy" role="status">Opening {capabilityTitles[capability].toLowerCase()}…</p>}><CapabilityPanelHost key={capability} panel={capability} state={state} threadId={thread} onOpen={(panel) => openCapability(panel)} onThread={(id) => { openCapability(null, id); openThread(id); }} onChange={() => setRefresh((n) => n + 1)} /></Suspense>
      </Drawer>}
      {detail && (
        <Drawer
          settings={detail.kind === "settings"}
          onClose={() => detail.kind === "settings" ? openCapability(null) : setDetail(null)}
          title={
            detail.kind === "context"
              ? "Conversation details"
              : detail.kind === "group"
                ? detail.threadId ? "Group members" : "New group"
              : detail.kind === "workspace"
                ? "Your workspace"
                : detail.kind === "create"
                  ? "Create a teammate"
                  : detail.kind === "teammate"
                    ? `Meet ${detail.bot.name}`
                    : detail.kind === "settings"
                      ? "Settings"
                      : detail.kind === "search"
                        ? "Search your studio"
                        : detail.kind === "run"
                          ? "The work"
                          : detail.kind === "app"
                            ? detail.app.name
                            : "Skill"
          }
        >
          {detail.kind === "context" && state && (
            <ConversationContext
              state={state}
              bot={conversationBot}
              threadId={thread}
              onRun={(run) => setDetail({ kind: "run", run })}
              onSchedule={() => navigate("schedule")}
              onTakeover={setTakeoverBot}
              onEditGroup={thread.startsWith("group-") ? () => setDetail({ kind: "group", threadId: thread }) : undefined}
            />
          )}
          {detail.kind === "workspace" && (
            <nav className="workspace-menu" aria-label="Workspace navigation">
              {navItems.map(([key, label, Icon]) => (
                <button key={key} onClick={() => navigate(key)}>
                  <Icon size={19} />
                  <span>{label}</span>
                  {key === "activity" && attentionCount > 0 && (
                    <b>{attentionCount} need you</b>
                  )}
                  <ChevronRight size={16} />
                </button>
              ))}
              <button onClick={openSettings}>
                <Settings2 size={19} />
                <span>Settings & AI connections</span>
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
          {detail.kind === "create" && (
            <CreateTeammate
              onCreated={(bot) => {
                setDetail(null);
                setRecipient(bot.id);
                setThread(bot.threadId);
                setPage("chat");
                setRefresh((value) => value + 1);
              }}
            />
          )}
          {detail.kind === "group" && state && (
            <GroupEditor
              state={state}
              threadId={detail.threadId}
              onDone={() => setDetail(null)}
              onOpen={(id) => {
                setDetail(null);
                setRecipient("");
                setPage("chat");
                setThread(id);
                setRefresh((value) => value + 1);
              }}
            />
          )}
          {detail.kind === "teammate" && (
            <div className="meet-teammate">
              <Character
                name={detail.bot.name}
                color={detail.bot.color}
                variant={detail.bot.mascot}
                status={detail.bot.status}
                mood="happy"
                size={130}
              />
              <p className="overline">YOUR TEAMMATE</p>
              <h2 className="detail-title">{detail.bot.name}</h2>
              <p className="teammate-specialty">{detail.bot.role}</p>
              <p className="drawer-intro">
                Talk to {detail.bot.name} directly, or ask the whole team. They
                can consult each other, with one teammate bringing you the final
                reply.
              </p>
              <div className="teammate-facts">
                <div>
                  <span>AI connection</span>
                  <strong>
                    {detail.bot.providerInstanceId && detail.bot.model
                      ? "Model selected"
                      : "Not set up yet"}
                  </strong>
                </div>
                <div>
                  <span>Files on this Mac</span>
                  <strong>
                    {detail.bot.macAccessEnabled &&
                    state?.settings.macAccessEnabled
                      ? "Permission enabled"
                      : "Not enabled"}
                  </strong>
                </div>
                <div>
                  <span>Browser access</span>
                  <strong>
                    {detail.bot.browserEnabled
                      ? "Permission enabled"
                      : "Not enabled"}
                  </strong>
                </div>
              </div>
              <p className="boundary-note">
                These are permission settings, not a connection test. Your
                accounts and the Mac’s permissions still apply.
              </p>
              <button
                className="primary full-width"
                onClick={() => openThread(detail.bot.threadId)}
              >
                Talk to {detail.bot.name}
                <ArrowRight size={15} />
              </button>
              <AppearanceEditor key={detail.bot.id} bot={detail.bot} onSaved={(bot) => { setDetail({ kind: "teammate", bot }); setRefresh((n) => n + 1); }}/>
              <a className="text-action" href={`/?thread=${encodeURIComponent(detail.bot.threadId)}&panel=bot`}><Settings2 size={14}/> Edit & manage teammate <ArrowRight size={14}/></a>
            </div>
          )}
          {detail.kind === "settings" && (
            <>
              <p className="drawer-intro">
                Your team. Your connections. Your choices.
              </p>
              <div className="appearance-setting"><span>Appearance</span><ChoiceMenu label="Appearance" value={appearance}
                choices={[{value:"system",label:"Match this device"},{value:"light",label:"Light"},{value:"dark",label:"Dark"}]}
                onChange={(value) => setAppearance(value as Appearance)}/></div>
              <div className="settings-list">
                <a href="/?panel=provider">
                  <span>
                    Your AI<small>Choose providers and models</small>
                  </span>
                  <ChevronRight size={16} />
                </a>
                <a href="/?panel=connectors">
                  <span>
                    Apps & tools<small>Connect accounts and choose access</small>
                  </span>
                  <ChevronRight size={16} />
                </a>
                <a href="/?panel=bot"><span>Teammates<small>Character, instructions and individual limits</small></span><ChevronRight size={16} /></a>
                <a href="/?panel=routines"><span>Routines<small>Schedule work and manage triggers</small></span><ChevronRight size={16} /></a>
                <a href="/?panel=remote">
                  <span>
                    Your phone<small>Pair and manage away access</small>
                  </span>
                  <ChevronRight size={16} />
                </a>
                <a href="/?panel=control">
                  <span>
                    Permissions & usage<small>Review access and limits</small>
                  </span>
                  <ChevronRight size={16} />
                </a>
              </div>
              <h3 className="settings-section-title">Workspace</h3>
              <div className="settings-list">
                <a href="/?panel=projects"><span>Projects<small>Build and test in folders you choose</small></span><ChevronRight size={16} /></a>
                <a href="/?panel=teach"><span>Skills & recipes<small>Included methods and your own workflows</small></span><ChevronRight size={16} /></a>
                <a href="/?panel=files"><span>Files<small>Each teammate’s private workspace</small></span><ChevronRight size={16} /></a>
                <a href="/?panel=artifacts"><span>Finished work<small>Open results and their revisions</small></span><ChevronRight size={16} /></a>
                <a href="/?panel=live"><span>Activity & recovery<small>Review results and work needing a hand</small></span><ChevronRight size={16} /></a>
              </div>
              <details className="auto-review-details">
                <summary>Advanced approval rules</summary>
                <AutoReviewRules />
              </details>
            </>
          )}
          {detail.kind === "search" && (
            <SearchStudio state={state} onOpen={openThread} />
          )}
          {detail.kind === "run" && (
            <>
              <div className="detail-owner">
                <Character
                  name={detail.run.botName}
                  color={detail.run.botColor}
                  variant={detail.run.botMascot}
                  size={55}
                />
                <span>
                  {detail.run.botName}
                  <small>{labelFor(detail.run.status)}</small>
                </span>
              </div>
              <h2 className="detail-title">{detail.run.task.goal}</h2>
              {detail.run.error && (
                <p className="detail-warning">{detail.run.error}</p>
              )}
              {detail.run.approvalReason && (
                <p className="detail-warning">{detail.run.approvalReason}</p>
              )}
              <ol className="task-steps">
                {detail.run.task.steps.map((step, index) => (
                  <li key={step.id}>
                    <span>
                      {step.status === "completed" ? (
                        <Check size={13} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.detail || step.status}</small>
                    </div>
                  </li>
                ))}
              </ol>
              {detail.run.summary && (
                <div className="prose">
                  <ReactMarkdown>{detail.run.summary}</ReactMarkdown>
                </div>
              )}
              {!detail.run.summary && detail.run.partialText && <details className="message-work-updates"><summary>Latest work update</summary><div className="prose"><MarkdownMessage body={detail.run.partialText} /></div></details>}
              <DeliveryReceipt run={detail.run} teammates={state?.bots} />
              <WorkReceipt runId={detail.run.id} />
              <button
                className="primary full-width"
                onClick={() => openThread(detail.run.threadId)}
              >
                Open conversation <ArrowRight size={15} />
              </button>
              <RunControls key={detail.run.id} run={detail.run} approval={state?.approvals.find((approval) => approval.id === detail.run.approvalId)} onChange={() => setRefresh((value) => value + 1)} />
              <p className="boundary-note">
                Opening a result does not approve or restart a task.
              </p>
            </>
          )}
          {detail.kind === "app" && (
            <>
              <div className="detail-app-mark">
                <ConnectorIcon id={detail.app.id} />
              </div>
              <h2 className="detail-title">
                {detail.app.availability === "next"
                  ? `${detail.app.name} is coming later`
                  : detail.app.connected
                    ? `${detail.app.name} is connected`
                    : `Connect ${detail.app.name}`}
              </h2>
              <p className="drawer-intro">{detail.app.description}</p>
              <div className="capability-list">
                {detail.app.capabilities.map((capability) => (
                  <p key={capability}>
                    <Check size={15} />
                    {capability}
                  </p>
                ))}
              </div>
              <p className="boundary-note">
                An app connection does not automatically give every teammate
                access. Existing permission and approval rules stay in place.
              </p>
              <details className="browser-access-card"><summary><Monitor size={15}/> Can I use the website instead?</summary>
                <p>Yes, for tasks the website and browser support. Open your teammate’s computer and sign in yourself; its browser profile can keep that session for later.</p>
                <p>Connections give reliable structured access for searches and recurring work. A saved browser login is a separate path, not proof of API access. Reading restrictions and action approvals still apply.</p>
                {conversationBot && (
                  <button className="text-action" onClick={() => setTakeoverBot(conversationBot)}>
                    Open computer controls <ArrowRight size={14} />
                  </button>
                )}
              </details>
              {detail.app.availability !== "next" && (
                <a className="primary full-width" href="/?panel=connectors">
                  {detail.app.connected
                    ? "Manage connection"
                    : "Open connection setup"}
                  <ArrowRight size={15} />
                </a>
              )}
              <p className="boundary-note">
                {detail.app.availability === "next"
                  ? "This connector is not available yet. No account connection will be started."
                  : "Choose how this app connects to your studio."}
              </p>
            </>
          )}
          {detail.kind === "skill" && (
            <>
              <p className="overline">
                {detail.skill.bundled ? "INCLUDED METHOD" : "YOUR METHOD"}
              </p>
              <h2 className="detail-title">
                {detail.skill.name.replaceAll("-", " ")}
              </h2>
              <p className="drawer-intro">{detail.skill.description}</p>
              <h3 className="detail-subtitle">Available to</h3>
              <div className="skill-people">
                {state?.bots
                  .filter((bot) => detail.skill.botIds.includes(bot.id))
                  .map((bot) => (
                    <div key={bot.id}>
                      <Face bot={bot} size={39} />
                      <span>{bot.name}</span>
                    </div>
                  ))}
              </div>
              <details className="source-details">
                <summary>Read the instructions</summary>
                <div className="prose">
                  <ReactMarkdown>{detail.skill.instructions}</ReactMarkdown>
                </div>
              </details>
              <small className="boundary-note">
                {detail.skill.license} ·{" "}
                {detail.skill.bundled ? "Included" : "Imported"} · No new
                account access
              </small>
              <a className="text-action" href="/?panel=teach">
                Manage skill access <ArrowRight size={14} />
              </a>
            </>
          )}
        </Drawer>
      )}
      {takeoverBot && (
        <ComputerTakeover bot={takeoverBot} onClose={() => setTakeoverBot(null)} />
      )}
    </div>
  );
}

function Drawer({
  title,
  children,
  onClose,
  onBack,
  settings = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  settings?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const prior = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      prior?.focus();
    };
  }, []);
  useEffect(() => {
    // A subpage starts at its heading, never at the previous panel's scroll.
    ref.current?.scrollTo({ top: 0 });
    ref.current?.querySelector(".drawer-body")?.scrollTo({ top: 0 });
  }, [title]);
  return (
    <dialog
      ref={ref}
      className={`detail-drawer${settings ? " settings-drawer" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        {onBack && <button className="drawer-back" aria-label="Back to settings" onClick={onBack}><ChevronLeft size={17} /><span>Settings</span></button>}
        <h2>{title}</h2>
        <button autoFocus aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
function SearchStudio({
  state,
  onOpen,
}: {
  state: AppState | null;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches =
    state?.threads.filter(
      (thread) =>
        !thread.hidden &&
        thread.title.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  return (
    <>
      <label className="search-dialog-input">
        <Search size={19} />
        <input
          autoFocus
          aria-label="Search conversations"
          placeholder="Find a conversation"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="search-results">
        {matches.map((thread) => (
          <button key={thread.id} onClick={() => onOpen(thread.id)}>
            <MessageCircle size={17} />
            <span>{thread.title}</span>
            <ArrowRight size={15} />
          </button>
        ))}
        {!matches.length && (
          <Empty title="No conversations found">Try a teammate’s name.</Empty>
        )}
      </div>
    </>
  );
}
