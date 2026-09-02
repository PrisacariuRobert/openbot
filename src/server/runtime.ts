import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { ComputerStatus } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type CommandResult = { code: number; stdout: string; stderr: string };
type TeachStep = { type: "navigate" | "click" | "input" | "submit"; url: string; selector?: string; value?: string; label?: string; at: string };
const PROJECT_SCAN_SKIP = new Set(["node_modules", "vendor"]);

export function protectedProjectPaths(projectPath: string): Array<{ relative: string; directory: boolean }> {
  const protectedPaths: Array<{ relative: string; directory: boolean }> = [];
  let visitedDirectories = 0;
  const walk = (directory: string) => {
    visitedDirectories += 1;
    if (visitedDirectories > 20_000) throw new Error("This project is too large to prepare a protected test view.");
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name), relative = path.relative(projectPath, absolute);
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        protectedPaths.push({ relative, directory: entry.isDirectory() });
        if (protectedPaths.length > 80) throw new Error("This project has too many hidden paths to run checks safely.");
        continue;
      }
      if (entry.isDirectory() && !PROJECT_SCAN_SKIP.has(entry.name)) walk(absolute);
    }
  };
  walk(projectPath);
  return protectedPaths;
}

function run(command: string, args: string[], timeoutMs = 30_000, extraEnvironment: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: safeHostEnvironment(extraEnvironment), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }); } });
    child.on("close", (code) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); } });
  });
}

export function safeHostEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "SHELL", "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "SSH_AUTH_SOCK"];
  const env: NodeJS.ProcessEnv = { NO_COLOR: "1", ...extra };
  for (const key of allowed) if (process.env[key]) env[key] = process.env[key];
  const dockerHelpers = "/Applications/Docker.app/Contents/Resources/bin";
  if (existsSync(dockerHelpers) && !String(env.PATH || "").split(path.delimiter).includes(dockerHelpers)) {
    env.PATH = `${env.PATH || "/usr/bin:/bin"}${path.delimiter}${dockerHelpers}`;
  }
  return env;
}

export class ComputerManager {
  private readonly image = process.env.OPENBOT_COMPUTER_IMAGE || "node:22-bookworm-slim";
  private readonly dockerConfigDir: string;
  private dockerHost: string | null | undefined;

  constructor(private readonly db: OpenBotDatabase) {
    this.dockerConfigDir = path.join(db.dataDir, "docker-config");
    mkdirSync(this.dockerConfigDir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(this.dockerConfigDir, "config.json"), JSON.stringify({ auths: {} }), { mode: 0o600 });
  }

  private async docker(args: string[], timeoutMs?: number) {
    if (this.dockerHost === undefined) {
      const context = await run("docker", ["context", "inspect", "--format", "{{(index .Endpoints \"docker\").Host}}"], 5_000);
      this.dockerHost = context.code === 0 ? context.stdout.trim() : null;
    }
    return run("docker", ["--config", this.dockerConfigDir, ...args], timeoutMs, this.dockerHost ? { DOCKER_HOST: this.dockerHost } : {});
  }

  private name(botId: string) {
    return `openbot-computer-${botId.replace(/[^a-z0-9_.-]/gi, "-").slice(0, 45)}`;
  }

  private async ensureImage(): Promise<void> {
    const image = await this.docker(["image", "inspect", this.image], 8_000);
    if (image.code === 0) return;
    const pulled = await this.docker(["pull", this.image], 180_000);
    if (pulled.code !== 0) throw new Error(pulled.stderr || "Could not download the private computer image.");
  }

  async available(): Promise<boolean> {
    return (await this.docker(["info", "--format", "{{.ServerVersion}}"], 6_000)).code === 0;
  }

  async status(botId: string): Promise<"ready" | "stopped" | "unavailable"> {
    if (!(await this.available())) return "unavailable";
    const result = await this.docker(["inspect", "--format", "{{.State.Running}}", this.name(botId)], 5_000);
    if (result.code !== 0) return "stopped";
    return result.stdout.trim() === "true" ? "ready" : "stopped";
  }

  async ensure(botId: string): Promise<void> {
    const bot = this.db.getBot(botId);
    if (!bot?.computerEnabled) throw new Error("This bot's private computer is turned off.");
    if (!(await this.available())) throw new Error("Docker is not running, so the private computer is unavailable.");
    const name = this.name(botId);
    const inspected = await this.docker(["inspect", "--format", "{{.State.Running}}", name], 6_000);
    if (inspected.code === 0) {
      if (inspected.stdout.trim() !== "true") {
        const started = await this.docker(["start", name], 20_000);
        if (started.code !== 0) throw new Error(started.stderr || "Could not start the bot computer.");
      }
      return;
    }
    await this.ensureImage();
    const workspace = path.join(this.db.workspacesDir, botId);
    mkdirSync(workspace, { recursive: true });
    mkdirSync(path.join(workspace, ".home"), { recursive: true });
    const hostUser = typeof process.getuid === "function" && typeof process.getgid === "function" ? `${process.getuid()}:${process.getgid()}` : "1000:1000";
    const created = await this.docker([
      "run", "-d", "--name", name, "--workdir", "/workspace",
      "--mount", `type=bind,src=${workspace},dst=/workspace`,
      "--user", hostUser, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m", "--env", "HOME=/workspace/.home",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--pids-limit", "128", "--memory", "768m", "--cpus", "1.5",
      this.image, "tail", "-f", "/dev/null",
    ], 45_000);
    if (created.code !== 0) throw new Error(created.stderr || "Could not create the bot computer.");
  }

  async execute(botId: string, command: string, timeoutMs = 90_000): Promise<CommandResult> {
    await this.ensure(botId);
    const result = await this.docker(["exec", "-i", "--workdir", "/workspace", this.name(botId), "sh", "-lc", command], timeoutMs);
    return { ...result, stdout: result.stdout.slice(-80_000), stderr: result.stderr.slice(-20_000) };
  }

  async executeCodeProject(botId: string, projectPath: string, command: string, writable: boolean, timeoutMs = 120_000): Promise<CommandResult> {
    const bot = this.db.getBot(botId);
    if (!bot?.computerEnabled) throw new Error("This teammate's code computer is turned off.");
    if (!(await this.available())) throw new Error("Docker is not running, so project checks are unavailable.");
    await this.ensureImage();
    const hostUser = typeof process.getuid === "function" && typeof process.getgid === "function" ? `${process.getuid()}:${process.getgid()}` : "1000:1000";
    const maskRoot = path.join(this.db.dataDir, "code-run-masks"), emptyDirectory = path.join(maskRoot, "empty-directory"), emptyFile = path.join(maskRoot, "empty-file");
    mkdirSync(emptyDirectory, { recursive: true, mode: 0o700 });
    if (!existsSync(emptyFile)) writeFileSync(emptyFile, "", { mode: 0o600 });
    const hiddenMasks = protectedProjectPaths(projectPath).flatMap((entry) => ["--volume", `${entry.directory ? emptyDirectory : emptyFile}:/project/${entry.relative}:ro`]);
    const result = await this.docker([
      "run", "--rm", "-i", "--workdir", "/project", "--network", "none",
      "--volume", `${projectPath}:/project:${writable ? "rw" : "ro"}`,
      ...hiddenMasks,
      "--user", hostUser, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=192m", "--env", "HOME=/tmp",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--pids-limit", "192", "--memory", "1g", "--cpus", "2",
      this.image, "sh", "-lc", command,
    ], timeoutMs);
    return { ...result, stdout: result.stdout.slice(-100_000), stderr: result.stderr.slice(-30_000) };
  }
}

function chromePath(): string | undefined {
  const candidates = [
    process.env.OPENBOT_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((value): value is string => Boolean(value));
  return candidates.find(existsSync);
}

function safeUrl(raw: string): URL {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only normal web pages can be opened.");
  if (url.username || url.password) throw new Error("Credentials cannot be placed in a URL.");
  const host = url.hostname.toLowerCase();
  const localTest = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const privateHost = host === "0.0.0.0" || host === "169.254.169.254" || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (privateHost && !localTest) throw new Error("Private network addresses are blocked from bot browsers.");
  return url;
}

function compactSelector(element: Element): string {
  const html = element as HTMLElement;
  if (html.id) return `#${CSS.escape(html.id)}`;
  const testId = html.getAttribute("data-testid");
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const name = html.getAttribute("name");
  if (name) return `${html.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  const aria = html.getAttribute("aria-label");
  if (aria) return `${html.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
  const parent = html.parentElement;
  const siblings = parent ? [...parent.children].filter((child) => child.tagName === html.tagName) : [];
  const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(html) + 1})` : "";
  return `${parent?.id ? `#${CSS.escape(parent.id)} > ` : ""}${html.tagName.toLowerCase()}${suffix}`;
}

export class BrowserManager {
  private readonly contexts = new Map<string, BrowserContext>();
  private readonly teaching = new Map<string, { name: string; startUrl: string; steps: TeachStep[] }>();

  constructor(private readonly db: OpenBotDatabase) {}

  private writeTaughtSkill(botId: string, slug: string, name: string, startUrl: string, steps: TeachStep[]): string {
    const stepText = steps.map((step, index) => `${index + 1}. ${step.type}${step.selector ? ` ${step.selector}` : ""}${step.value ? ` → ${step.value}` : ""} (${step.url})`).join("\n");
    const description = JSON.stringify(`Repeat the browser workflow the user taught for ${name}.`);
    const content = `---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${name}\n\nStart at ${startUrl}. Use the browser tools and verify each page before the next action. Never guess credentials; ask for takeover or approval when a secret is needed.\n\n## Demonstrated steps\n\n${stepText || "No actions were captured. Ask the user to demonstrate again."}\n`;
    let primary = "";
    for (const provider of [".opencode", ".claude"]) {
      const skillDir = path.join(this.db.workspacesDir, botId, provider, "skills", slug);
      mkdirSync(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, "SKILL.md");
      writeFileSync(skillPath, content, "utf8");
      if (provider === ".opencode") primary = skillPath;
    }
    return primary;
  }

  isAvailable() { return Boolean(chromePath()); }

  private async context(botId: string, headless = true): Promise<BrowserContext> {
    const bot = this.db.getBot(botId);
    if (!bot?.browserEnabled) throw new Error("This bot's browser is turned off.");
    const existing = this.contexts.get(botId);
    if (existing) return existing;
    const executablePath = chromePath();
    if (!executablePath) throw new Error("Chrome or Chromium is required for browser work.");
    const profile = path.join(this.db.computersDir, botId, headless ? "browser" : "teaching");
    mkdirSync(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
      executablePath, headless, viewport: { width: 1280, height: 820 },
      args: ["--disable-background-networking", "--disable-sync", "--no-default-browser-check"],
    });
    context.on("close", () => this.contexts.delete(botId));
    this.contexts.set(botId, context);
    return context;
  }

  private async page(botId: string): Promise<Page> {
    const context = await this.context(botId);
    return context.pages()[0] || context.newPage();
  }

  async open(botId: string, rawUrl: string): Promise<{ url: string; title: string }> {
    const url = safeUrl(rawUrl);
    const page = await this.page(botId);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    return { url: page.url(), title: await page.title() };
  }

  async snapshot(botId: string): Promise<{ url: string; title: string; text: string }> {
    const page = await this.page(botId);
    const text = await page.locator("body").evaluate((body) => {
      const elements = [...body.querySelectorAll("h1,h2,h3,p,a,button,input,textarea,select,[role]")].slice(0, 250);
      return elements.map((element, index) => {
        const html = element as HTMLElement;
        const role = html.getAttribute("role") || html.tagName.toLowerCase();
        const label = html.getAttribute("aria-label") || html.getAttribute("placeholder") || html.innerText || (html as HTMLInputElement).value || "";
        return `${index + 1}. [${role}] ${label.trim().replace(/\s+/g, " ").slice(0, 240)}`;
      }).filter((line) => !line.endsWith("] ")).join("\n");
    });
    return { url: page.url(), title: await page.title(), text: text.slice(0, 30_000) };
  }

  async click(botId: string, selector: string) {
    const page = await this.page(botId);
    await page.locator(selector).first().click({ timeout: 12_000 });
    return { url: page.url(), title: await page.title() };
  }

  async type(botId: string, selector: string, value: string) {
    const page = await this.page(botId);
    const locator = page.locator(selector).first();
    await locator.fill(value, { timeout: 12_000 });
    return { url: page.url(), title: await page.title() };
  }

  async screenshot(botId: string): Promise<string | null> {
    try {
      const page = await this.page(botId);
      return `data:image/jpeg;base64,${(await page.screenshot({ type: "jpeg", quality: 62 })).toString("base64")}`;
    } catch { return null; }
  }

  async status(botId: string, computer: ComputerManager): Promise<ComputerStatus> {
    const context = this.contexts.get(botId);
    const page = context?.pages()[0];
    return {
      botId, container: await computer.status(botId), browser: !this.isAvailable() ? "unavailable" : context ? "ready" : "stopped",
      currentUrl: page?.url() || null, title: page ? await page.title().catch(() => "") : null,
      screenshot: page ? await this.screenshot(botId) : null, updatedAt: new Date().toISOString(),
    };
  }

  async startTeaching(botId: string, name: string, startUrl: string) {
    safeUrl(startUrl);
    await this.contexts.get(botId)?.close();
    const context = await this.context(botId, false);
    const session = { name, startUrl, steps: [] as TeachStep[] };
    this.teaching.set(botId, session);
    await context.exposeBinding("__openbotTeach", (_source, step: Omit<TeachStep, "at">) => {
      const active = this.teaching.get(botId);
      if (!active) return;
      const sanitized = { ...step, value: step.value && /password|secret|token|key/i.test(step.label || "") ? "{{secret}}" : step.value, at: new Date().toISOString() } as TeachStep;
      const last = active.steps.at(-1);
      if (last && last.type === sanitized.type && last.selector === sanitized.selector && last.value === sanitized.value) return;
      active.steps.push(sanitized);
    });
    await context.addInitScript(`
      (() => {
        const selector = ${compactSelector.toString()};
        const send = (step) => window.__openbotTeach?.({ ...step, url: location.href });
        addEventListener('click', (event) => { const el = event.target?.closest?.('a,button,input,[role="button"]'); if (el) send({ type:'click', selector:selector(el), label:(el.getAttribute('aria-label') || el.innerText || '').trim().slice(0,120) }); }, true);
        addEventListener('change', (event) => { const el = event.target; if (el?.matches?.('input,textarea,select')) send({ type:'input', selector:selector(el), value:el.type === 'password' ? '{{secret}}' : el.value, label:el.getAttribute('aria-label') || el.name || el.placeholder || el.type }); }, true);
        addEventListener('submit', (event) => send({ type:'submit', selector:selector(event.target), label:'Submit form' }), true);
      })();
    `);
    const page = context.pages()[0] || await context.newPage();
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) session.steps.push({ type: "navigate", url: frame.url(), at: new Date().toISOString() }); });
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    return { recording: true, stepCount: session.steps.length };
  }

  async stopTeaching(botId: string) {
    const session = this.teaching.get(botId);
    if (!session) throw new Error("No teaching session is running for this bot.");
    this.teaching.delete(botId);
    await this.contexts.get(botId)?.close();
    const slug = this.db.nextWorkflowSlug(botId, session.name);
    const skillPath = this.writeTaughtSkill(botId, slug, session.name, session.startUrl, session.steps);
    return this.db.saveWorkflow({ botId, name: session.name, startUrl: session.startUrl, steps: session.steps, skillPath, skillSlug: slug });
  }

  updateTaughtWorkflow(id: string, input: { name: string; startUrl: string }) {
    safeUrl(input.startUrl);
    const record = this.db.getWorkflowRecord(id);
    if (!record) throw new Error("Learned workflow not found.");
    const slug = this.db.nextWorkflowSlug(record.workflow.botId, input.name, id);
    const oldSlug = record.workflow.skillSlug;
    const skillPath = this.writeTaughtSkill(record.workflow.botId, slug, input.name, input.startUrl, record.steps as TeachStep[]);
    if (oldSlug !== slug) {
      for (const provider of [".opencode", ".claude"]) {
        const oldDirectory = path.resolve(this.db.workspacesDir, record.workflow.botId, provider, "skills", oldSlug);
        const skillsRoot = path.resolve(this.db.workspacesDir, record.workflow.botId, provider, "skills");
        if (oldDirectory.startsWith(`${skillsRoot}${path.sep}`) && existsSync(oldDirectory)) rmSync(oldDirectory, { recursive: true });
      }
    }
    return this.db.updateWorkflowRecord(id, { ...input, skillSlug: slug, skillPath });
  }

  deleteTaughtWorkflow(id: string): boolean {
    const record = this.db.getWorkflowRecord(id);
    if (!record) return false;
    const removed = this.db.deleteWorkflowRecord(id);
    if (!removed) return false;
    for (const provider of [".opencode", ".claude"]) {
      const directory = path.resolve(this.db.workspacesDir, removed.botId, provider, "skills", record.workflow.skillSlug);
      const skillsRoot = path.resolve(this.db.workspacesDir, removed.botId, provider, "skills");
      if (directory.startsWith(`${skillsRoot}${path.sep}`) && existsSync(directory)) rmSync(directory, { recursive: true });
    }
    return true;
  }

  teachingStatus(botId: string) {
    const session = this.teaching.get(botId);
    return session ? { recording: true, name: session.name, stepCount: session.steps.length } : { recording: false, stepCount: 0 };
  }

  async close() {
    await Promise.all([...this.contexts.values()].map((context) => context.close().catch(() => undefined)));
    this.contexts.clear();
  }
}

export { safeUrl };
