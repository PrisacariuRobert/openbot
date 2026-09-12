import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Plus } from "lucide-react";
import type { Bot, MascotKind, ProviderStatus } from "../shared/types";
import { isFreeTierModel } from "../shared/provider-config";
import { Character } from "./Character";
import { AppearancePicker } from "./AppearancePicker";
import { ChoiceMenu } from "./ChoiceMenu";
import { createTeammatePayload } from "./create-teammate-payload";
import "./create-teammate.css";

interface ImportPlan {
  kind: string;
  name: string;
  role: string;
  instructionsTruncated: boolean;
  memories: Array<{ kind: string; text: string }>;
  skills: Array<{ name: string; slug: string; description: string; files: number }>;
  hints: { provider: string | null; model: string | null };
  skipped: string[];
  warnings: string[];
}

interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  members: Array<{ name: string; role: string }>;
}

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
  const [importPath, setImportPath] = useState(""),
    [importPlan, setImportPlan] = useState<ImportPlan | null>(null),
    [importBusy, setImportBusy] = useState(false),
    [importNote, setImportNote] = useState("");
  const [sheetMode, setSheetMode] = useState<"create" | "import">("create");
  const [teamTemplates, setTeamTemplates] = useState<TeamTemplate[] | null>(null),
    [teamBusy, setTeamBusy] = useState<string | null>(null),
    [teamNote, setTeamNote] = useState(""),
    [teamError, setTeamError] = useState("");
  useEffect(() => {
    void fetch("/api/team-templates").then(async (response) => {
      if (response.ok) setTeamTemplates(await response.json() as TeamTemplate[]);
    }).catch(() => { /* The starter-team option simply stays hidden. */ });
  }, []);
  async function installTeam(template: TeamTemplate) {
    setTeamBusy(template.id);
    setTeamNote("");
    setTeamError("");
    try {
      const response = await fetch(`/api/team-templates/${encodeURIComponent(template.id)}/install`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json() as { bots?: Bot[]; error?: string };
      if (!response.ok || !result.bots?.length) throw new Error(result.error || "The team could not be created.");
      setTeamNote(`${result.bots.map((bot) => bot.name).join(", ")} joined the roster. Connect a model for each in their settings.`);
      onCreated(result.bots[0]!);
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "The team could not be created.");
    } finally {
      setTeamBusy(null);
    }
  }
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
        body: JSON.stringify(createTeammatePayload({
          name,
          role,
          instructions,
          color,
          mascot,
          providerInstanceId: providerId,
          model,
        })),
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
  async function previewImport() {
    setImportBusy(true);
    setImportNote("");
    setError("");
    try {
      const response = await fetch("/api/imports/profile/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: importPath.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That folder could not be read.");
      setImportPlan(result as ImportPlan);
    } catch (cause) {
      setImportPlan(null);
      setImportNote(cause instanceof Error ? cause.message : "That folder could not be read.");
    } finally {
      setImportBusy(false);
    }
  }
  async function applyImport() {
    if (submitting.current || !importPlan) return;
    submitting.current = true;
    setImportBusy(true);
    setImportNote("");
    setError("");
    try {
      const response = await fetch("/api/imports/profile/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: importPath.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The import did not finish.");
      if (!result.bot) throw new Error("The import finished but the teammate is not visible yet. Refresh and check the roster.");
      onCreated(result.bot as Bot);
    } catch (cause) {
      setImportNote(cause instanceof Error ? cause.message : "The import did not finish. Nothing was changed.");
    } finally {
      submitting.current = false;
      setImportBusy(false);
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
      <div className="sheet-mode" role="tablist" aria-label="How to add a teammate">
        <button
          type="button"
          role="tab"
          aria-selected={sheetMode === "create"}
          className={sheetMode === "create" ? "current" : ""}
          onClick={() => setSheetMode("create")}
        >
          Create new
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sheetMode === "import"}
          className={sheetMode === "import" ? "current" : ""}
          onClick={() => setSheetMode("import")}
        >
          Import from Hermes or OpenClaw
        </button>
      </div>
      {sheetMode === "create" && (
        <>
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
        <small>Their job is used as instructions unless you add more.</small>
      </label>
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
              detail: isFreeTierModel(item) ? "Free tier" : undefined,
            }))}
            onChange={setModel}
          />
        </div>
      )}
      {connection && isFreeTierModel(model) && (
        <p className="boundary-note">Free-tier models often stall on multi-step work in our tests — tasks fail honestly, but nothing gets done. For real jobs, pick a full model.</p>
      )}
      {!validSelection && <p className="boundary-note required-selection">Choose a connected AI service and model before creating this teammate.</p>}
      <div className="teammate-section">
        <label>
          Additional instructions
          <textarea
            rows={3}
            maxLength={2000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Add what a good result looks like, and what they should ask you before doing."
          />
        </label>
      </div>
      <div className="teammate-section teammate-appearance">
        <span className="section-label">Appearance</span>
        <AppearancePicker name={name} shape={mascot} color={color} onShape={setMascot} onColor={setColor} />
      </div>
      <details className="connection-management" open={providers && !providers.instances.some((item) => item.connected) ? true : undefined}>
      <summary>Manage AI connections</summary>
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
      </details>
      <p className="boundary-note">
        No task starts yet. Existing Google-account permissions aren’t shared
        with this new teammate. Studio-wide Mac access, if enabled, still
        applies. Browser and private-computer access start off.
      </p>
      <details className="character-customize profile-import">
        <summary>Start with a ready-made team</summary>
        <small className="panel-note">Three teammates with starter jobs. They arrive without a model — pick one for each after. Nothing grants access by itself.</small>
        {teamTemplates && (
          <div className="team-template-list">
            {teamTemplates.map((template) => (
              <div className="team-template-row" key={template.id}>
                <span>
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                </span>
                <button
                  type="button"
                  disabled={teamBusy !== null}
                  onClick={() => void installTeam(template)}
                >
                  {teamBusy === template.id ? "Creating…" : `Add ${template.members.length} teammates`}
                </button>
              </div>
            ))}
          </div>
        )}
        {teamNote && <p role="status">{teamNote}</p>}
        {teamError && <p role="alert" className="send-error">{teamError}</p>}
      </details>
        </>
      )}
      {sheetMode === "import" && (
        <div className="profile-import-panel">
          <p className="panel-note">Bring a teammate you already raised in <strong>Hermes</strong> or <strong>OpenClaw</strong>: their persona, memories and text skills move; keys and chat history stay put. Point this at the profile folder.</p>
          <label>
            Profile folder
            <input
              value={importPath}
              onChange={(event) => setImportPath(event.target.value)}
              placeholder="~/.hermes/profiles/researcher or ~/.openclaw"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="import-actions">
            <button
              type="button"
              disabled={importBusy || !importPath.trim()}
              onClick={() => void previewImport()}
            >
              {importBusy && !importPlan ? "Checking…" : "Preview what moves"}
            </button>
            {importPlan && (
              <button
                type="button"
                className="text-action"
                disabled={importBusy}
                onClick={() => void applyImport()}
              >
                {importBusy ? "Importing…" : "Import as a new teammate"}
              </button>
            )}
          </div>
          {importPlan && (
            <div className="import-plan">
              <p>
                <strong>{importPlan.name}</strong> · {importPlan.kind} profile
              </p>
              {importPlan.role && <p className="import-role">{importPlan.role}</p>}
              <ul>
                <li>{importPlan.memories.length} memory notes</li>
                <li>
                  {importPlan.skills.length} skill{importPlan.skills.length === 1 ? "" : "s"}
                  {importPlan.skills.length ? ` (${importPlan.skills.map((skill) => skill.name).slice(0, 3).join(", ")}${importPlan.skills.length > 3 ? "…" : ""})` : ""}
                </li>
                {importPlan.hints.model && (
                  <li>Was using {importPlan.hints.model} — pick a connection after the import</li>
                )}
              </ul>
              <p className="import-skipped">Not imported: {importPlan.skipped.join(" ")}</p>
              {importPlan.warnings.map((warning) => (
                <p key={warning} role="status">{warning}</p>
              ))}
            </div>
          )}
          {importNote && (
            <p role="alert" className="send-error">{importNote}</p>
          )}
        </div>
      )}
      {providers && providerId && !validSelection && model && (
        <p role="status">This connection or model is no longer available. Choose an available connection and model; your draft is still here.</p>
      )}
      {error && (
        <p role="alert" className="send-error">
          {error}
        </p>
      )}
      {sheetMode === "create" && (
        <button
          className="primary full-width"
          disabled={
            busy ||
            !name.trim() ||
            !role.trim() ||
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
      )}
    </form>
  );
}
