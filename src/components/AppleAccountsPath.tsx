import { useEffect, useState } from "react";
import { Check, Circle, ExternalLink, LoaderCircle } from "lucide-react";
import "./apple-accounts.css";

/** The recommended way to give teammates Gmail and Google Calendar (task J5): add the
 * Google account to the Mac's own Mail and Calendar, which Sidemates already reads.
 * No Google Cloud project, OAuth client or Google verification is needed. */

type MacPermissions = { available: false } | { available: true; fullDiskAccess: "granted" | "missing" | "unknown" };

const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function AppleAccountsPath({ macAccessEnabled }: { macAccessEnabled: boolean }) {
  const [mac, setMac] = useState<MacPermissions | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const read = () => void fetch("/api/mac/permissions", { cache: "no-store" }).then((response) => response.json()).then((next: MacPermissions) => { if (alive) setMac(next); }).catch(() => { if (alive) setMac({ available: false }); });
    read();
    // macOS settings change outside the studio: read again when the window comes back.
    window.addEventListener("focus", read);
    return () => { alive = false; window.removeEventListener("focus", read); };
  }, []);

  const act = async (key: string, request: () => Promise<Response>) => {
    setBusy(key); setError("");
    try {
      const response = await request();
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "That didn’t work. Try again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That didn’t work. Try again."); }
    finally { setBusy(null); }
  };

  const onThisMac = mac?.available === true;
  const rows = [
    {
      key: "accounts", done: null as boolean | null,
      title: "Add Google to this Mac",
      why: "System Settings → Internet Accounts → Google, with Mail and Calendars turned on.",
      action: onThisMac ? <button type="button" disabled={busy !== null} onClick={() => void act("accounts", () => post("/api/mac/permissions/open", { pane: "internet-accounts" }))}>Open Internet Accounts <ExternalLink size={13} aria-hidden="true" /></button> : null,
    },
    {
      key: "mac", done: macAccessEnabled,
      title: "Files & apps on this Mac",
      why: "Lets teammates read Mail and Calendar. Anything that changes something still asks you first.",
      action: macAccessEnabled ? null : <button type="button" disabled={busy !== null} onClick={() => {
        if (window.confirm("Let every teammate inspect visible files and accessible app controls on this Mac? Actions such as moving files, clicking and typing will still ask first.")) void act("mac", () => post("/api/settings", { macAccessEnabled: true }, "PATCH"));
      }}>Turn on</button>,
    },
    {
      key: "disk", done: onThisMac ? mac.fullDiskAccess === "granted" : null,
      title: "Full Disk Access",
      why: "So teammates can read your mail. macOS also asks once for Calendar when it's first used.",
      action: onThisMac && mac.fullDiskAccess !== "granted" ? <button type="button" disabled={busy !== null} onClick={() => void act("disk", () => post("/api/mac/permissions/open", { pane: "full-disk-access" }))}>Open System Settings</button> : null,
    },
  ];

  return <section className="apple-accounts" aria-labelledby="apple-accounts-heading">
    <span className="apple-accounts-eyebrow">Recommended for Gmail and Google Calendar</span>
    <h3 id="apple-accounts-heading">Use the Mail and Calendar apps on this Mac</h3>
    <p>Add your Google account to the Mac's own Mail and Calendar, and your teammates can read them there. There's no Google Cloud project to set up and no Google sign-in inside Sidemates.</p>
    {mac === null ? <p className="apple-accounts-note" role="status"><LoaderCircle size={14} className="spinner" aria-hidden="true" /> Checking this Mac…</p>
      : !onThisMac ? <p className="apple-accounts-note">Do this on the Mac that runs Sidemates.</p> : null}
    <ol>
      {rows.map((row) => <li key={row.key} className={row.done ? "done" : ""}>
        <span className="apple-accounts-mark" aria-hidden="true">{row.done ? <Check size={16} /> : <Circle size={14} />}</span>
        <span className="apple-accounts-text"><strong>{row.title}</strong><small>{row.why}</small>{row.done !== null && <small className="apple-accounts-state">{row.done ? "On" : "Off"}</small>}</span>
        {busy === row.key ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : row.action}
      </li>)}
    </ol>
    {error && <p className="send-error" role="alert">{error}</p>}
    <p className="apple-accounts-note">Need Gmail's own connection instead, with your own Google Cloud project? It's under Direct connection settings → Google Workspace.</p>
  </section>;
}
