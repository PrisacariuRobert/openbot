import { useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { SettingsCard, SettingsGroup, SettingsRow, SegmentedControl } from "../studio/Settings";
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
  ProviderConnectionTest,
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
  connectionTests: Record<string, ProviderConnectionTest>;
  onTestConnection: (id: string) => Promise<ProviderConnectionTest>;
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
  connectionTests,
  onTestConnection,
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
  const testTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };
  // Only a live reply counts as tested. Saved sign-ins and keys stay "Saved,
  // not tested" until the owner runs the tiny probe (uses a little allowance).
  const connectionTest = (connectionId: string | null, actionKey: string) => {
    if (!connectionId) return null;
    const receipt = connectionTests[connectionId];
    return (
      <div className="ai-test">
        <span className="ai-test-state" title={receipt?.error || undefined}>
          {receipt
            ? receipt.ok
              ? `Tested · ${modelLabel(receipt.model)} · ${testTime(receipt.testedAt)}`
              : `Last test failed · ${testTime(receipt.testedAt)}`
            : "Saved, not tested"}
        </span>
        <button
          type="button"
          className="ai-action"
          disabled={busy !== null}
          onClick={() => void act(actionKey, async () => {
            const receipt = await onTestConnection(connectionId);
            if (!receipt.ok && receipt.error) setError(receipt.error);
          })}
        >
          {busy === actionKey ? (
            <LoaderCircle size={15} className="spinner" />
          ) : receipt ? (
            "Test again"
          ) : (
            "Test connection"
          )}
        </button>
      </div>
    );
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
  const accountRow = (entry: ProviderCatalogEntry) => {
    const receipt = entry.connectionId ? connectionTests[entry.connectionId] : null;
    return (
      <SettingsRow
        key={entry.id}
        title={entry.name}
        description={
          <>
            <span>
              {entry.connected
                ? "Sign-in found on this host"
                : entry.installed
                  ? entry.badge
                  : "Runtime not found on this host"}
            </span>
            <details className="about-connection">
              <summary>
                <ChevronRight size={13} className="about-chevron" />
                About this connection
              </summary>
              <p>
                {entry.description} {entry.note}
              </p>
            </details>
          </>
        }
        control={
          entry.connected ? (
            <div className="ai-side">
              <div className="ai-status-stack">
                <span className="ai-signed-in">
                  <Check size={13} /> Signed in
                </span>
                {entry.connectionId && (
                  <span className="ai-test-state" title={receipt?.error || undefined}>
                    {receipt
                      ? receipt.ok
                        ? `Tested · ${modelLabel(receipt.model)} · ${testTime(receipt.testedAt)}`
                        : `Last test failed · ${testTime(receipt.testedAt)}`
                      : "Saved, not tested"}
                  </span>
                )}
              </div>
              {entry.connectionId && (
                <button
                  type="button"
                  className="ai-action"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(`test-${entry.id}`, async () => {
                      const r = await onTestConnection(entry.connectionId!);
                      if (!r.ok && r.error) setError(r.error);
                    })
                  }
                >
                  {busy === `test-${entry.id}` ? (
                    <LoaderCircle size={14} className="spinner" />
                  ) : receipt ? (
                    "Test again"
                  ) : (
                    "Test connection"
                  )}
                </button>
              )}
            </div>
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
                <LoaderCircle size={14} className="spinner" />
              ) : (
                "Connect"
              )}
            </button>
          ) : (
            <span className="ai-state">
              {entry.installed ? "Set up in OpenCode" : "Setup needed"}
            </span>
          )
        }
      />
    );
  };
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
        <SettingsGroup title="First, choose the AI you want to use">
          <p>No provider is selected for you. Connect an account below, or choose an existing connection. You can mix models later.</p>
          <SettingsCard>
            <SettingsRow
              title="Provider"
              control={
                <select aria-label="First provider" value={initialConnection} onChange={(event) => { setInitialConnection(event.target.value); setInitialModel(""); }} disabled={busy !== null}>
                  <option value="">Choose your provider</option>
                  {provider?.instances.filter((entry) => entry.connected && entry.models?.length).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
              }
            />
            <SettingsRow
              title="Model"
              control={
                <select aria-label="First model" value={initialModel} onChange={(event) => setInitialModel(event.target.value)} disabled={!initial || busy !== null}>
                  <option value="">Choose a model</option>
                  {initial?.models?.map((model) => <option key={model} value={model}>{modelLabel(model)}{isFreeTierModel(model) ? " · Free tier" : ""}</option>)}
                </select>
              }
            >
              {isFreeTierModel(initialModel) && (
                <p className="settings-row-note">Free-tier models often stall on multi-step work in our tests — tasks fail honestly, but nothing gets done. For real jobs, pick a full model.</p>
              )}
            </SettingsRow>
            <SettingsRow
              title="Unconfigured teammates"
              description="Uses your account’s limits or API billing. OpenBot will not silently switch providers. The first task checks actual model access."
              control={
                <button className="button-primary" disabled={busy !== null || !initial?.connected || !initial?.models?.includes(initialModel)} onClick={() => void act("initial", () => onChooseInitial(initialConnection, initialModel))}>
                  Use this AI for unconfigured teammates
                </button>
              }
            />
          </SettingsCard>
        </SettingsGroup>
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
      <div className="provider-mode-wrapper">
        <SegmentedControl
          ariaLabel="Connection type"
          value={mode}
          onChange={(val) => setMode(val as "accounts" | "api")}
          options={[
            { value: "accounts", label: "Accounts & Sign-in" },
            { value: "api", label: "API Keys & Local Models" },
          ]}
        />
      </div>
      {mode === "accounts" ? (
        <SettingsGroup title="Accounts & subscriptions">
          <SettingsCard>
            {provider?.catalog
              .filter((entry) => !["gitlab", "xai"].includes(entry.id))
              .map(accountRow)}
          </SettingsCard>
          <details className="ai-more">
            <summary>More accounts</summary>
            <SettingsCard>
              {provider?.catalog
                .filter((entry) => ["gitlab", "xai"].includes(entry.id))
                .map(accountRow)}
            </SettingsCard>
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
        </SettingsGroup>
      ) : (
        <SettingsGroup title="API & local models">
          {savedApis.length > 0 && (
            <SettingsCard>
              {savedApis.map((entry) => (
                <SettingsRow
                  key={entry.id}
                  title={entry.name}
                  description={
                    <>
                      <span>{entry.apiConfig?.baseUrl || "API-key connection"}</span>
                      {!connectionTests[entry.id] && <span>{entry.note}</span>}
                    </>
                  }
                  control={
                    <div className="ai-side">
                      <span className="ai-state">Saved</span>
                      {connectionTest(entry.id, `test-${entry.id}`)}
                    </div>
                  }
                />
              ))}
            </SettingsCard>
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
            <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
              <h4>Add a model connection</h4>
              <SettingsCard>
                <SettingsRow
                  title="Provider"
                  control={
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
                  }
                />
                <SettingsRow
                  title="Connection name"
                  control={
                    <input
                      aria-label="Connection name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={60}
                    />
                  }
                />
                <SettingsRow
                  title="API address"
                  description={
                    isLocalModelUrl(baseUrl)
                      ? "Localhost means the computer running OpenBot, not your phone. Start your model server there first."
                      : "Use the API address supplied by your provider, not its chat website."
                  }
                  control={
                    <input
                      aria-label="API address"
                      type="url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://your-provider.com/v1"
                      spellCheck={false}
                      required
                    />
                  }
                />
                <SettingsRow
                  title="Model IDs"
                  description="Choose models that support tool use for agent work. Names and compatibility come from your provider."
                  control={
                    <textarea
                      aria-label="Model IDs"
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
                  }
                />
                <SettingsRow
                  title={isLocalModelUrl(baseUrl) ? "API key (optional)" : "API key"}
                  control={
                    <input
                      aria-label="API key"
                      type="password"
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      autoComplete="new-password"
                      required={!isLocalModelUrl(baseUrl)}
                    />
                  }
                />
              </SettingsCard>
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
        </SettingsGroup>
      )}
      <SettingsGroup title="Choose for each teammate">
        <p>Mix models to suit the work. Changes apply to their next task.</p>
        <SettingsCard>
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
                <SettingsRow
                  title="Connection"
                  control={
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
                  }
                />
                <SettingsRow
                  title="Model"
                  control={
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
                  }
                >
                  {isFreeTierModel(bot.model) && (
                    <p className="settings-row-note">Free-tier models often stall on multi-step work in our tests — tasks fail honestly, but nothing gets done. For real jobs, pick a full model.</p>
                  )}
                </SettingsRow>
              </div>
            );
          })}
        </SettingsCard>
      </SettingsGroup>
      <p className="ai-footnote">
        OpenCode {provider?.version || "not detected"} · Connections belong to
        this OpenBot host.
      </p>
    </div>
  );
}
