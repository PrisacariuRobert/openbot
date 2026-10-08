import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import type { Bot, ProviderStatus } from "../shared/types";
import { FIRST_TEAMMATE, FIRST_TEAMMATE_READS_PERSONAL_DATA, firstRunModel } from "../shared/first-run";
import { modelChoices } from "../shared/provider-config";
import { BringYourAI } from "../components/BringYourAI";
import { Character } from "./Character";
import { ChoiceMenu } from "./ChoiceMenu";
import { Switch } from "./Settings";
import { guidedStage } from "./first-run-steps";
import { BrowserDownloadOffer } from "./BrowserDownloadOffer";
import "../components/bring-your-ai.css";
import "./create-teammate.css";
import "./guided-first-run.css";

/** The guided first run, drawn in place of the empty-studio welcome (never a
 * dialog): choose the AI, confirm the model, meet the first teammate. What to
 * try next appears in that teammate's conversation. */
export function GuidedFirstRun({ onClose, onCreated }: { onClose: () => void; onCreated: (bot: Bot) => void }) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState("");
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [name, setName] = useState("Scout");
  const [web, setWeb] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const stage = guidedStage({ connectionId, model });

  // Moving to a step puts focus on its heading, for keyboards and screen readers. Not on first load.
  // Each step starts at its top: the conversation area otherwise keeps to its bottom.
  const firstStage = useRef(true);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => section.current?.scrollIntoView({ block: "start" }));
    if (firstStage.current) firstStage.current = false;
    else heading.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  const loadProviders = async () => {
    const response = await fetch("/api/provider", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Your AI connections couldn't be read.");
    const status = await response.json() as ProviderStatus;
    setProviders(status);
    return status;
  };

  const pick = async (id: string) => {
    setError(""); setBusy(true);
    try {
      const status = await loadProviders();
      const connection = status.instances.find((item) => item.id === id);
      setConnectionId(id);
      setDraftModel(connection ? firstRunModel(connection, { readsPersonalData: FIRST_TEAMMATE_READS_PERSONAL_DATA }) : "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your AI connections couldn't be read."); }
    finally { setBusy(false); }
  };

  const connection = providers?.instances.find((item) => item.id === connectionId);
  const choices = modelChoices(connection?.models || []).filter((choice) => !choice.disabled);

  const create = async () => {
    if (!connectionId || !model || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/team-templates/starter-team/install`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerInstanceId: connectionId, model, members: [{ key: FIRST_TEAMMATE, browserEnabled: web }], onlyIfEmpty: true }),
      });
      const result = await response.json().catch(() => ({})) as { bots?: Bot[]; error?: string };
      // Another window finished first: carry on with the teammate it made.
      let bot = result.bots?.[0];
      if (!response.ok && !(response.status === 409 && bot)) throw new Error(result.error || "Your teammate couldn't be created. Try again.");
      if (response.ok && bot && name.trim() && name.trim() !== bot.name) {
        const renamed = await fetch(`/api/bots/${encodeURIComponent(bot.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
        if (renamed.ok) bot = await renamed.json() as Bot;
      }
      if (bot) onCreated(bot);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your teammate couldn't be created. Try again."); }
    finally { setBusy(false); }
  };

  const steps = ["Choose your AI", "Choose a model", "Meet your teammate"];
  const index = stage === "ai" ? 0 : stage === "model" ? 1 : 2;
  return <section ref={section} className="guided-run" aria-labelledby="guided-run-heading">
    <div className="guided-run-top">
      <ol className="guided-run-progress" aria-label="Setup steps">
        {steps.map((label, position) => <li key={label} aria-current={position === index ? "step" : undefined} className={position < index ? "done" : position === index ? "current" : ""}>{label}</li>)}
      </ol>
      <button type="button" className="guided-run-quiet" onClick={onClose}>Not now</button>
    </div>

    {stage === "ai" && <>
      <h2 id="guided-run-heading" ref={heading} tabIndex={-1}>How should your team think?</h2>
      <p className="guided-run-lead">Use an AI you already have. Sidemates never adds another bill.</p>
      <BringYourAI variant="first-run" onConnected={pick} />
      {busy && <p className="guided-run-note" role="status"><LoaderCircle size={14} className="spinner" aria-hidden="true" /> Checking your connection…</p>}
    </>}

    {stage === "model" && <>
      <h2 id="guided-run-heading" ref={heading} tabIndex={-1}>Which model should your teammate use?</h2>
      <p className="guided-run-lead">{connection ? `From ${connection.name}. You can change it any time.` : "Loading your connection…"}</p>
      {connection && (choices.length
        ? <div className="guided-run-field"><span>Model</span><ChoiceMenu label="Model" value={draftModel} placeholder="Choose a model" choices={choices} onChange={setDraftModel} /></div>
        : <p className="guided-run-note" role="status">This connection doesn’t offer a model your teammate can use. Go back and choose another AI.</p>)}
      <div className="guided-run-actions">
        <button type="button" onClick={() => { setConnectionId(null); setDraftModel(""); }}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <button type="button" className="primary" disabled={!draftModel} onClick={() => setModel(draftModel)}>Continue <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </>}

    {stage === "teammate" && <>
      <h2 id="guided-run-heading" ref={heading} tabIndex={-1}>Meet your first teammate</h2>
      <div className="guided-run-teammate">
        <Character name={name || "Scout"} variant="sprout" color="#299575" size={72} />
        <div>
          <label className="guided-run-field"><span>Name</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label>
          <p className="guided-run-role"><strong>Chief of staff.</strong> Plans your day and week, drafts messages, looks things up and keeps track of what’s waiting on you. Anything that sends, buys or changes something asks you first.</p>
        </div>
      </div>
      <div className="creation-toggle">
        <span>
          <strong>Can look things up on the web</strong>
          <small>Uses its own private browser. Anything that sends, buys or signs in still asks you first.</small>
        </span>
        <Switch label="Can look things up on the web" checked={web} onChange={setWeb} />
      </div>
      {web && <BrowserDownloadOffer />}
      <p className="guided-run-note">You can add a researcher or a writer later, when a job needs one.</p>
      <div className="guided-run-actions">
        <button type="button" onClick={() => setModel(null)} disabled={busy}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : null}Create {name.trim() || "teammate"} <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </>}

    {error && <p className="send-error guided-run-error" role="alert">{error}</p>}
  </section>;
}
