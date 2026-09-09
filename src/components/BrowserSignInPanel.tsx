import { useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import type { BrowserSignInHandoff } from "../shared/browser-sign-in";
import "./browser-sign-in.css";

type View = { siteOrigin: string; screenshot: string | null; botId?: string; review?: { level: "ok" | "warn"; reason: string | null } };
const VIEWPORT = { width: 1280, height: 820 };
const NAMED_KEYS = /^(?:Enter|Backspace|Delete|Tab|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|F(?:[1-9]|1[0-2]))$/;

function point(target: Element, clientX: number, clientY: number) {
  const rect = target.getBoundingClientRect();
  return {
    x: Math.min(VIEWPORT.width, Math.max(0, (clientX - rect.left) / rect.width * VIEWPORT.width)),
    y: Math.min(VIEWPORT.height, Math.max(0, (clientY - rect.top) / rect.height * VIEWPORT.height)),
  };
}

export function BrowserSignInPanel({ approvalId, handoff, disabled = false, onBusyChange, onInteraction }: {
  approvalId: string; handoff?: BrowserSignInHandoff; disabled?: boolean;
  onBusyChange: (busy: boolean) => void; onInteraction: () => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [botId, setBotId] = useState<string | null>(handoff?.botId ?? null);
  const [frame, setFrame] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [bridge, setBridge] = useState<"idle" | "opened" | "importing" | "imported">("idle");
  const [bridgeNote, setBridgeNote] = useState("");
  const screen = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const started = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const hasView = Boolean(view) && !needsRefresh;
  const open = useRef(false);
  open.current = hasView;

  // One flight at a time for the opening view: it starts the headed browser
  // and returns the fallback picture for when streaming is unavailable.
  async function control() {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}/sign-in`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ operation: "view" }),
      });
      if (!response.ok) throw new Error("Couldn’t open the private browser. Try again in a moment.");
      const result = await response.json() as View;
      if (typeof result.siteOrigin !== "string" || (result.screenshot !== null && !/^data:image\/(jpeg|png);base64,/.test(result.screenshot))) throw new Error("The private browser is unavailable. Try again in a moment.");
      setView(result); setNeedsRefresh(false);
      if (typeof result.botId === "string" && result.botId) setBotId(result.botId);
    } catch (reason) {
      setNeedsRefresh(true); setError(reason instanceof Error ? reason.message : "Try opening the private browser again.");
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }

  // Interactions are queued in order and never block the screen: the live
  // stream shows their result. Nothing typed here is stored, logged or sent
  // to the model — the request body is dropped after the website gets it.
  function send(input: Record<string, unknown>) {
    if (disabled || !open.current) return;
    onInteraction();
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}/sign-in`, {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(input),
        });
        if (!response.ok) throw new Error("The website didn’t take that input. Your last input may have reached it anyway; it wasn’t retried.");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The website didn’t take that input.");
      }
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void control();
    return () => { started.current = false; };
  }, [disabled]);
  useEffect(() => { if (disabled) started.current = false; }, [disabled]);

  // Live frames for this teammate's own browser — the same picture the
  // headed window shows, streamed into the app. Falls back to the opening
  // screenshot and a slow refresh while the stream is not running.
  useEffect(() => {
    if (!botId) return;
    const source = new EventSource(`/api/bots/${encodeURIComponent(botId)}/computer/live`);
    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; jpeg?: string; browser?: string; currentUrl?: string | null };
        if (message.type === "frame" && typeof message.jpeg === "string" && message.jpeg.length > 0) {
          setFrame(`data:image/jpeg;base64,${message.jpeg}`);
          setLive(true); setNeedsRefresh(false);
        } else if (message.type === "status") {
          setLive(message.browser === "ready");
          if (typeof message.currentUrl === "string") setAddress(message.currentUrl);
          else if (message.browser === "stopped") setLive(false);
        }
      } catch { /* Ignore malformed keepalives. */ }
    };
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [botId]);

  // Fallback refresh while no stream is running, so the pane never freezes
  // silently.
  const liveRef = useRef(false);
  liveRef.current = live;
  useEffect(() => {
    if (!hasView || live) return;
    const timer = window.setInterval(() => { if (!liveRef.current) void control(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [hasView, live, disabled]);

  // Typing goes straight to the page, like a real browser: printable keys and
  // navigation keys are forwarded one by one; paste inserts at the cursor.
  // Modifier-only presses and command combos stay local.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !open.current) return;
    if (event.metaKey || event.ctrlKey || event.altKey) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        navigator.clipboard?.readText?.().then((value) => {
          if (value) send({ operation: "type", value, replace: false });
        }).catch(() => { /* Clipboard stayed local. */ });
      }
      return;
    }
    if (["Meta", "Shift", "Control", "Alt", "CapsLock", "Dead", "Process"].includes(event.key)) return;
    if (event.key.length > 1 && !NAMED_KEYS.test(event.key)) return;
    event.preventDefault();
    send({ operation: "press", key: event.key });
  };

  // Wheel events must be non-passive to be preventDefault-ed, so the pane
  // scrolls the page instead of the app.
  useEffect(() => {
    const node = screen.current;
    if (!node) return;
    let last = 0;
    const onWheel = (event: WheelEvent) => {
      if (disabled || !open.current) return;
      event.preventDefault();
      const now = Date.now();
      if (now - last < 90) return;
      last = now;
      const at = point(node, event.clientX, event.clientY);
      send({ operation: "scroll", x: at.x, y: at.y, deltaY: Math.max(-3_000, Math.min(3_000, event.deltaY)) });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [disabled]);

  // Put the caret on the page as soon as the screen is up, so typing works
  // without an extra click.
  useEffect(() => {
    if (hasView && screen.current) screen.current.focus({ preventScroll: true });
  }, [hasView]);

  // Own-browser bridge: the provider-refusal fallback. The owner signs in
  // with their real Chrome, quits it, and the session is imported into the
  // teammate's private browser. Nothing typed there goes through this app.
  async function bridgeAction(action: "open" | "import") {
    if (disabled || (action === "import" && bridge === "importing")) return;
    setError("");
    if (action === "open") { setBridge("opened"); setBridgeNote(""); }
    else setBridge("importing");
    onInteraction();
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}/own-browser`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ action }),
      });
      const result = await response.json() as { opened?: boolean; imported?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "The bridge did not answer. Try again.");
      if (action === "open") setBridgeNote("Chrome just opened the sign-in page.");
      else { setBridge("imported"); setBridgeNote(`Imported ${result.imported ?? 0} session cookies into your teammate’s browser.`); }
    } catch (reason) {
      if (action === "import") setBridge("opened");
      else setBridge("idle");
      setBridgeNote("");
      setError(reason instanceof Error ? reason.message : "The bridge did not answer. Try again.");
    }
  }

  const origin = view?.siteOrigin || handoff?.siteOrigin || "Private sign-in";
  const picture = frame || view?.screenshot || null;
  return <section className="browser-sign-in" aria-label="Private website sign-in">
    <header className="browser-sign-in-title">
      <LockKeyhole size={20} strokeWidth={1.5} />
      <div><strong>{origin.replace(/^https?:\/\//, "")}</strong><span>Your teammate is waiting for you.</span></div>
      <i className="browser-sign-in-badge" data-live={live} aria-hidden="true"><span />Live</i>
    </header>
    <div className="browser-sign-in-bar">
      <span className="browser-sign-in-url" title={address || origin}>{address || origin || "Opening…"}</span>
      <button type="button" aria-label="Refresh the screen" disabled={disabled || busy} onClick={() => void control()}><RefreshCw size={14} /></button>
    </div>
    {view?.review?.level === "warn" && view.review.reason && (
      <p className="browser-sign-in-warn" role="alert">{view.review.reason}</p>
    )}
    <div
      ref={screen}
      className="browser-sign-in-screen"
      tabIndex={0}
      role="application"
      aria-label="Live website screen. Click, scroll and type directly — this drives the private browser."
      onClick={(event) => {
        if (disabled || !open.current || event.detail === 0) return;
        const at = point(event.currentTarget, event.clientX, event.clientY);
        send({ operation: "click", x: at.x, y: at.y });
      }}
      onKeyDown={onKeyDown}
      onDragStart={(event) => event.preventDefault()}
    >
      {picture
        ? <img src={picture} alt="Live private browser screen" draggable={false} />
        : <p className="browser-sign-in-waiting">{busy ? "Opening the private browser…" : "Waiting for the screen…"}</p>}
    </div>
    <p className="browser-sign-in-hint">Click a field, then type. Your teammate is paused while you sign in — nothing here is captured while you type, and passwords and codes stay out of the conversation and the model. Once the right account is open, continue your task below.</p>
    {bridge === "idle" && !needsRefresh && (
      <button type="button" className="browser-sign-in-bridge-link" onClick={() => void bridgeAction("open")}>Provider refuses this browser? Sign in with your own Chrome instead</button>
    )}
    {bridge !== "idle" && bridge !== "imported" && (
      <div className="browser-sign-in-bridge" role="group" aria-label="Sign in with your own browser">
        <strong>Use your own Chrome</strong>
        <ol>
          <li>Sign in to <em>{origin.replace(/^https?:\/\//, "")}</em> in the Chrome window that opened.</li>
          <li>Quit Chrome completely (Cmd+Q) so it saves the session.</li>
          <li>Import the session into your teammate’s browser.</li>
        </ol>
        <div className="browser-sign-in-bridge-actions">
          <button type="button" disabled={disabled || bridge === "importing"} onClick={() => void bridgeAction("import")}>{bridge === "importing" ? "Importing…" : "Import the session"}</button>
          <button type="button" className="browser-sign-in-bridge-link" onClick={() => void bridgeAction("open")}>Open Chrome again</button>
          <button type="button" className="browser-sign-in-bridge-link" onClick={() => { setBridge("idle"); setBridgeNote(""); }}>Back to the private screen</button>
        </div>
        {bridgeNote && <p role="status">{bridgeNote}</p>}
      </div>
    )}
    {bridge === "imported" && (
      <p className="browser-sign-in-bridge-done" role="status">{bridgeNote} Continue your task below.</p>
    )}
    {error && <p role="alert">{error} <button type="button" onClick={() => void control()}>Try again</button></p>}
  </section>;
}
