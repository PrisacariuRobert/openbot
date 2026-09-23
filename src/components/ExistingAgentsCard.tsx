import { useEffect, useState } from "react";
import { ArrowDownToLine, CheckCircle2, LoaderCircle } from "lucide-react";

type Found = { path: string; kind: "hermes" | "openclaw"; name: string; memories: number; skills: number; jobs: number; importedBotId: string | null };
type Result = { name: string; memories: number; skills: number; routines: number; warnings: string[] };

/** "We found your Hermes team": agents already on this Mac, one click each.
 * Hidden entirely when there is nothing to bring over. */
export function ExistingAgentsCard({ onOpen }: { onOpen: (botId: string) => void }) {
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, Result & { botId: string }>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/imports/profile/discover", { credentials: "same-origin" }).then((response) => response.ok ? response.json() : { profiles: [] }).then((value: { profiles: Found[] }) => setFound(value.profiles || [])).catch(() => {});
  }, []);
  const waiting = found.filter((profile) => !profile.importedBotId || done[profile.path]);
  if (!waiting.length) return null;
  async function bringOver(profile: Found) {
    setBusy(profile.path); setError("");
    try {
      const response = await fetch("/api/imports/profile/apply", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: profile.path }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "The import did not finish. Nothing was changed.");
      setDone((current) => ({ ...current, [profile.path]: value }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The import did not finish."); }
    finally { setBusy(null); }
  }
  const source = waiting.every((profile) => profile.kind === "hermes") ? "Hermes" : waiting.every((profile) => profile.kind === "openclaw") ? "OpenClaw" : "Hermes and OpenClaw";
  return <section className="workspace-import-preview existing-agents" aria-label={`Agents found in ${source}`}>
    <h3>Your {source} team can come along.</h3>
    <p>Personality, memories and skills move over; automations arrive paused for you to review. Keys, chat history and the originals stay where they are.</p>
    <ul>{waiting.map((profile) => {
      const result = done[profile.path];
      return <li key={profile.path}>
        <span><strong>{profile.name}</strong><small>{[profile.memories && `${profile.memories} ${profile.memories === 1 ? "memory" : "memories"}`, profile.skills && `${profile.skills} ${profile.skills === 1 ? "skill" : "skills"}`, profile.jobs && `${profile.jobs} automation${profile.jobs === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "Personality only"}</small>
          {result && <small className="existing-agents-result">{result.warnings.find((warning) => /paused/.test(warning)) || "Imported."} Choose an AI connection before their first task.</small>}</span>
        {result
          ? <button onClick={() => onOpen(result.botId)}><CheckCircle2 size={16} /> Set up {result.name}</button>
          : <button className="button-primary" disabled={Boolean(busy)} onClick={() => void bringOver(profile)}>{busy === profile.path ? <LoaderCircle className="spinner" size={16} /> : <ArrowDownToLine size={16} />} Bring over</button>}
      </li>;
    })}</ul>
    {error && <p role="alert" className="panel-error">{error}</p>}
  </section>;
}
