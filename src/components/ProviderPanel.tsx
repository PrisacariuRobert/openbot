import { useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  Plus,
  Server,
} from "lucide-react";
import { ProviderIcon } from "../ProviderIcon";
import {
  isFreeTierModel,
  isLocalModelUrl,
  providerInput,
  type ProviderInput,
} from "../shared/provider-config";
import type {
  ApiConnectionConfig,
  Bot,
  ProviderCatalogEntry,
  ProviderLoginAttempt,
  ProviderStatus,
} from "../shared/types";
import "./provider-panel.css";

type Props = {
  provider: ProviderStatus | null;
  bots: Bot[];
  onUpdateBot: (id: string, patch: Partial<Bot>) => Promise<void>;
  onChooseInitial: (providerInstanceId: string, model: string) => Promise<void>;
  onAdd: (input: ProviderInput) => Promise<void>;
  onConnect: (id: ProviderCatalogEntry["id"]) => Promise<ProviderLoginAttempt>;
  onFinish: (id: string, code: string) => Promise<void>;
  mascot: (bot: Bot) => ReactNode;
  modelLabel: (model: string) => string;
};

const presets: Record<
  string,
  { name: string; baseUrl: string; protocol: ApiConnectionConfig["protocol"] }
> = {
  openai: {
    name: "OpenAI API",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai",
  },
  anthropic: {
    name: "Anthropic API",
    baseUrl: "https://api.anthropic.com/v1",
    protocol: "anthropic",
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openai-compatible",
  },
  ollama: {
    name: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    protocol: "openai-compatible",
  },
  lmstudio: {
    name: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    protocol: "openai-compatible",
  },
  custom: {
    name: "My model server",
    baseUrl: "",
    protocol: "openai-compatible",
  },
};

export function ProviderPanel({
  provider,
  bots,
  onUpdateBot,
  onChooseInitial,
  onAdd,
  onConnect,
  onFinish,
  mascot,
  modelLabel,
}: Props) {
  const [mode, setMode] = useState<"accounts" | "api">("accounts");
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState("openai");
  const [name, setName] = useState(presets.openai!.name);
  const [baseUrl, setBaseUrl] = useState(presets.openai!.baseUrl);
  const [protocol, setProtocol] =
    useState<ApiConnectionConfig["protocol"]>("openai");
  const [modelIds, setModelIds] = useState("");
  const [secret, setSecret] = useState("");
  const [attempt, setAttempt] = useState<ProviderLoginAttempt | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialConnection, setInitialConnection] = useState("");
  const [initialModel, setInitialModel] = useState("");
  const needsChoice = bots.some((bot) => !bot.providerInstanceId && !bot.model);
  const initial = provider?.instances.find((entry) => entry.id === initialConnection);
  // Polling refreshes the shared status. Never keep showing an old waiting
  // attempt after the runtime has reported success or failure.
  const currentAttempt =
    provider?.loginAttempts.find((entry) => entry.id === attempt?.id) ||
    attempt;
  const signedIn = provider?.catalog.some(
    (entry) => entry.id === currentAttempt?.providerId && entry.connected,
  );
  const savedApis =
    provider?.instances.filter((entry) => entry.authMode === "api_key") || [];
  const act = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That didn’t work. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };
  const choosePreset = (value: string) => {
    const next = presets[value]!;
    setPreset(value);
    setName(next.name);
    setBaseUrl(next.baseUrl);
    setProtocol(next.protocol);
    setSecret("");
    setModelIds("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void act("save", async () => {
      const parsed = providerInput.safeParse({
        name,
        provider: "custom",
        authMode: "api_key",
        runtime: "opencode",
        secret,
        apiConfig: {
          baseUrl,
          protocol,
          modelIds: modelIds
            .split(/[\n,]/)
            .map((id) => id.trim())
            .filter(Boolean),
        },
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message || "Check your connection details.",
        );
      await onAdd(parsed.data);
      setSecret("");
      setAdding(false);
      setNotice(
        "Connection saved. Choose it for a teammate below. It hasn’t been tested yet.",
      );
    });
  };
  const accountRow = (entry: ProviderCatalogEntry) => (
    <article className="ai-account" key={entry.id}>
      <span className={`ai-brand ai-brand-${entry.id}`}>
        <ProviderIcon id={entry.id} />
      </span>
      <div className="ai-account-copy">
        <h4>{entry.name}</h4>
        <p>
          {entry.connected
            ? "Sign-in found on this host"
            : entry.installed
              ? entry.badge
              : "Runtime not found on this host"}
        </p>
        <details>
          <summary>About this connection</summary>
          <p>
            {entry.description} {entry.note}
          </p>
        </details>
      </div>
      {entry.connected ? (
        <span className="ai-signed-in">
          <Check size={13} /> Signed in
        </span>
      ) : entry.canConnect ? (
        <button
          type="button"
          className="ai-action"
          disabled={busy !== null}
          onClick={() =>
            void act(entry.id, async () => {
              const next = await onConnect(entry.id);
              setAttempt(next);
              if (next.url)
                window.open(next.url, "_blank", "noopener,noreferrer");
            })
          }
        >
          {busy === entry.id ? (
            <LoaderCircle size={15} className="spinner" />
          ) : (
            "Connect"
          )}
        </button>
      ) : (
        <span className="ai-state">
          {entry.installed ? "Set up in OpenCode" : "Setup needed"}
        </span>
      )}
    </article>
  );
  return (
    <div className="provider-settings">
      <header className="ai-intro">
        <div>
          <h3>Your AI, your choice.</h3>
          <p>
            Use an account you already have, an API key, or a model running on
            your computer.
          </p>
        </div>
        {bots[0] && (
          <div className="ai-intro-mascot" aria-hidden="true">
            {mascot(bots[0])}
          </div>
        )}
      </header>
      {!provider && <p role="status">Checking your connections…</p>}
      {needsChoice && (
        <section className="ai-team" aria-label="Choose your first AI provider">
          <h3>First, choose the AI you want to use</h3>
          <p>No provider is selected for you. Connect an account below, or choose an existing connection. You can mix models later.</p>
          <div className="ai-teammate-fields">
            <label>Provider
              <select aria-label="First provider" value={initialConnection} onChange={(event) => { setInitialConnection(event.target.value); setInitialModel(""); }} disabled={busy !== null}>
                <option value="">Choose your provider</option>
                {provider?.instances.filter((entry) => entry.connected && entry.models?.length).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            <label>Model
              <select aria-label="First model" value={initialModel} onChange={(event) => setInitialModel(event.target.value)} disabled={!initial || busy !== null}>
                <option value="">Choose a model</option>
                {initial?.models?.map((model) => <option key={model} value={model}>{modelLabel(model)}{isFreeTierModel(model) ? " · Free tier" : ""}</option>)}
              </select>
            </label>
          </div>
          {isFreeTierModel(initialModel) && (
            <p className="ai-help">Free-tier models often stall on multi-step work in our tests — tasks fail honestly, but nothing gets done. For real jobs, pick a full model.</p>
          )}
          <p className="ai-help">Uses your account’s limits or API billing. OpenBot will not silently switch providers. The first task checks actual model access.</p>
          <button className="button-primary" disabled={busy !== null || !initial?.connected || !initial?.models?.includes(initialModel)} onClick={() => void act("initial", () => onChooseInitial(initialConnection, initialModel))}>
            Use this AI for unconfigured teammates
          </button>
        </section>
      )}
      {error && (
        <div className="ai-feedback ai-error" role="alert">
          <CircleAlert size={17} />
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div className="ai-feedback" role="status">
          <Check size={17} />
          <p>{notice}</p>
        </div>
      )}
      <div className="ai-mode-switch" role="group" aria-label="Connection type">
        <button
          type="button"
          aria-pressed={mode === "accounts"}
          onClick={() => setMode("accounts")}
        >
          Accounts & subscriptions
        </button>
        <button
          type="button"
          aria-pressed={mode === "api"}
          onClick={() => setMode("api")}
        >
          API & local models
        </button>
      </div>
      {mode === "accounts" ? (
        <section aria-label="Accounts and subscriptions">
          <div className="ai-list">
            {provider?.catalog
              .filter((entry) => !["gitlab", "xai"].includes(entry.id))
              .map(accountRow)}
          </div>
          <details className="ai-more">
            <summary>More accounts</summary>
            <div className="ai-list">
              {provider?.catalog
                .filter((entry) => ["gitlab", "xai"].includes(entry.id))
                .map(accountRow)}
            </div>
          </details>
          <p className="ai-help">
            Sign-in uses the installed provider runtime. A saved sign-in doesn’t
            guarantee model access; plan eligibility, provider rules, and usage
            limits still apply.
          </p>
          {currentAttempt &&
            !signedIn &&
            currentAttempt.status !== "connected" && (
              <div
                className="ai-login"
                role={currentAttempt.status === "failed" ? "alert" : "status"}
              >
                <strong>
                  {currentAttempt.status === "failed"
                    ? "Sign-in wasn’t completed"
                    : "Finish signing in"}
                </strong>
                <p>{currentAttempt.error || currentAttempt.instructions}</p>
                {currentAttempt.url && (
                  <a
                    href={currentAttempt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open sign-in page <ChevronRight size={13} />
                  </a>
                )}
                {currentAttempt.status === "waiting" &&
                  currentAttempt.callbackMode === "code" && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void act("code", async () => {
                          await onFinish(currentAttempt.id, code);
                          setCode("");
                        });
                      }}
                    >
                      <label>
                        Sign-in code
                        <input
                          value={code}
                          onChange={(event) => setCode(event.target.value)}
                          autoComplete="off"
                          required
                        />
                      </label>
                      <button className="ai-action" disabled={busy !== null}>
                        Finish
                      </button>
                    </form>
                  )}
              </div>
            )}
        </section>
      ) : (
        <section aria-label="API and local models">
          {savedApis.length > 0 && (
            <div className="ai-list">
              {savedApis.map((entry) => (
                <article key={entry.id} className="ai-account">
                  <span className="ai-brand">
                    <Server size={20} />
                  </span>
                  <div className="ai-account-copy">
                    <h4>{entry.name}</h4>
                    <p>{entry.apiConfig?.baseUrl || "API-key connection"}</p>
                    <p>{entry.note}</p>
                  </div>
                  <span className="ai-state">Saved</span>
                </article>
              ))}
            </div>
          )}
          {!adding ? (
            <button
              type="button"
              className="ai-add"
              onClick={() => {
                setAdding(true);
                setError(null);
              }}
            >
              <Plus size={17} /> Add API or local model
            </button>
          ) : (
            <form className="ai-form" onSubmit={submit}>
              <h4>Add a model connection</h4>
              <label>
                Provider
                <select
                  aria-label="Provider"
                  value={preset}
                  onChange={(event) => choosePreset(event.target.value)}
                >
                  {Object.entries(presets).map(([id, value]) => (
                    <option key={id} value={id}>
                      {id === "custom"
                        ? "Other compatible provider"
                        : value.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Connection name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={60}
                />
              </label>
              <label>
                API address
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://your-provider.com/v1"
                  spellCheck={false}
                  required
                />
              </label>
              <p className="ai-help">
                {isLocalModelUrl(baseUrl)
                  ? "Localhost means the computer running OpenBot, not your phone. Start your model server there first."
                  : "Use the API address supplied by your provider, not its chat website."}
              </p>
              <label>
                Model IDs
                <textarea
                  value={modelIds}
                  onChange={(event) => setModelIds(event.target.value)}
                  placeholder={
                    isLocalModelUrl(baseUrl)
                      ? "e.g. qwen3:8b"
                      : "Paste exact IDs from your provider, one per line"
                  }
                  rows={2}
                  spellCheck={false}
                  required
                />
              </label>
              <p className="ai-help">
                Choose models that support tool use for agent work. Names and
                compatibility come from your provider.
              </p>
              <label>
                API key{isLocalModelUrl(baseUrl) ? " (optional)" : ""}
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="new-password"
                  required={!isLocalModelUrl(baseUrl)}
                />
              </label>
              <details className="ai-advanced">
                <summary>Advanced connection options</summary>
                <label>
                  API format
                  <select
                    value={protocol}
                    onChange={(event) =>
                      setProtocol(
                        event.target.value as ApiConnectionConfig["protocol"],
                      )
                    }
                  >
                    <option value="openai-compatible">
                      OpenAI-compatible Chat Completions
                    </option>
                    <option value="openai">OpenAI Responses</option>
                    <option value="anthropic">Anthropic Messages</option>
                  </select>
                </label>
              </details>
              <p className="ai-help ai-key-note">
                <KeyRound size={14} /> Keys are encrypted in OpenBot’s local
                data. Saving won’t send a test request or charge your account.
              </p>
              <div className="ai-form-actions">
                <button
                  type="button"
                  className="ai-action"
                  onClick={() => {
                    setAdding(false);
                    setSecret("");
                  }}
                  disabled={busy !== null}
                >
                  Cancel
                </button>
                <button
                  className="ai-action ai-primary"
                  disabled={busy !== null}
                >
                  {busy === "save" ? "Saving…" : "Save connection"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      <section className="ai-team" aria-labelledby="ai-team-heading">
        <header>
          <h3 id="ai-team-heading">Choose for each teammate</h3>
          <p>Mix models to suit the work. Changes apply to their next task.</p>
        </header>
        {bots.map((bot) => {
          const connection = provider?.instances.find(
            (entry) => entry.id === bot.providerInstanceId,
          );
          const models = [
            ...new Set([bot.model, ...(connection?.models || [])].filter(Boolean)),
          ];
          return (
            <div key={bot.id} className="ai-teammate">
              <div className="ai-teammate-title">
                {mascot(bot)}
                <strong>{bot.name}</strong>
                <span>{bot.role}</span>
              </div>
              <div className="ai-teammate-fields">
                <label>
                  Connection
                  <select
                    aria-label={`${bot.name} connection`}
                    value={bot.providerInstanceId || ""}
                    disabled={busy !== null || !provider}
                    onChange={(event) => {
                      const next = provider?.instances.find(
                        (entry) => entry.id === event.target.value,
                      );
                      if (next?.defaultModel)
                        void act(bot.id, () =>
                          onUpdateBot(bot.id, {
                            providerInstanceId: next.id,
                            model: next.defaultModel,
                          }),
                        );
                    }}
                  >
                    {!connection && (
                      <option value="">Choose a connection</option>
                    )}
                    {provider?.instances.map((entry) => (
                      <option
                        key={entry.id}
                        value={entry.id}
                        disabled={!entry.defaultModel}
                      >
                        {entry.name}
                        {!entry.connected ? " · setup needed" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Model
                  <select
                    aria-label={`${bot.name} model`}
                    value={bot.model}
                    disabled={busy !== null || !connection?.connected}
                    onChange={(event) =>
                      void act(bot.id, () =>
                        onUpdateBot(bot.id, { model: event.target.value }),
                      )
                    }
                  >
                    {!bot.model && <option value="">Choose a model</option>}
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {modelLabel(model)}
                        {connection?.models?.includes(model)
                          ? isFreeTierModel(model) ? " · Free tier" : ""
                          : " · unavailable"}
                      </option>
                    ))}
                  </select>
                </label>
                {isFreeTierModel(bot.model) && (
                  <p className="ai-help">Free-tier models often stall on multi-step work in our tests — tasks fail honestly, but nothing gets done. For real jobs, pick a full model.</p>
                )}
              </div>
            </div>
          );
        })}
      </section>
      <p className="ai-footnote">
        OpenCode {provider?.version || "not detected"} · Connections belong to
        this OpenBot host.
      </p>
    </div>
  );
}
