import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Plus } from "lucide-react";
import type { Bot, MascotKind, ProviderStatus } from "../shared/types";
import { Character } from "./Character";
import { AppearancePicker } from "./AppearancePicker";
import { ChoiceMenu } from "./ChoiceMenu";
import "./create-teammate.css";

export function CreateTeammate({
  onCreated,
}: {
  onCreated: (bot: Bot) => void;
}) {
  const [name, setName] = useState(""),
    [role, setRole] = useState(""),
    [instructions, setInstructions] = useState("");
  const [color, setColor] = useState("#6757d9"),
    [mascot, setMascot] = useState<MascotKind>("nova");
  const [providerId, setProviderId] = useState(""),
    [model, setModel] = useState("");
  const [reload, setReload] = useState(0);
  const [providers, setProviders] = useState<ProviderStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const returned = () => setReload((value) => value + 1);
    window.addEventListener("focus", returned);
    return () => window.removeEventListener("focus", returned);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/provider", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Couldn’t load your AI connections. Close this sheet and try again.",
          );
        const result: ProviderStatus = await response.json();
        if (!abort.signal.aborted) { setProviders(result); setError(""); }
      })
      .catch((error: Error) => {
        if (!abort.signal.aborted) setError(error.message);
      });
    return () => abort.abort();
  }, [reload]);
  const connection = providers?.instances.find(
    (item) => item.id === providerId,
  );
  const validSelection = Boolean(connection?.connected && connection.models?.includes(model));
  async function create(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !validSelection) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          instructions,
          color,
          mascot,
          emoji: "●",
          providerInstanceId: providerId,
          model,
          browserEnabled: false,
          computerEnabled: false,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Couldn’t create your teammate.");
      onCreated(result as Bot);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="create-teammate" onSubmit={(event) => void create(event)}>
      <div className="new-character">
        <Character
          name={name || "Your teammate"}
          color={color}
          variant={mascot}
          mood={name ? "happy" : "curious"}
          size={104}
        />
        <p>
          A little personality.
          <br />
          <strong>A job that matters to you.</strong>
        </p>
      </div>
      <label>
        Name
        <input
          required
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What would you like to call them?"
          autoComplete="off"
        />
      </label>
      <label>
        Their job
        <input
          required
          maxLength={60}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="For example, help plan my week"
        />
      </label>
      <label>
        How should they help?
        <textarea
          required
          rows={3}
          maxLength={2000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Tell them what a good result looks like, and what they should ask you before doing."
        />
      </label>
      <details className="character-customize">
        <summary>Make them yours</summary>
        <AppearancePicker
          name={name}
          shape={mascot}
          color={color}
          onShape={setMascot}
          onColor={setColor}
        />
      </details>
      <div className="creation-field">
        <span>AI connection</span>
        <ChoiceMenu
          label="AI connection"
          value={providerId}
          placeholder={
            providers ? "Choose your AI service" : "Loading your connections…"
          }
          disabled={!providers}
          choices={(providers?.instances || [])
            .filter((item) => item.connected)
            .map((item) => ({ value: item.id, label: item.name }))}
          onChange={(value) => {
            setProviderId(value);
            setModel("");
          }}
        />
      </div>
      {connection && (
        <div className="creation-field">
          <span>Model</span>
          <ChoiceMenu
            label="Model"
            value={model}
            placeholder="Choose a model"
            choices={(connection.models || []).map((item) => ({
              value: item,
              label: item,
            }))}
            onChange={setModel}
          />
        </div>
      )}
      <a
        className="text-action"
        href="/?panel=provider"
        target="_blank"
        rel="noreferrer"
      >
        <Plus size={14} /> {providers?.instances.some((item) => item.connected) ? "Connect another AI service" : "Set up an AI connection"}
      </a>
      <p className="boundary-note">Setup opens separately so you won’t lose this draft. Return here afterward; your connections refresh automatically.</p>
      <button
        className="text-action"
        type="button"
        onClick={() => {
          setError("");
          setReload((value) => value + 1);
        }}
      >
        Refresh connections
      </button>
      <p className="boundary-note">
        No task starts yet. Existing Google-account permissions aren’t shared
        with this new teammate. Studio-wide Mac access, if enabled, still
        applies. Browser and private-computer access start off.
      </p>
      {providers && providerId && !validSelection && model && (
        <p role="status">This connection or model is no longer available. Choose an available connection and model; your draft is still here.</p>
      )}
      {error && (
        <p role="alert" className="send-error">
          {error}
        </p>
      )}
      <button
        className="primary full-width"
        disabled={
          busy ||
          !name.trim() ||
          !role.trim() ||
          !instructions.trim() ||
          !validSelection
        }
      >
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <ArrowRight size={17} />
        )}
        {busy ? "Creating…" : "Create teammate"}
      </button>
    </form>
  );
}
