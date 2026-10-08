import { useEffect, useState } from "react";
import { Check, Circle, Copy, LoaderCircle } from "lucide-react";
import { SettingsCard, SettingsGroup, SettingsRow } from "../studio/Settings";
import { OBSERVED_MILESTONES, formatElapsed, setupTimelineText, type SetupTimelineView } from "../shared/setup-timeline";
import "./setup-timeline-panel.css";

const dateTime = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fullDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Settings → Your setup: how the first days went, read from this Mac only. */
export function SetupTimelinePanel() {
  const [view, setView] = useState<SetupTimelineView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    setError("");
    try {
      // Viewing this panel means the studio is open; note it first so "Opened the studio" is never behind.
      await fetch("/api/setup/visit", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
      const response = await fetch("/api/setup", { credentials: "same-origin" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Your setup timeline couldn't be read.");
      setView(value as SetupTimelineView);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your setup timeline couldn't be read.");
    }
  }
  useEffect(() => { void load(); }, []);

  async function copy() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(setupTimelineText(view, (iso) => fullDate.format(new Date(iso))));
      setCopied("Copied. Paste it into a note or a bug report.");
    } catch {
      setCopied("Couldn't copy. Select the timeline and copy it instead.");
    }
  }

  if (error) return <section className="panel-error setup-timeline-error" role="alert">
    <strong>Couldn’t show your setup timeline.</strong>
    <p>{error}</p>
    <button type="button" onClick={() => void load()}>Try again</button>
  </section>;
  if (!view) return <p className="setup-timeline-loading" role="status"><LoaderCircle className="spinner" size={17} aria-hidden="true" /> Loading your setup timeline…</p>;

  const start = Date.parse(view.milestones.find((entry) => entry.name === "installed")?.at ?? "");
  const reached = view.milestones.filter((entry) => entry.at).length;
  return <div className="setup-timeline">
    <p className="setup-timeline-intro">{reached} of {view.milestones.length} steps so far. Sidemates doesn’t send this timeline anywhere.</p>
    <SettingsGroup title="Timeline" action={<button type="button" className="setup-timeline-copy" onClick={() => void copy()}><Copy size={15} aria-hidden="true" />Copy</button>}>
      <SettingsCard>
        <ol className="setup-timeline-steps">
          {view.milestones.map((entry) => {
            const at = entry.at ? Date.parse(entry.at) : NaN;
            const unknown = !entry.at && view.olderThanTimeline && OBSERVED_MILESTONES.includes(entry.name);
            const when = entry.at
              ? [entry.detail, dateTime.format(new Date(at)), entry.name !== "installed" && Number.isFinite(start) ? `${formatElapsed(at - start)} after the first start` : null].filter(Boolean).join(" · ")
              : unknown ? "Not recorded: your studio is older than this timeline" : undefined;
            return <li key={entry.name} className={entry.at ? "done" : "waiting"}>
              <SettingsRow
                title={entry.label}
                description={when}
                control={entry.at ? <span className="setup-timeline-state"><Check size={16} aria-hidden="true" />Done</span> : <span className="setup-timeline-state"><Circle size={14} aria-hidden="true" />{unknown ? "Unknown" : "Not yet"}</span>}
              />
            </li>;
          })}
        </ol>
      </SettingsCard>
    </SettingsGroup>
    {copied && <p className="capability-notice" role="status">{copied}</p>}
    <p className="setup-timeline-note">A finished job is a task in which a teammate used a tool or saved a file. Coming back counts days on this Mac’s clock.</p>
  </div>;
}
