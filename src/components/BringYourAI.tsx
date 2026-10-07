import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronDown, ExternalLink, LoaderCircle } from "lucide-react";
import type { ProviderCatalogEntry, ProviderLoginAttempt, ProviderStatus } from "../shared/types";
import "./bring-your-ai.css";

/** Choosing the AI behind the team, in the order that costs people least:
 * free first, then subscriptions they already pay for, then a paid key.
 * Sidemates itself never adds a bill. The guided first run uses the same rows
 * in the developer plan's order (`variant="first-run"`), and there a working
 * connection can be picked with "Use this". */
export function BringYourAI({ onConnected, compact = false, variant = "default" }: { onConnected: (connectionId: string) => Promise<void> | void; compact?: boolean; variant?: "default" | "first-run" }) {
  const firstRun = variant === "first-run";
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [attempt, setAttempt] = useState<ProviderLoginAttempt | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const announced = useRef(new Set<string>());
  const load = async () => {
    const response = await fetch("/api/provider", { credentials: "same-origin" });
    if (response.ok) setStatus(await response.json() as ProviderStatus);
  };
  useEffect(() => { void load(); }, []);
  // While a sign-in is open in another tab, check back until it lands.
  useEffect(() => {
    if (!attempt || attempt.status !== "waiting") return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [attempt]);
  useEffect(() => {
    for (const entry of status?.catalog ?? []) {
      if (entry.connected && entry.connectionId && attempt?.providerId === entry.id && !announced.current.has(entry.id)) {
        announced.current.add(entry.id);
        setAttempt(null);
        void onConnected(entry.connectionId);
      }
    }
    const live = status?.loginAttempts?.find((item) => item.id === attempt?.id);
    if (live && live.status !== attempt?.status) setAttempt(live);
  }, [status]);
  const entry = (id: string) => status?.catalog?.find((item) => item.id === id);
  const nousConnected = Boolean(status?.instances?.some((item) => item.id === "nous-portal" && item.connected));
  const signIn = async (id: string) => {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/provider/connect", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerId: id }) });
      const next = await response.json() as ProviderLoginAttempt & { error?: string };
      if (!response.ok) throw new Error(next.error || "Sign-in couldn't start.");
      setAttempt(next);
      if (next.url) window.open(next.url, "_blank", "noopener,noreferrer");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in couldn't start."); }
    finally { setBusy(null); }
  };
  const finishWithCode = async (code: string) => {
    if (!attempt) return;
    setBusy("code"); setError("");
    try {
      const response = await fetch(`/api/provider/connect/${encodeURIComponent(attempt.id)}/callback`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "That code wasn't accepted.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That code wasn't accepted."); }
    finally { setBusy(null); }
  };

  const connected = (connectionId: string | null | undefined, name: string) => firstRun && connectionId
    ? <button type="button" className="byo-action byo-use" aria-label={`Use ${name}`} onClick={() => void onConnected(connectionId)}><Check size={14} aria-hidden="true" /> Use this</button>
    : <span className="byo-connected"><Check size={14} aria-hidden="true" /> Connected</span>;
  const checking = <span className="byo-unavailable" role="status">Checking…</span>;
  const account = (id: string, name: string, plan: string, free = false) => {
    const item = entry(id);
    const waiting = attempt?.providerId === id && attempt.status === "waiting";
    return (
      <li key={id} className="byo-row">
        <div className="byo-row-text">
          <strong>{name}{free && <span className="byo-free">Free plan</span>}</strong>
          <small>{plan}</small>
        </div>
        {!status ? checking : item?.connected ? connected(item.connectionId, name)
          : !item?.canConnect ? <span className="byo-unavailable">{id === "claude" ? "Needs Claude Code on this Mac" : "Not available here"}</span>
          : <button type="button" className="byo-action" disabled={busy !== null || waiting} onClick={() => void signIn(id)}>{busy === id || waiting ? <LoaderCircle size={14} className="spinner" aria-hidden="true" /> : null}{waiting ? "Waiting…" : "Sign in"}</button>}
      </li>
    );
  };

  const geminiRow = (
    <li key="gemini" className="byo-row byo-key-row">
      <div className="byo-row-text">
        <strong>Google Gemini{!entry("google")?.connected && <span className="byo-free">Free key</span>}</strong>
        <small>A free key from Google AI Studio — a Google account is enough, no card. Free-tier limits apply.</small>
      </div>
      {entry("google")?.connected
        ? connected(entry("google")?.connectionId, "Google Gemini")
        : <KeyPaste providerId="google" link="https://aistudio.google.com/apikey" linkLabel="Get a free key" placeholder="Paste your Gemini API key" onSaved={onConnected} />}
    </li>
  );
  const nousRow = (
    <li key="nous" className="byo-row byo-key-row">
      <div className="byo-row-text">
        <strong>Nous Portal{!nousConnected && <span className="byo-free">Free plan</span>}</strong>
        <small>A free plan with a rotating set of free models, from the makers of Hermes Agent. An account is enough, no card. Free models may use your requests to improve their service.</small>
      </div>
      {nousConnected
        ? connected("nous-portal", "Nous Portal")
        : <KeyPaste providerId="nous" link="https://portal.nousresearch.com" linkLabel="Create a free account" placeholder="Paste your Nous Portal API key" onSaved={onConnected} />}
    </li>
  );
  const openCodeRow = (
    <li key="opencode-go" className="byo-row byo-key-row">
      <div className="byo-row-text">
        <strong>OpenCode Go</strong>
        <small>No subscription? One key for fast, capable models — about $10 a month.</small>
      </div>
      {entry("opencode")?.connected
        ? connected(entry("opencode")?.connectionId, "OpenCode Go")
        : <KeyPaste providerId="opencode-go" link="https://opencode.ai/go" linkLabel="Get a key" placeholder="Paste your OpenCode Go key" onSaved={onConnected} />}
    </li>
  );
  const attemptBlock = attempt && attempt.status !== "connected" && (
    <div className="byo-attempt" role={attempt.status === "failed" ? "alert" : "status"}>
      <strong>{attempt.status === "failed" ? "Sign-in wasn’t completed" : "Finish signing in, then come back"}</strong>
      <p>{attempt.error || attempt.instructions}</p>
      {attempt.url && <a href={attempt.url} target="_blank" rel="noopener noreferrer">Open the sign-in page again <ExternalLink size={13} /></a>}
      {attempt.status === "waiting" && attempt.callbackMode === "code" && <CodeForm busy={busy === "code"} onSubmit={finishWithCode} />}
    </div>
  );
  const errorBlock = error && <p className="byo-error" role="alert">{error}</p>;

  if (firstRun) {
    // The developer plan's order: ChatGPT, Gemini, Claude Code, a model on this Mac, then everything else.
    // Apple Intelligence (task A4) takes the first slot when it ships.
    const ollama = status?.instances?.find((item) => item.connected && item.apiConfig && /:11434(\/|$)/.test(item.apiConfig.baseUrl));
    return (
      <section className={`byo is-first-run${compact ? " is-compact" : ""}`} aria-label="Choose the AI behind your team">
        <ul className="byo-list">
          {account("openai", "ChatGPT", "Plus, Pro or Business. Signs in through OpenCode for now.")}
          {geminiRow}
          {account("claude", "Claude", "Through the Claude Code on this Mac, with Pro or Max.")}
          <OllamaRow connectedId={ollama?.id} use={connected} onSaved={onConnected} />
        </ul>
        {attemptBlock}
        {errorBlock}
        <details className="byo-more">
          <summary>Other options <ChevronDown size={14} aria-hidden="true" /></summary>
          <ul className="byo-list">
            {nousRow}
            {account("github-copilot", "GitHub Copilot", "Pro, Pro+ or Business")}
            {account("xai", "Grok", "SuperGrok")}
            {openCodeRow}
            <li className="byo-row">
              <div className="byo-row-text">
                <strong>Any compatible API</strong>
                <small>OpenAI, Anthropic, OpenRouter, LM Studio or your own address, with your key.</small>
              </div>
              <a className="byo-action" href="/?panel=provider" target="_blank" rel="noreferrer">Set up</a>
            </li>
          </ul>
        </details>
      </section>
    );
  }

  return (
    <section className={`byo${compact ? " is-compact" : ""}`} aria-labelledby="byo-title">
      <h3 id="byo-title">Choose the AI behind your team</h3>
      <p className="byo-lead">Use one you already have. Sidemates never adds another bill.</p>

      <h4>Start free</h4>
      <ul className="byo-list">
        {geminiRow}
        {nousRow}
      </ul>

      <h4>Use a subscription you already have</h4>
      <ul className="byo-list">
        {account("openai", "ChatGPT", "Plus, Pro or Business")}
        {account("github-copilot", "GitHub Copilot", "Pro, Pro+ or Business")}
        {account("claude", "Claude", "Pro or Max")}
        {account("xai", "Grok", "SuperGrok")}
      </ul>

      {attemptBlock}
      {errorBlock}

      <details className="byo-more">
        <summary>Other options <ChevronDown size={14} aria-hidden="true" /></summary>
        <ul className="byo-list">
          {openCodeRow}
          <li className="byo-row">
            <div className="byo-row-text">
              <strong>A model on this Mac</strong>
              <small>Free and private with Ollama. Needs a capable Mac; weaker at multi-step work.</small>
            </div>
            <a className="byo-action" href="/?panel=provider" target={compact ? "_blank" : undefined} rel="noreferrer">Set up</a>
          </li>
        </ul>
      </details>
    </section>
  );
}

/** Ollama on this Mac: one click when it's running with a model that can use tools. */
function OllamaRow({ connectedId, use, onSaved }: { connectedId?: string; use: (connectionId: string, name: string) => ReactNode; onSaved: (connectionId: string) => Promise<void> | void }) {
  const [found, setFound] = useState<{ running: boolean; models: string[]; apiBaseUrl: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (connectedId) return;
    let live = true;
    void fetch("/api/provider/ollama", { credentials: "same-origin" }).then(async (response) => { if (live && response.ok) setFound(await response.json()); }).catch(() => { if (live) setFound({ running: false, models: [], apiBaseUrl: "" }); });
    return () => { live = false; };
  }, [connectedId]);
  const save = async () => {
    if (!found?.models.length) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/providers", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ollama on this Mac", authMode: "api_key", apiConfig: { baseUrl: found.apiBaseUrl, protocol: "openai-compatible", modelIds: found.models } }) });
      const result = await response.json().catch(() => ({})) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Ollama couldn't be added.");
      await onSaved(result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ollama couldn't be added."); }
    finally { setBusy(false); }
  };
  const detail = connectedId ? "Ollama is connected."
    : !found ? "Looking for Ollama…"
    : !found.running ? "Free and private with Ollama. Needs a capable Mac; weaker at multi-step work."
    : found.models.length ? `Ollama is running with ${found.models.length === 1 ? "a model" : `${found.models.length} models`} that can use tools.`
    : "Ollama is running, but none of its models can use tools. Add one in Ollama, then come back.";
  return (
    <li className="byo-row">
      <div className="byo-row-text">
        <strong>A model on this Mac</strong>
        <small>{detail}</small>
        {error && <small className="byo-error" role="alert">{error}</small>}
      </div>
      {connectedId ? use(connectedId, "Ollama")
        : !found ? <span className="byo-unavailable" role="status">Checking…</span>
        : found.models.length ? <button type="button" className="byo-action" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={14} className="spinner" aria-hidden="true" /> : null}Use Ollama</button>
        : found.running ? <a className="byo-action" href="https://ollama.com/search?c=tools" target="_blank" rel="noreferrer">Find a model <ExternalLink size={13} aria-hidden="true" /></a>
        : <a className="byo-action" href="https://ollama.com/download" target="_blank" rel="noreferrer">Get Ollama <ExternalLink size={13} aria-hidden="true" /></a>}
    </li>
  );
}

export function KeyPaste({ providerId, link, linkLabel, placeholder, onSaved }: { providerId: "google" | "opencode-go" | "nous"; link: string; linkLabel: string; placeholder: string; onSaved: (connectionId: string) => Promise<void> | void }) {
  const [key, setKey] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/provider/key", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerId, key }) });
      const result = await response.json().catch(() => ({})) as { error?: string; connectionId?: string };
      if (!response.ok || !result.connectionId) throw new Error(result.error || "The key wasn't accepted.");
      setKey("");
      await onSaved(result.connectionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The key wasn't accepted."); }
    finally { setBusy(false); }
  };
  return (
    <div className="byo-key">
      <a className="byo-link" href={link} target="_blank" rel="noreferrer">{linkLabel} <ExternalLink size={13} aria-hidden="true" /></a>
      <form onSubmit={(event) => void submit(event)}>
        <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKey(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button type="submit" className="byo-action" disabled={busy || key.trim().length < 20}>{busy ? <LoaderCircle size={14} className="spinner" aria-hidden="true" /> : null}Connect</button>
      </form>
      {error && <p className="byo-error" role="alert">{error}</p>}
    </div>
  );
}

function CodeForm({ busy, onSubmit }: { busy: boolean; onSubmit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  return (
    <form className="byo-code" onSubmit={(event) => { event.preventDefault(); void onSubmit(code).then(() => setCode("")); }}>
      <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required placeholder="Paste the code from the sign-in page" aria-label="Sign-in code" />
      <button type="submit" className="byo-action" disabled={busy || !code.trim()}>{busy ? <LoaderCircle size={14} className="spinner" aria-hidden="true" /> : null}Finish</button>
    </form>
  );
}

export type { ProviderCatalogEntry };
