import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Globe2, Monitor, Plus, RotateCw, ShieldCheck, X } from "lucide-react";
import type { Bot } from "../shared/types";
import { DirectScreen, type DirectOp } from "./DirectScreen";

export type LiveComputerState = "connecting" | "ready" | "stopped" | "unavailable";

type LiveViewEvent =
  | { type: "frame"; jpeg: string }
  | { type: "status"; browser: "ready" | "stopped" | "unavailable"; title?: string | null; currentUrl?: string | null }
  | { type: "ping" };

type TakeoverResult = { url: string; title: string; screenshot: string | null };

const VIEWPORT = { width: 1280, height: 820 };
// Single keystrokes the takeover screen forwards, mirroring the server's
// takeover/press validation. Combos with held modifiers are never accepted.
const DIRECT_KEY = /^(?:[ -~]|Enter|Backspace|Delete|Tab|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|F(?:[1-9]|1[0-2]))$/;
const IGNORED_KEY = ["Meta", "Shift", "Control", "Alt", "CapsLock", "Dead", "Process"];

async function takeoverAction(botId: string, path: string, body: Record<string, unknown>): Promise<TakeoverResult> {
  const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/browser/takeover/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.json().then((data) => (typeof data?.error === "string" ? data.error : null)).catch(() => null);
    throw new Error(message || "That control needs another try.");
  }
  return response.json() as Promise<TakeoverResult>;
}

/** Subscribes to a teammate's live screen stream. The connection pauses while
 * the tab is hidden and follows the same bot until the component unmounts. */
export function useLiveComputer(botId: string | undefined) {
  const [frame, setFrame] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<LiveComputerState>("connecting");
  const [title, setTitle] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  useEffect(() => {
    setFrame(null);
    setTitle(null);
    setCurrentUrl(null);
    setBrowserState("connecting");
    if (!botId) return;
    let source: EventSource | null = null;
    let disposed = false;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (disposed || source || document.hidden) return;
      source = new EventSource(`/api/bots/${encodeURIComponent(botId)}/computer/live`);
      const current = source;
      startupTimer = setTimeout(() => {
        if (!disposed && source === current) { setBrowserState("unavailable"); setFrame(null); setTitle(null); }
      }, 10_000);
      source.onmessage = (message) => {
        if (disposed || source !== current) return;
        let event: LiveViewEvent;
        try {
          event = JSON.parse(message.data) as LiveViewEvent;
        } catch {
          return;
        }
        if (event.type === "frame") { clearTimeout(startupTimer); setFrame(`data:image/jpeg;base64,${event.jpeg}`); }
        else if (event.type === "status") {
          clearTimeout(startupTimer);
          setBrowserState(event.browser);
          setTitle(event.title ?? null);
          if (typeof event.currentUrl === "string") setCurrentUrl(event.currentUrl);
          if (event.browser !== "ready") setFrame(null);
        }
      };
      // A missing/offline stream must not look like an endless initial load.
      // EventSource still retries normally and a later frame/status recovers it.
      source.onerror = () => { if (!disposed && source === current) { clearTimeout(startupTimer); setBrowserState("unavailable"); setFrame(null); setTitle(null); } };
    };
    const disconnect = () => {
      clearTimeout(startupTimer);
      source?.close();
      source = null;
      setFrame(null);
      setTitle(null);
    };
    const onVisibility = () => {
      if (document.hidden) disconnect();
      else { setBrowserState("connecting"); connect(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    connect();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, [botId]);
  return { frame, browserState, title, currentUrl };
}

export function LiveComputer({ bot, threadId, onTakeover }: { bot: Bot; threadId: string; onTakeover?: (bot: Bot) => void }) {
  const { frame, browserState, title } = useLiveComputer(bot.id);
  return (
    <section className="context-computer">
      <div className="section-heading">
        <h3>
          <Monitor size={15} /> Computer
        </h3>
        {browserState === "ready" && frame && (
          <span className="live-badge">
            <i /> Live
          </span>
        )}
      </div>
      {frame ? (
        <img alt={`${bot.name}’s current browser screen, updating live`} src={frame} />
      ) : (
        <div className="computer-placeholder">
          <Monitor size={30} strokeWidth={1} />
          <p>
            {browserState === "ready"
              ? "Browser is open. Waiting for the first frame…"
              : browserState === "connecting"
                ? "Checking…"
                : browserState === "unavailable"
                  ? "The live screen is unavailable right now."
                  : "No browser open right now. It appears here the moment work opens one."}
          </p>
        </div>
      )}
      <p>
        {title || "Browser screen"} ·{" "}
        {browserState === "ready" && frame ? "live view" : "waiting for activity"}
      </p>
      {onTakeover && (
        <button className="text-action" onClick={() => onTakeover(bot)}>
          Open Agent Computer <ArrowRight size={13} />
        </button>
      )}
      <small>Viewing this does not start a computer or grant access.</small>
    </section>
  );
}

/** The teammate's own screen, Grok Bot "Agent Computer" style: watch the work
 * live, then take control only for the step that needs a human — a password,
 * a code, a check. Control is explicit and never granted by watching.
 *
 * Direct manipulation: once armed, the screen itself is the control. Click a
 * field and type — keystrokes go straight to the page, one by one, exactly
 * like a real browser. There is deliberately no separate typing box: typing
 * somewhere else is the design this replaces. Nothing typed is stored, logged
 * or sent to the model. */
export function ComputerTakeover({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const { frame, browserState, title, currentUrl } = useLiveComputer(bot.id);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tabs, setTabs] = useState<Array<{ id: string; url: string; title: string; active: boolean }>>([]);
  const [urlField, setUrlField] = useState("");
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlOverride, setUrlOverride] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    const prior = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      prior?.focus();
    };
  }, []);
  type TabView = { tabs: Array<{ id: string; url: string; title: string; active: boolean }>; url: string; title: string };
  const readTabs = async () => {
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/browser/tabs`, { cache: "no-store" });
      if (response.ok) {
        const view = (await response.json()) as TabView;
        setTabs(view.tabs);
      }
    } catch { /* The strip stays empty until the browser answers. */ }
  };
  useEffect(() => {
    setTabs([]);
    setUrlOverride(null);
    setEditingUrl(false);
    void readTabs();
  }, [bot.id]);
  // A dead browser has no tabs: clear the strip instead of showing ghosts.
  useEffect(() => {
    if (browserState === "stopped" || browserState === "unavailable") setTabs([]);
  }, [browserState]);
  // The live stream wins once it reports a different address.
  useEffect(() => {
    if (currentUrl && currentUrl !== urlOverride) setUrlOverride(null);
  }, [currentUrl]);
  const applyTabView = (view: TabView) => {
    setTabs(view.tabs);
    if (view.url) setUrlOverride(view.url);
  };
  const fail = (error: unknown, fallback: string) =>
    setNotice(error instanceof Error ? error.message : fallback);
  const send = (op: DirectOp) => {
    if (!armed) return;
    const path =
      op.kind === "click" ? "click" : op.kind === "press" ? "press" : op.kind === "text" ? "type" : "scroll";
    const body =
      op.kind === "click"
        ? { x: op.x, y: op.y }
        : op.kind === "press"
          ? { key: op.key }
          : op.kind === "text"
            ? { value: op.value, replace: false }
            : { x: op.x, y: op.y, deltaY: op.deltaY };
    void takeoverAction(bot.id, path, body).then(
      () => setNotice(""),
      (error: unknown) => setNotice(error instanceof Error ? error.message : "That control needs another try."),
    );
  };
  const openAddress = (raw: string) => {
    if (!armed || busy || !raw.trim()) return;
    const url = raw.trim();
    setBusy(true);
    setNotice("");
    fetch(`/api/bots/${encodeURIComponent(bot.id)}/browser/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "That page could not be opened.");
      setEditingUrl(false);
      void readTabs();
    }).catch((error: unknown) => {
      fail(error, "That page could not be opened.");
    }).finally(() => setBusy(false));
  };
  const tabOp = (method: string, url: string, body?: Record<string, unknown>) => {
    if (!armed || busy) return;
    setBusy(true);
    setNotice("");
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The browser did not respond.");
      applyTabView(data as TabView);
    }).catch((error: unknown) => {
      fail(error, "The browser did not respond.");
    }).finally(() => setBusy(false));
  };
  const shownUrl = editingUrl ? urlField : (urlOverride || currentUrl || "");
  const ready = browserState === "ready";
  return (
    <dialog
      ref={dialogRef}
      className="computer-takeover"
      aria-label={`${bot.name}’s Agent Computer`}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
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
          if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
        }
      }}
    >
      <header>
        <h2>
          <Monitor size={17} /> {bot.name}’s Agent Computer
        </h2>
        <button aria-label="Close Agent Computer" onClick={onClose}>
          <X size={19} />
        </button>
      </header>
      <div className="takeover-toolbar">
        <button
          className={armed ? "takeover-switch armed" : "takeover-switch"}
          onClick={() => {
            setArmed((value) => !value);
            setNotice("");
          }}
          aria-pressed={armed}
        >
          <ShieldCheck size={15} /> {armed ? "In control — click to act" : "Take control"}
        </button>
      </div>
      <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
        {tabs.map((tab) => (
          <div key={tab.id} role="tab" aria-selected={tab.active} className={tab.active ? "browser-tab active" : "browser-tab"}>
            <button
              className="browser-tab-name"
              disabled={!armed || busy}
              title={tab.url || "Blank tab"}
              onClick={() => tabOp("POST", `/api/bots/${encodeURIComponent(bot.id)}/browser/tabs/${encodeURIComponent(tab.id)}/select`)}
            >
              {tab.title || "New tab"}
            </button>
            <button
              className="browser-tab-close"
              disabled={!armed || busy || tabs.length <= 1}
              aria-label={`Close ${tab.title || "blank tab"}`}
              onClick={() => tabOp("DELETE", `/api/bots/${encodeURIComponent(bot.id)}/browser/tabs/${encodeURIComponent(tab.id)}`)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="browser-tab-new"
          disabled={!armed || busy}
          aria-label="Open a new tab"
          onClick={() => tabOp("POST", `/api/bots/${encodeURIComponent(bot.id)}/browser/tabs`, {})}
        >
          <Plus size={14} />
        </button>
      </div>
      <form
        className="browser-bar"
        onSubmit={(event) => {
          event.preventDefault();
          openAddress(urlField);
        }}
      >
        <button
          type="button"
          aria-label="Go back"
          disabled={!armed || busy || !ready}
          onClick={() => tabOp("POST", `/api/bots/${encodeURIComponent(bot.id)}/browser/nav`, { to: "back" })}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          aria-label="Go forward"
          disabled={!armed || busy || !ready}
          onClick={() => tabOp("POST", `/api/bots/${encodeURIComponent(bot.id)}/browser/nav`, { to: "forward" })}
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          aria-label="Reload this page"
          disabled={!armed || busy || !ready}
          onClick={() => tabOp("POST", `/api/bots/${encodeURIComponent(bot.id)}/browser/nav`, { to: "reload" })}
        >
          <RotateCw size={13} />
        </button>
        <Globe2 size={14} />
        <input
          value={shownUrl}
          onChange={(event) => setUrlField(event.target.value)}
          onFocus={(event) => {
            setEditingUrl(true);
            setUrlField(urlOverride || currentUrl || "");
            event.currentTarget.select();
          }}
          onBlur={() => setEditingUrl(false)}
          placeholder={ready ? "Search or enter an address" : "Browser address"}
          aria-label="Browser address. Type an address and press Enter to open it."
          spellCheck={false}
          disabled={!armed || busy}
        />
      </form>
      <div className="takeover-screen-frame">
        {frame ? (
          <DirectScreen
            image={frame}
            alt={`${bot.name}'s browser, updating live`}
            interactive={armed}
            badge="Click a field, then type"
            label={
              armed
                ? "Live browser screen. Click a field, then type — keys go straight to the page."
                : "Live browser screen. Turn on Take control to interact."
            }
            send={send}
            onInactiveClick={() => setNotice("Turn on Take control to click inside this screen.")}
            empty={null}
          />
        ) : (
          <div className="computer-placeholder">
            <Monitor size={30} strokeWidth={1} />
            <p>
              {ready
                ? "Browser is open. Waiting for the first frame…"
                : browserState === "connecting"
                  ? "Checking…"
                  : browserState === "unavailable"
                    ? "The live screen is unavailable right now."
                    : "No browser open right now. Open a page above to begin."}
            </p>
          </div>
        )}
      </div>
      <p className="takeover-caption" aria-live="polite">
        {notice || (title ? `${title} · live` : ready ? "Live view of this teammate's browser" : "Waiting for activity")}
      </p>
      <p className="takeover-hint">
        {armed
          ? "Click a field, then type — keys go straight to the page, like a real browser. Nothing typed is stored or sent to the model."
          : "Turn on Take control, then click and type directly in the screen."}
      </p>
      <small className="takeover-boundary">
        Control reaches only this teammate’s already-running browser. Approvals
        and access limits still apply; watching does not grant anything.
      </small>
    </dialog>
  );
}
