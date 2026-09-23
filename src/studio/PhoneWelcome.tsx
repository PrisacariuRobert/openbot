import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, Check, LoaderCircle, Plus, Share } from "lucide-react";
import { enablePushNotifications, isIOS, isStandalone, pushEnabled } from "./push";
import "./phone-welcome.css";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallPrompt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event as InstallPrompt; });
}

const DONE_KEY = "openbot.phoneWelcome";
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Private browsing. */ } };

/** The phone camera opened /pair#ticket: trade the one-time ticket for this
 * browser's own device session, then open the studio. */
export function PhonePairing() {
  const [error, setError] = useState("");
  useEffect(() => {
    const ticket = window.location.hash.slice(1);
    // Drop the ticket from the address bar and history straight away.
    history.replaceState(null, "", "/pair");
    const name = isIOS() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android phone" : "Phone browser";
    void fetch("/api/auth/pair-browser", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket, name }) })
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "This code didn’t work.");
        window.location.replace("/?welcome=phone");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "This code didn’t work."));
  }, []);
  return <main className="studio-access"><section>
    <span className={`access-mark${error ? "" : " is-opening"}`}><img src="/design/openbot-face.svg" width="26" height="26" alt="" /></span>
    <p className="overline">OPENBOT</p>
    <h1>{error ? "Let’s try that again." : "Connecting this phone."}</h1>
    <p>{error ? <>{error} On your Mac, open <strong>Settings → Your phone</strong> and scan the new code.</> : "One moment — your team is on its way."}</p>
    {!error && <LoaderCircle className="spinner" size={21} aria-label="Connecting" />}
  </section></main>;
}

/** After pairing (and the first time the Home Screen app opens): make it a
 * real app, then offer notifications — one short sheet, never a nag. */
export function PhoneWelcome() {
  const params = new URLSearchParams(window.location.search);
  const justPaired = params.get("welcome") === "phone";
  const standalone = isStandalone();
  const phone = window.matchMedia?.("(max-width: 820px)").matches && (isIOS() || /Android/.test(navigator.userAgent));
  const [open, setOpen] = useState(() => justPaired || (phone && standalone && read(DONE_KEY) !== "done" && !pushEnabled()));
  const [notify, setNotify] = useState<"idle" | "busy" | "on" | string>(pushEnabled() ? "on" : "idle");
  const [installed, setInstalled] = useState(standalone);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (justPaired) { params.delete("welcome"); history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`); }
  }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  if (!open) return null;
  const close = () => { write(DONE_KEY, "done"); dialog.current?.close(); setOpen(false); };
  const canNotify = !(isIOS() && !standalone);
  const turnOn = async () => {
    setNotify("busy");
    try { const result = await enablePushNotifications(); setNotify(result.ok ? "on" : result.message); }
    catch (cause) { setNotify(cause instanceof Error ? cause.message : "Notifications didn’t turn on."); }
  };
  return <dialog ref={dialog} className="phone-welcome" aria-labelledby="phone-welcome-title" onCancel={close}>
    <div className="phone-welcome-grabber" aria-hidden="true" />
    <span className="phone-welcome-mark"><img src="/design/openbot-face.svg" width="30" height="30" alt="" /></span>
    <h2 id="phone-welcome-title" tabIndex={-1} autoFocus>{justPaired ? "You’re connected." : "Welcome to OpenBot."}</h2>
    <p className="phone-welcome-lead">Your team is on this phone now. Ask for anything; the answer comes back here.</p>
    <ol className="phone-welcome-steps">
      {!installed && <li>
        <span className="phone-welcome-icon"><Plus size={17} /></span>
        <div>
          <strong>Put OpenBot on your Home Screen</strong>
          {isIOS()
            ? <small>Tap <Share size={13} aria-label="Share" className="inline-icon" /> Share at the bottom of Safari, then <b>Add to Home Screen</b>. It opens like any other app.</small>
            : installPrompt
              ? <button type="button" className="phone-welcome-action" onClick={() => void installPrompt!.prompt().then(() => installPrompt!.userChoice).then((choice) => { if (choice.outcome === "accepted") setInstalled(true); })}>Install OpenBot</button>
              : <small>Open your browser’s menu and choose <b>Add to Home screen</b> or <b>Install app</b>.</small>}
        </div>
      </li>}
      <li>
        <span className="phone-welcome-icon"><Bell size={17} /></span>
        <div>
          <strong>Know when your team is done</strong>
          {notify === "on" ? <small className="phone-welcome-done"><Check size={13} /> Notifications are on.</small>
            : canNotify ? <>
              <small>A gentle buzz when work finishes or needs your okay.</small>
              <button type="button" className="phone-welcome-action" disabled={notify === "busy"} onClick={() => void turnOn()}>{notify === "busy" ? <LoaderCircle size={15} className="spin" /> : null}Turn on notifications</button>
              {notify !== "idle" && notify !== "busy" && <small className="phone-welcome-note" role="status">{notify}</small>}
            </>
            : <small>Once OpenBot is on your Home Screen, open it from there to turn these on.</small>}
        </div>
      </li>
    </ol>
    <button type="button" className="primary full-width phone-welcome-close" onClick={close}>Start chatting <ArrowRight size={16} /></button>
  </dialog>;
}
