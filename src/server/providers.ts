import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import type { ProviderCatalogEntry, ProviderInstance, ProviderLoginAttempt, ProviderStatus } from "../shared/types.js";
import { OpenBotDatabase } from "./database.js";
import { safeHostEnvironment } from "./runtime.js";

const FREE_MODELS = [
  "opencode/muse-spark-1.2-contributor-free",
  "opencode/ling-3.0-flash-fin-free",
  "opencode/mimo-v2.5-free",
  "opencode/nemotron-3-ultra-free",
  "opencode/nemotron-3.5-lightning-free",
];

type CommandResult = { code: number; stdout: string; stderr: string };
type OAuthAuthorization = { url: string; method: "auto" | "code"; instructions: string };

function stripAnsi(value: string) {
  return value.replace(/\x1b\[[0-9;]*m/g, "").replace(/[│●┌└]/g, " ");
}

function execute(command: string, args: string[], timeoutMs = 15_000, environment: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false, stdout = "", stderr = "";
    const child = spawn(command, args, { env: safeHostEnvironment(environment), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }); } });
    child.on("close", (code) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); } });
  });
}

const apiModelCache = new Map<string, { expiresAt: number; models: string[] }>();

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port ? resolve(port) : reject(new Error("Could not reserve a local sign-in port.")));
    });
  });
}

function modelLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[a-z0-9._-]+\/[a-z0-9._/-]+$/i.test(line)))];
}

function agentModels(models: string[]): string[] {
  return models.filter((model) => !/(?:^|[-/])(image|embedding|realtime|audio|tts|transcri)/i.test(model));
}

function preferredModel(provider: ProviderInstance["provider"], models: string[]): string | undefined {
  if (provider === "opencode") return models.find((model) => model === "opencode-go/deepseek-v4-flash") || models.find((model) => model.endsWith("-free")) || models[0];
  if (provider === "claude") return models.find((model) => model.endsWith("/sonnet")) || models[0];
  if (provider === "openai") {
    const baseModels = models.filter((model) => /^openai\/gpt-\d+(?:\.\d+)*$/.test(model));
    return baseModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] || models.find((model) => /codex/i.test(model)) || models[0];
  }
  return models[0];
}

function modelsFor(provider: ProviderInstance["provider"], allModels: string[]): string[] {
  const prefixes: Record<ProviderInstance["provider"], string[]> = {
    opencode: ["opencode/", "opencode-go/"], claude: ["claude-code/"], openai: ["openai/"],
    "github-copilot": ["github-copilot/"], gitlab: ["gitlab/"], xai: ["xai/"], custom: [],
  };
  const selected = agentModels(allModels.filter((model) => prefixes[provider].some((prefix) => model.startsWith(prefix))));
  if (provider === "claude") return ["claude-code/sonnet", "claude-code/opus", "claude-code/fable"];
  if (provider === "opencode" && !selected.length) return FREE_MODELS;
  return selected;
}

function apiKeyModels(instance: ProviderInstance, allModels: string[]): string[] {
  const env = instance.envName || "";
  const prefix = env === "ANTHROPIC_API_KEY" ? "anthropic/" : env === "OPENROUTER_API_KEY" ? "openrouter/" : env === "OPENAI_API_KEY" ? "openai/" : "";
  return agentModels(prefix ? allModels.filter((model) => model.startsWith(prefix)) : allModels);
}

function apiProviderId(instance: ProviderInstance): string | null {
  if (instance.envName === "ANTHROPIC_API_KEY") return "anthropic";
  if (instance.envName === "OPENROUTER_API_KEY") return "openrouter";
  if (instance.envName === "OPENAI_API_KEY") return "openai";
  return instance.provider !== "custom" ? instance.provider : null;
}

function authHas(auth: string, pattern: RegExp) {
  return pattern.test(stripAnsi(auth));
}

function connectedInstance(db: OpenBotDatabase, input: Parameters<OpenBotDatabase["upsertProvider"]>[0]) {
  return db.upsertProvider(input);
}

export async function readProviderStatus(db: OpenBotDatabase, loginAttempts: ProviderLoginAttempt[] = []): Promise<ProviderStatus> {
  const [openCodeVersion, claudeVersion] = await Promise.all([execute("opencode", ["--version"]), execute("claude", ["--version"])]);
  const openCodeInstalled = openCodeVersion.code === 0;
  const claudeInstalled = claudeVersion.code === 0;
  const [auth, models, claudeAuth] = await Promise.all([
    openCodeInstalled ? execute("opencode", ["auth", "list"]) : Promise.resolve({ code: 1, stdout: "", stderr: "" }),
    openCodeInstalled ? execute("opencode", ["models"]) : Promise.resolve({ code: 1, stdout: "", stderr: "" }),
    claudeInstalled ? execute("claude", ["auth", "status"]) : Promise.resolve({ code: 1, stdout: "", stderr: "" }),
  ]);
  let allModels = modelLines(models.stdout);
  const openCodeConnected = auth.code === 0 && authHas(auth.stdout, /OpenCode(?: Go| Zen)?\s+api/i);
  const openAIConnected = auth.code === 0 && authHas(auth.stdout, /OpenAI\s+(?:api|oauth)/i);
  const copilotConnected = auth.code === 0 && authHas(auth.stdout, /GitHub Copilot\s+(?:api|oauth)/i);
  const gitlabConnected = auth.code === 0 && authHas(auth.stdout, /GitLab\s+(?:api|oauth)/i);
  const xaiConnected = auth.code === 0 && authHas(auth.stdout, /xAI\s+(?:api|oauth)/i);
  let claudeConnected = false;
  try { claudeConnected = Boolean(JSON.parse(claudeAuth.stdout || "{}").loggedIn); } catch { claudeConnected = /logged.?in\D+true/i.test(claudeAuth.stdout); }

  if (openCodeConnected) connectedInstance(db, { id: "local-opencode", name: "OpenCode", provider: "opencode", authMode: "cli", runtime: "opencode" });
  if (openAIConnected) connectedInstance(db, { id: "local-openai", name: "ChatGPT / OpenAI", provider: "openai", authMode: "subscription", runtime: "opencode" });
  if (copilotConnected) connectedInstance(db, { id: "local-github-copilot", name: "GitHub Copilot", provider: "github-copilot", authMode: "subscription", runtime: "opencode" });
  if (gitlabConnected) connectedInstance(db, { id: "local-gitlab", name: "GitLab Duo", provider: "gitlab", authMode: "subscription", runtime: "opencode" });
  if (xaiConnected) connectedInstance(db, { id: "local-xai", name: "SuperGrok / xAI", provider: "xai", authMode: "subscription", runtime: "opencode" });
  if (claudeConnected) connectedInstance(db, { id: "local-claude", name: "Claude", provider: "claude", authMode: "subscription", runtime: "claude_code" });

  const apiInstances = db.listProviders().filter((instance) => instance.authMode === "api_key" && instance.hasSecret);
  const apiModels = new Map<string, string[]>();
  await Promise.all(apiInstances.map(async (instance) => {
    const cacheKey = `${instance.id}:${instance.updatedAt}`, cached = apiModelCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) { apiModels.set(instance.id, cached.models); return; }
    const providerId = apiProviderId(instance);
    if (!providerId) return;
    const result = await execute("opencode", ["models", providerId], 15_000, db.providerEnvironmentById(instance.id));
    const found = modelLines(result.stdout);
    apiModelCache.set(cacheKey, { expiresAt: Date.now() + 60_000, models: found });
    apiModels.set(instance.id, found);
  }));
  allModels = [...new Set([...allModels, ...[...apiModels.values()].flat()])];

  const catalog: ProviderCatalogEntry[] = [
    { id: "opencode", name: "OpenCode", shortName: "OpenCode", description: "Free and Go models through your OpenCode account.", badge: "Free + Go", connected: openCodeConnected, installed: openCodeInstalled, canConnect: false, connectionId: openCodeConnected ? "local-opencode" : null, models: modelsFor("opencode", allModels), note: openCodeConnected ? "Ready on this Mac" : openCodeInstalled ? "Connect from OpenCode once, then come back here." : "Install OpenCode first." },
    { id: "claude", name: "Claude", shortName: "Claude", description: "Use the official Claude Code login with Pro, Max, Team, Enterprise, or Console.", badge: "Official login", connected: claudeConnected, installed: claudeInstalled, canConnect: claudeInstalled, connectionId: claudeConnected ? "local-claude" : null, models: modelsFor("claude", allModels), note: claudeConnected ? "Signed in through Claude Code" : claudeInstalled ? "Sign in without sharing a password with OpenBot." : "Install Claude Code first." },
    { id: "openai", name: "ChatGPT / OpenAI", shortName: "ChatGPT", description: "Use ChatGPT Plus/Pro OAuth or your existing OpenAI connection.", badge: "Subscription", connected: openAIConnected, installed: openCodeInstalled, canConnect: openCodeInstalled, connectionId: openAIConnected ? "local-openai" : null, models: modelsFor("openai", allModels), note: openAIConnected ? "Ready through OpenCode" : "Browser sign-in through OpenCode." },
    { id: "github-copilot", name: "GitHub Copilot", shortName: "Copilot", description: "Use the models included with your Copilot account.", badge: "Subscription", connected: copilotConnected, installed: openCodeInstalled, canConnect: openCodeInstalled, connectionId: copilotConnected ? "local-github-copilot" : null, models: modelsFor("github-copilot", allModels), note: copilotConnected ? "Ready through OpenCode" : "Connect a GitHub.com account." },
    { id: "gitlab", name: "GitLab Duo", shortName: "GitLab", description: "Connect a GitLab Duo seat for agent work.", badge: "Experimental", connected: gitlabConnected, installed: openCodeInstalled, canConnect: openCodeInstalled, connectionId: gitlabConnected ? "local-gitlab" : null, models: modelsFor("gitlab", allModels), note: gitlabConnected ? "Ready through OpenCode" : "GitLab support in OpenCode is experimental." },
    { id: "xai", name: "SuperGrok / xAI", shortName: "Grok", description: "Use SuperGrok device login or an xAI API connection.", badge: "Subscription", connected: xaiConnected, installed: openCodeInstalled, canConnect: openCodeInstalled, connectionId: xaiConnected ? "local-xai" : null, models: modelsFor("xai", allModels), note: xaiConnected ? "Ready through OpenCode" : "Secure device sign-in through OpenCode." },
  ];
  const connectionMap = new Map(catalog.map((entry) => [entry.connectionId, entry]));
  const instances = db.listProviders().map((instance) => {
    const entry = connectionMap.get(instance.id);
    const connected = instance.authMode === "api_key" ? instance.hasSecret : Boolean(entry?.connected);
    const instanceModels = entry?.models || (instance.authMode === "api_key" ? agentModels(apiModels.get(instance.id) || apiKeyModels(instance, allModels)) : instance.provider === "custom" ? agentModels(allModels) : modelsFor(instance.provider, allModels));
    return { ...instance, connected, models: instanceModels, defaultModel: preferredModel(instance.provider, instanceModels), note: entry?.note || (connected ? "Encrypted connection ready" : "Connection needs attention") };
  });
  const openCodeModels = instances.find((instance) => instance.id === "local-opencode")?.models || [];
  const defaultModel = openCodeModels.includes("opencode-go/deepseek-v4-flash") ? "opencode-go/deepseek-v4-flash" : openCodeModels.includes(FREE_MODELS[0]!) ? FREE_MODELS[0]! : openCodeModels[0] || FREE_MODELS[0]!;
  return {
    id: "opencode", name: "OpenBot connections", connected: instances.some((instance) => instance.connected), cliAvailable: openCodeInstalled,
    version: openCodeInstalled ? openCodeVersion.stdout.trim() : null, defaultModel, models: allModels.length ? allModels : FREE_MODELS,
    note: instances.some((instance) => instance.connected) ? "Your private model connections are ready." : "Connect one model account to wake your teammates.",
    instances, catalog, loginAttempts,
  };
}

class OpenCodeAuthBridge {
  private child: ChildProcess | null = null;
  private url: string | null = null;
  private starting: Promise<string> | null = null;
  private readonly password = randomUUID();

  private headers() {
    return { "content-type": "application/json", authorization: `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}` };
  }

  async ensure(): Promise<string> {
    if (this.url) return this.url;
    if (this.starting) return this.starting;
    this.starting = new Promise(async (resolve, reject) => {
      const port = await availablePort().catch(reject);
      if (!port) return;
      const child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], { env: safeHostEnvironment({ OPENCODE_SERVER_PASSWORD: this.password }), stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      let output = "";
      const inspect = (chunk: unknown) => {
        output += stripAnsi(String(chunk));
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match && !this.url) { this.url = match[0]; resolve(this.url); }
      };
      child.stdout?.on("data", inspect); child.stderr?.on("data", inspect);
      child.on("error", reject);
      child.on("close", () => { this.child = null; this.url = null; this.starting = null; });
      setTimeout(() => { if (!this.url) { child.kill("SIGTERM"); reject(new Error("OpenCode sign-in service did not start.")); } }, 8_000);
    });
    try { return await this.starting; } finally { this.starting = null; }
  }

  async authorize(providerId: string): Promise<OAuthAuthorization> {
    const base = await this.ensure();
    const inputs: Record<string, string> = providerId === "github-copilot" ? { deploymentType: "github.com" } : providerId === "gitlab" ? { instanceUrl: "https://gitlab.com" } : {};
    const response = await fetch(`${base}/provider/${encodeURIComponent(providerId)}/oauth/authorize`, { method: "POST", headers: this.headers(), body: JSON.stringify({ method: 0, inputs }) });
    const body = await response.json() as OAuthAuthorization & { data?: { message?: string } };
    if (!response.ok) throw new Error(body.data?.message || `Could not start ${providerId} sign-in.`);
    return body;
  }

  async callback(providerId: string, code: string): Promise<void> {
    const base = await this.ensure();
    const response = await fetch(`${base}/provider/${encodeURIComponent(providerId)}/oauth/callback`, { method: "POST", headers: this.headers(), body: JSON.stringify({ method: 0, code }) });
    if (!response.ok) throw new Error("The sign-in code was not accepted.");
  }

  stop() { this.child?.kill("SIGTERM"); this.child = null; this.url = null; }
}

export class ProviderConnectionManager {
  private readonly bridge = new OpenCodeAuthBridge();
  private readonly attempts = new Map<string, ProviderLoginAttempt>();
  private readonly claudeProcesses = new Map<string, ChildProcess>();

  constructor(private readonly onChange: () => void) {}

  listAttempts(): ProviderLoginAttempt[] { return [...this.attempts.values()].slice(-6); }

  async connect(providerId: string): Promise<ProviderLoginAttempt> {
    const id = randomUUID();
    const attempt: ProviderLoginAttempt = { id, providerId, status: "waiting", url: null, callbackMode: null, instructions: "Complete the secure sign-in in your browser.", error: null };
    this.attempts.set(id, attempt);
    if (providerId === "claude") {
      const child = spawn("claude", ["auth", "login", "--claudeai"], { env: safeHostEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
      this.claudeProcesses.set(id, child);
      let errorText = "";
      child.stderr?.on("data", (chunk) => (errorText += stripAnsi(String(chunk))));
      child.on("error", (error) => { attempt.status = "failed"; attempt.error = error.message; this.onChange(); });
      child.on("close", (code) => { this.claudeProcesses.delete(id); attempt.status = code === 0 ? "connected" : "failed"; attempt.error = code === 0 ? null : errorText.trim().slice(-800) || "Claude sign-in was not completed."; this.onChange(); });
      this.onChange();
      return attempt;
    }
    try {
      const auth = await this.bridge.authorize(providerId);
      attempt.url = auth.url; attempt.callbackMode = auth.method; attempt.instructions = auth.instructions || attempt.instructions;
    } catch (error) {
      attempt.status = "failed"; attempt.error = error instanceof Error ? error.message : String(error);
    }
    this.onChange();
    return attempt;
  }

  async finish(attemptId: string, code: string) {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.status !== "waiting") throw new Error("That sign-in is no longer waiting.");
    await this.bridge.callback(attempt.providerId, code);
    attempt.status = "connected"; attempt.error = null; this.onChange();
    return attempt;
  }

  stop() {
    this.bridge.stop();
    for (const child of this.claudeProcesses.values()) child.kill("SIGTERM");
    this.claudeProcesses.clear();
  }
}
