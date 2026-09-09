import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe2, Keyboard, Monitor, MousePointer2, ShieldCheck, X } from "lucide-react";
import type { Bot } from "../shared/types";

export type LiveComputerState = "connecting" | "ready" | "stopped" | "unavailable";

type LiveViewEvent =
  | { type: "frame"; jpeg: string }
  | { type: "status"; browser: "ready" | "stopped" | "unavailable"; title?: string | null; currentUrl?: string | null }
  | { type: "ping" };

type TakeoverResult = { url: string; title: string; screenshot: string | null };

const VIEWPORT = { width: 1280, height: 820 };
const TAKEOVER_KEYS = ["Tab", "Enter", "Escape", "Backspace"] as const;

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
  useEffect(() => {
    setFrame(null);
    setTitle(null);
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
  return { frame, browserState, title };
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
 * a code, a check. Control is explicit and never granted by watching. */
export function ComputerTakeover({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const { frame, browserState, title } = useLiveComputer(bot.id);
  const [armed, setArmed] = useState(false);
  const [entry, setEntry] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
  const run = async (action: () => Promise<unknown>) => {
    if (!armed || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That control needs another try.");
    } finally {
      setBusy(false);
    }
  };
  const clickScreen = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!armed) {
      setNotice("Turn on Take control to click inside this screen.");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * VIEWPORT.width);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * VIEWPORT.height);
    void run(() => takeoverAction(bot.id, "click", { x, y }));
  };
  const sendKey = (key: (typeof TAKEOVER_KEYS)[number]) => {
    void run(() => takeoverAction(bot.id, "key", { key }));
  };
  const typeEntry = (replace: boolean) => {
    if (!entry) return;
    const value = entry;
    setEntry("");
    void run(() => takeoverAction(bot.id, "type", { value, replace }));
  };
  const openAddress = () => {
    void run(async () => {
      const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/browser/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: address }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "That page could not be opened.");
      }
      setAddress("");
    });
  };
  const ready = browserState === "ready";
  return (
    <dialog
      ref={dialogRef}
      className="computer-takeover"
      aria-label={`${bot.name}’s Agent Computer`}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
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
            setEntry("");
            setNotice("");
          }}
          aria-pressed={armed}
        >
          <ShieldCheck size={15} /> {armed ? "In control — click to act" : "Take control"}
        </button>
        <form
          className="takeover-address"
          onSubmit={(event) => {
            event.preventDefault();
            if (address) openAddress();
          }}
        >
          <Globe2 size={14} />
          <input
            disabled={!armed || busy}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Open a page in this browser"
            aria-label="Browser address"
          />
          <button disabled={!armed || busy || !address.trim()}>Open</button>
        </form>
      </div>
      <div className="takeover-screen-frame">
        {frame ? (
          <button
            className={armed ? "takeover-screen armed" : "takeover-screen"}
            onClick={clickScreen}
            disabled={busy || !ready}
            aria-label={
              armed
                ? "Interactive screen. Click to control this teammate's browser."
                : "Live screen. Turn on Take control to interact."
            }
          >
            <img alt={`${bot.name}'s browser, updating live`} src={frame} draggable={false} />
            {busy && <span className="takeover-busy">Working…</span>}
            {armed && !busy && (
              <i>
                <MousePointer2 size={13} /> Click anywhere to act
              </i>
            )}
          </button>
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
      <section className="takeover-controls">
        <div className="takeover-copy">
          <Keyboard size={15} />
          <span>
            <strong>Private keyboard</strong>
            <small>
              Text goes directly to the focused field. It is never saved in chat
              or added to the bot’s activity.
            </small>
          </span>
        </div>
        <form
          className="takeover-type"
          onSubmit={(event) => {
            event.preventDefault();
            typeEntry(false);
          }}
        >
          <input
            disabled={!armed || busy || !ready}
            type="password"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            placeholder="Type into the selected field"
            autoComplete="off"
            aria-label="Private text to type into the focused field"
          />
          <button type="button" disabled={!armed || busy || !entry || !ready} onClick={() => typeEntry(true)}>
            Replace
          </button>
          <button className="primary" disabled={!armed || busy || !entry || !ready}>
            Type
          </button>
        </form>
        <div className="takeover-keys">
          {TAKEOVER_KEYS.map((key) => (
            <button key={key} disabled={!armed || busy || !ready} onClick={() => sendKey(key)}>
              {key}
            </button>
          ))}
        </div>
      </section>
      <small className="takeover-boundary">
        Control reaches only this teammate’s already-running browser. Approvals
        and access limits still apply; watching does not grant anything.
      </small>
    </dialog>
  );
}
