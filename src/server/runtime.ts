import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { BrowserTarget } from "./safety.js";
import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright-core";
import type { ComputerStatus, SkillStep, TaughtWorkflow } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import type { LiveViewEvent, LiveViewSource } from "./live-view.js";
import { createCodeCheckView } from "./code-check-view.js";
import { createSkillPackage, parseSkillPackage, skillSecretFindings, skillTemplate, type SkillDefinition } from "./skill-library.js";
import { captureTeachingStep, teachingAddress } from "./teaching-capture.js";
import { browserNavigationBlock, browserServiceForUrl, browserWebsiteBlock } from "./browser-access.js";
import { signInOrigin } from "../shared/browser-sign-in.js";

type CommandResult = { code: number; stdout: string; stderr: string; sourceChanged?: boolean; runtimeIdentity?: string };
type TeachStep = SkillStep & { at: string };
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

export function codeProjectToolchain(projectPath: string, command: string): "node" | "python" {
  if (/^\s*(python(?:3(?:\.\d+)?)?|pytest|pip3?)\b/.test(command)) return "python";
  if (/^\s*(node|npm|npx|pnpm|yarn)\b/.test(command)) return "node";
  const pythonProject = ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg"].some((name) => existsSync(path.join(projectPath, name)));
  return pythonProject && !existsSync(path.join(projectPath, "package.json")) ? "python" : "node";
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

export function safeHostEnvironment(extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "SHELL", "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "SSH_AUTH_SOCK"];
  const env: NodeJS.ProcessEnv = { NO_COLOR: "1" };
  for (const key of allowed) if (source[key]) env[key] = source[key];
  // GUI/background services do not inherit a login shell's PATH. Discover
  // standard user installs without running a shell or reading shell profiles.
  const paths = (env.PATH || "/usr/bin:/bin").split(path.delimiter).filter(Boolean);
  const candidates = [
    ...(env.HOME ? [path.join(env.HOME, ".opencode/bin"), path.join(env.HOME, ".local/bin")] : []),
    "/opt/homebrew/bin", "/usr/local/bin", "/Applications/Docker.app/Contents/Resources/bin",
  ];
  env.PATH = [...new Set([...paths, ...candidates.filter((entry) => existsSync(entry))])].join(path.delimiter);
  return { ...env, ...extra };
}

export class ComputerManager {
  private readonly image = process.env.OPENBOT_COMPUTER_IMAGE || "node:22-bookworm-slim";
  private readonly pythonImage = process.env.OPENBOT_PYTHON_IMAGE || "python:3.13-slim-bookworm";
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

  private async ensureImage(imageName = this.image): Promise<void> {
    const image = await this.docker(["image", "inspect", imageName], 8_000);
    if (image.code === 0) return;
    const pulled = await this.docker(["pull", imageName], 180_000);
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
    const codeImage = codeProjectToolchain(projectPath, command) === "python" ? this.pythonImage : this.image;
    await this.ensureImage(codeImage);
    const inspected = await this.docker(["image", "inspect", "--format", "{{.Id}}", codeImage], 8000);
    const imageId = inspected.stdout.trim();
    if (inspected.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error("The project check runtime could not be identified. Try again after Docker is ready.");
    const hostUser = typeof process.getuid === "function" && typeof process.getgid === "function" ? `${process.getuid()}:${process.getgid()}` : "1000:1000";
    const view = createCodeCheckView(projectPath, this.db.dataDir, protectedProjectPaths(projectPath).map((entry) => entry.relative));
    const containerName = `openbot-check-${randomUUID()}`;
    try {
      const result = await this.docker([
      "run", "--rm", "--name", containerName, "-i", "--workdir", "/project", "--network", "none",
      "--volume", `${view.rootPath}:/project:${writable ? "rw" : "ro"}`,
      "--user", hostUser, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=192m", "--env", "HOME=/tmp",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--pids-limit", "192", "--memory", "1g", "--cpus", "2",
      "--env", "PYTHONDONTWRITEBYTECODE=1",
      imageId, "sh", "-lc", command,
    ], timeoutMs);
      return { ...result, runtimeIdentity: `${imageId};cpus=2;memory=1g;network=none`, sourceChanged: !view.unchanged(), stdout: result.stdout.slice(-100_000), stderr: result.stderr.slice(-30_000) };
    } finally {
      const removed = await this.docker(["rm", "--force", containerName], 8_000);
      view.dispose();
      if (removed.code !== 0 && !/No such container/i.test(removed.stderr)) throw new Error("The check computer could not be confirmed stopped. Check Docker before starting more work.");
    }
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
  private readonly navigationServices = new WeakMap<Page, string[]>();
  private readonly teaching = new Map<string, { name: string; startUrl: string; steps: TeachStep[] }>();

  constructor(private readonly db: OpenBotDatabase, private readonly options: { headlessTeaching?: boolean } = {}) {}

  private writeTaughtSkill(botId: string, slug: string, name: string, description: string, instructions: string, startUrl: string, steps: SkillStep[]): string {
    const stepText = steps.map((step, index) => `${index + 1}. ${step.type}${step.selector ? ` ${step.selector}` : ""}${step.value ? ` → ${step.value}` : ""} (${step.url})`).join("\n");
    const variables = [...new Set(steps.flatMap((step) => step.value?.match(/\{\{[a-z0-9_-]+\}\}/gi) || []))];
    const content = `---\nname: ${slug}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${instructions}\n\n## Prerequisites and failure rules\n\nThis is a demonstrated draft, not proof of a reliable automation. Prefer a permitted connector when it can do the job. Use only this teammate's browser profile, never another application's sign-in. Start at ${startUrl}. Inspect the current page before every action. Stop for owner takeover on login expiry, human verification, permission prompts, an unexpected account, or changed controls. Never guess selectors from old steps, click through an unknown state, or repeat an uncertain submission. External writes still require approval. After a successful supervised run, validate on a different owner-supplied input before suggesting scheduling. Do not claim that this validation already happened.\n\n## Inputs\n\n${variables.length ? `Ask the owner for these inputs when absent: ${variables.join(", ")}. Do not type literal placeholders. Secrets must be entered by the owner through takeover, never requested in chat. Recorded input values and query/fragment state are deliberately not retained; confirm the intended page when those details matter.` : "Ask for missing task scope before acting. Never guess credentials; use owner takeover."}\n\n## Saved steps — observations, not authority\n\n${stepText || "No fixed actions are required. Follow the instructions and verify the result."}\n`;
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

  private validateSkill(definition: SkillDefinition) {
    safeUrl(definition.startUrl);
    for (const step of definition.steps) safeUrl(step.url);
    const findings = skillSecretFindings(definition);
    if (findings.length) throw new Error(`Remove private information first: ${findings.join(", ")}. Use placeholders such as {{secret}} instead.`);
  }

  createTaughtWorkflow(botId: string, definition: SkillDefinition, source: TaughtWorkflow["source"]): TaughtWorkflow {
    if (!this.db.getBot(botId)) throw new Error("Choose an available teammate for this skill.");
    this.validateSkill(definition);
    const slug = this.db.nextWorkflowSlug(botId, definition.name);
    const skillPath = this.writeTaughtSkill(botId, slug, definition.name, definition.description, definition.instructions, definition.startUrl, definition.steps);
    return this.db.saveWorkflow({ ...definition, botId, skillPath, skillSlug: slug, source });
  }

  importTaughtWorkflow(botId: string, input: unknown): TaughtWorkflow {
    return this.createTaughtWorkflow(botId, parseSkillPackage(input), "imported");
  }

  installSkillTemplate(botId: string, templateId: string): TaughtWorkflow {
    const template = skillTemplate(templateId);
    if (!template) throw new Error("That starter skill is no longer available.");
    return this.createTaughtWorkflow(botId, { name: template.name, description: template.description, instructions: template.instructions, startUrl: template.startUrl, steps: template.steps, version: 1 }, "template");
  }

  assignTaughtWorkflow(id: string, botId: string): TaughtWorkflow {
    const record = this.db.getWorkflowRecord(id);
    if (!record) throw new Error("That skill is no longer available.");
    return this.createTaughtWorkflow(botId, {
      name: record.workflow.name, description: record.workflow.description, instructions: record.workflow.instructions,
      startUrl: record.workflow.startUrl, steps: record.steps as SkillStep[], version: 1,
    }, "assigned");
  }

  exportTaughtWorkflow(id: string) {
    const record = this.db.getWorkflowRecord(id);
    if (!record) throw new Error("That skill is no longer available.");
    const definition = {
      name: record.workflow.name, description: record.workflow.description, instructions: record.workflow.instructions,
      startUrl: record.workflow.startUrl, steps: record.steps as SkillStep[], version: record.workflow.version,
    };
    this.validateSkill(definition);
    return createSkillPackage(definition);
  }

  isAvailable() { return Boolean(chromePath()); }

  private async context(botId: string, headless = true): Promise<BrowserContext> {
    const bot = this.db.getBot(botId);
    if (!bot?.browserEnabled) throw new Error("This bot's browser is turned off.");
    const existing = this.contexts.get(botId);
    if (existing) return existing;
    const executablePath = chromePath();
    if (!executablePath) throw new Error("Chrome or Chromium is required for browser work.");
    // Visibility must not choose a different identity. A login made while
    // teaching belongs to this same bot's browser when a task resumes later.
    // Existing browser profiles win; never copy/overwrite legacy login stores.
    const profile = path.join(this.db.computersDir, botId, "browser");
    mkdirSync(profile, { recursive: true });
    const containerArgs = process.env.OPENBOT_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
    const context = await chromium.launchPersistentContext(profile, {
      executablePath, headless: headless || this.options.headlessTeaching === true, viewport: { width: 1280, height: 820 },
      serviceWorkers: "block",
      args: ["--disable-background-networking", "--disable-sync", "--no-default-browser-check", ...containerArgs],
    });
    // Known-service request filtering is not a general egress sandbox. Playwright
    // may only intercept the first request of a redirect; check the full chain
    // before returning page content too. Denials are always read from current DB.
    await context.route("**/*", (route) => browserWebsiteBlock(this.db, botId, route.request().url()) ? route.abort("blockedbyclient") : route.continue());
    const trackNavigation = (page: Page) => {
      page.on("response", (response) => {
        const request = response.request();
        if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
        const origins: string[] = [];
        for (let next: typeof request | null = request; next; next = next.redirectedFrom()) {
          const service = browserServiceForUrl(next.url());
          if (service) origins.push(service.url);
        }
        this.navigationServices.set(page, origins);
      });
    };
    context.pages().forEach(trackNavigation);
    context.on("page", trackNavigation);
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
    this.assertWebsiteAccess(botId, url.toString());
    const page = await this.page(botId);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title() };
  }

  /** Detect obvious gates without returning field values or the login URL. The
   * model can explicitly request a handoff for gates this conservative check misses. */
  async signInState(botId: string): Promise<{ siteOrigin: string; needsSignIn: boolean }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    const address = new URL(page.url());
    if (/\/(?:login|signin|sign-in|log-in|sso|oauth2?\/authorize)(?:\/|$)/i.test(address.pathname)) {
      return { siteOrigin: address.origin, needsSignIn: true };
    }
    const needsSignIn = await page.locator("body").evaluate((body) => {
      // Keep callbacks inline: tsx's named-function helper is not present in the browser.
      if ([...body.querySelectorAll('input[type="password"], input[autocomplete="one-time-code"]')].some((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden")) return true;
      const heading = [...body.querySelectorAll('h1,h2,[role="heading"]')].filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden").map((node) => node.textContent || "").join(" ");
      return /sign[ -]?in|log[ -]?in|verify (?:your |it.?s you)|enter.*(?:code|password)|choose an account/i.test(heading) &&
        [...body.querySelectorAll('input,button,[role="button"]')].some((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
    });
    this.assertPageAccess(botId, page);
    return { siteOrigin: new URL(page.url()).origin, needsSignIn };
  }

  async signInView(botId: string) {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    return { siteOrigin: signInOrigin(page.url()), screenshot: await this.screenshot(botId) };
  }

  async snapshot(botId: string): Promise<{ url: string; title: string; text: string }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    const text = await page.locator("body").evaluate((body) => {
      const elements = [...body.querySelectorAll("h1,h2,h3,p,a,button,input,textarea,select,[role]")].slice(0, 250);
      return elements.map((element, index) => {
        const html = element as HTMLElement;
        const role = html.getAttribute("role") || html.tagName.toLowerCase();
        const input = html as HTMLInputElement;
        const privateField = input.tagName === "INPUT" && (input.type === "password" || /password|secret|token|one-time-code/i.test(`${input.name} ${input.autocomplete} ${input.getAttribute("aria-label") || ""}`));
        const label = html.getAttribute("aria-label") || html.getAttribute("placeholder") || html.innerText || (privateField ? "Secure field" : input.value) || "";
        return `${index + 1}. [${role}] ${label.trim().replace(/\s+/g, " ").slice(0, 240)}`;
      }).filter((line) => !line.endsWith("] ")).join("\n");
    });
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title(), text: text.slice(0, 30_000) };
  }

  async describeTarget(botId: string, selector: string): Promise<BrowserTarget & { fingerprint: string }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    const details = await page.locator(selector).first().evaluate((element) => {
      const node = element.closest("button,a,input,textarea,select,[role=button],[role=link]") || element;
      const input = node as HTMLInputElement;
      const form = input.form || node.closest("form");
      return {
        tag: node.tagName.toLowerCase(), role: node.getAttribute("role") || "",
        label: (node.getAttribute("aria-label") || [...(input.labels || [])].map((label) => label.textContent || "").join(" ") || node.textContent || node.getAttribute("name") || "").trim().slice(0, 240),
        inputType: node instanceof HTMLInputElement || node instanceof HTMLButtonElement ? node.type : "",
        autocomplete: node.getAttribute("autocomplete") || "", href: node instanceof HTMLAnchorElement ? node.href : "",
        formMethod: form?.method.toLowerCase() || "",
        searchForm: Boolean(form && (form.getAttribute("role") === "search" || form.querySelector('input[type="search"]'))),
      };
    }, undefined, { timeout: 12_000 });
    this.assertPageAccess(botId, page);
    const target = { url: page.url(), ...details };
    return { ...target, fingerprint: createHash("sha256").update(JSON.stringify(target)).digest("hex") };
  }

  private async assertTarget(botId: string, selector: string, fingerprint?: string) {
    this.assertPageAccess(botId, await this.page(botId));
    if (fingerprint && (await this.describeTarget(botId, selector)).fingerprint !== fingerprint) {
      throw new Error("The page or control changed after review. Inspect it again and request a new approval.");
    }
  }

  private assertWebsiteAccess(botId: string, url: string) {
    const reason = browserWebsiteBlock(this.db, botId, url);
    if (reason) throw new Error(reason);
  }

  private assertPageAccess(botId: string, page: Page) {
    const reason = browserNavigationBlock(this.db, botId, [page.url(), ...(this.navigationServices.get(page) || [])]);
    if (reason) throw new Error(reason);
  }

  async click(botId: string, selector: string, fingerprint?: string) {
    const page = await this.page(botId);
    await this.assertTarget(botId, selector, fingerprint);
    await page.locator(selector).first().click({ timeout: 12_000 });
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title() };
  }

  async type(botId: string, selector: string, value: string, fingerprint?: string) {
    const page = await this.page(botId);
    await this.assertTarget(botId, selector, fingerprint);
    const locator = page.locator(selector).first();
    await locator.fill(value, { timeout: 12_000 });
    return { url: page.url(), title: await page.title() };
  }

  async takeoverClick(botId: string, x: number, y: number) {
    const page = await this.page(botId);
    await page.mouse.click(Math.max(0, Math.min(1280, x)), Math.max(0, Math.min(820, y)));
    await page.waitForTimeout(180);
    return { url: page.url(), title: await page.title(), screenshot: await this.screenshot(botId) };
  }

  async takeoverType(botId: string, value: string, replace = false) {
    const page = await this.page(botId);
    if (replace) await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(value, { delay: 12 });
    await page.waitForTimeout(120);
    return { url: page.url(), title: await page.title(), screenshot: await this.screenshot(botId) };
  }

  async takeoverKey(botId: string, key: "Enter" | "Tab" | "Escape" | "Backspace" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") {
    const page = await this.page(botId);
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
    return { url: page.url(), title: await page.title(), screenshot: await this.screenshot(botId) };
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

  /** Live screen frames for viewers who are already watching. This never
   * starts a browser or grants access: it only attaches to a browser this bot
   * already has running, reports "stopped" until one appears, and follows the
   * bot's browser when a task opens one later. Frames come from the same
   * screen the owner can already see through the snapshot endpoint; the model
   * never receives them. */
  startFrameSource(botId: string, emit: (event: LiveViewEvent) => void): Promise<LiveViewSource> {
    const bot = this.db.getBot(botId);
    if (!bot?.browserEnabled || !this.isAvailable()) {
      emit({ type: "status", browser: "stopped" });
      return Promise.resolve({ stop() {} });
    }
    let stopped = false;
    let session: CDPSession | null = null;
    let tracked: Page | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;

    const describe = async () => {
      const page = tracked;
      if (!page || page.isClosed()) return { title: null, currentUrl: null };
      return { title: await page.title().catch(() => null), currentUrl: page.url() };
    };

    const detach = () => {
      const current = session;
      session = null;
      tracked = null;
      if (current) {
        void current.send("Page.stopScreencast").catch(() => {});
        void current.detach().catch(() => {});
      }
    };

    const emitStatus = () => {
      void describe().then(({ title, currentUrl }) => {
        if (!stopped) emit({ type: "status", browser: session ? "ready" : "stopped", title, currentUrl });
      });
    };

    const attach = async () => {
      if (stopped) return;
      const context = this.contexts.get(botId);
      if (!context) {
        if (session) {
          detach();
          emitStatus();
        }
        return;
      }
      if (session && tracked && !tracked.isClosed()) return;
      const page = context.pages()[0] || await context.newPage().catch(() => null);
      if (!page || stopped) return;
      if (session && tracked === page) return;
      detach();
      try {
        const cdp = await context.newCDPSession(page);
        if (stopped) {
          void cdp.detach().catch(() => {});
          return;
        }
        cdp.on("Page.screencastFrame", (frame: unknown) => {
          const data = (frame as { data?: string }).data;
          const frameId = (frame as { sessionId?: number }).sessionId;
          if (typeof frameId === "number") void cdp.send("Page.screencastFrameAck", { sessionId: frameId }).catch(() => {});
          if (!stopped && typeof data === "string" && data.length > 0) emit({ type: "frame", jpeg: data });
        });
        await cdp.send("Page.startScreencast", { format: "jpeg", quality: 58, maxWidth: 1280, maxHeight: 820, everyNthFrame: 1 });
        session = cdp;
        tracked = page;
        page.once("close", () => {
          if (tracked === page) {
            detach();
            emitStatus();
          }
        });
        emitStatus();
      } catch {
        session = null;
        tracked = null;
        if (!stopped) emit({ type: "status", browser: "unavailable" });
      }
    };

    void attach();
    watchdog = setInterval(() => void attach(), 2_000);
    return Promise.resolve({
      stop() {
        stopped = true;
        if (watchdog) clearInterval(watchdog);
        detach();
      },
    });
  }

  async startTeaching(botId: string, name: string, startUrl: string) {
    safeUrl(startUrl);
    await this.contexts.get(botId)?.close();
    const context = await this.context(botId, false);
    const session = { name, startUrl: teachingAddress(startUrl), steps: [] as TeachStep[] };
    const fields = new Map<string, string>();
    this.teaching.set(botId, session);
    await context.exposeBinding("__openbotTeach", (source, step: unknown) => {
      const active = this.teaching.get(botId);
      if (!active || active.steps.length >= 80) return;
      let captured: SkillStep;
      try { captured = captureTeachingStep(step, source.frame.url(), fields); } catch { return; }
      const sanitized = { ...captured, at: new Date().toISOString() };
      const last = active.steps.at(-1);
      if (last && last.type === sanitized.type && last.selector === sanitized.selector && last.value === sanitized.value) return;
      active.steps.push(sanitized);
    });
    await context.addInitScript(`
      (() => {
        const selector = ${compactSelector.toString()};
        const send = (step) => window.__openbotTeach?.({ ...step, url: location.href });
        addEventListener('click', (event) => { const el = event.target?.closest?.('a,button,input,[role="button"]'); if (el) send({ type:'click', selector:selector(el), label:(el.getAttribute('aria-label') || el.innerText || '').trim().slice(0,120) }); }, true);
        addEventListener('change', (event) => { const el = event.target; if (el?.matches?.('input,textarea,select')) send({ type:'input', selector:selector(el), privateField:el.type === 'password' || /password|secret|token|one.?time|passcode|verification|otp/i.test([el.name,el.id,el.autocomplete,el.getAttribute('aria-label')].join(' ')), label:el.getAttribute('aria-label') || el.name || el.placeholder || el.type }); }, true);
        addEventListener('submit', (event) => send({ type:'submit', selector:selector(event.target), label:'Submit form' }), true);
      })();
    `);
    const page = context.pages()[0] || await context.newPage();
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame() && session.steps.length < 80) { try { session.steps.push({ type: "navigate", url: teachingAddress(frame.url()), at: new Date().toISOString() }); } catch { /* Non-web transitions are not reusable steps. */ } } });
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    return { recording: true, stepCount: session.steps.length };
  }

  async stopTeaching(botId: string) {
    const session = this.teaching.get(botId);
    if (!session) throw new Error("No teaching session is running for this bot.");
    this.teaching.delete(botId);
    await this.contexts.get(botId)?.close();
    const slug = this.db.nextWorkflowSlug(botId, session.name);
    const description = `A demonstrated draft for ${session.name}; confirm inputs and test another example before scheduling.`;
    const instructions = `Start at the saved page and inspect its current state. Recorded inputs are placeholders, not retained values. Ask for missing non-secret inputs; use owner takeover for login or private fields. Adapt the demonstrated actions only within the owner's request, stop on changed controls or unknown state, and verify the result before answering.`;
    const skillPath = this.writeTaughtSkill(botId, slug, session.name, description, instructions, session.startUrl, session.steps);
    return this.db.saveWorkflow({ botId, name: session.name, description, instructions, startUrl: session.startUrl, steps: session.steps, skillPath, skillSlug: slug, source: "taught" });
  }

  updateTaughtWorkflow(id: string, input: { name: string; description?: string; instructions?: string; startUrl: string }) {
    const record = this.db.getWorkflowRecord(id);
    if (!record) throw new Error("Learned workflow not found.");
    const definition = {
      name: input.name, description: input.description?.trim() || record.workflow.description,
      instructions: input.instructions?.trim() || record.workflow.instructions, startUrl: input.startUrl,
      steps: record.steps as SkillStep[], version: record.workflow.version + 1,
    };
    this.validateSkill(definition);
    const slug = this.db.nextWorkflowSlug(record.workflow.botId, input.name, id);
    const oldSlug = record.workflow.skillSlug;
    const skillPath = this.writeTaughtSkill(record.workflow.botId, slug, definition.name, definition.description, definition.instructions, definition.startUrl, definition.steps);
    if (oldSlug !== slug) {
      for (const provider of [".opencode", ".claude"]) {
        const oldDirectory = path.resolve(this.db.workspacesDir, record.workflow.botId, provider, "skills", oldSlug);
        const skillsRoot = path.resolve(this.db.workspacesDir, record.workflow.botId, provider, "skills");
        if (oldDirectory.startsWith(`${skillsRoot}${path.sep}`) && existsSync(oldDirectory)) rmSync(oldDirectory, { recursive: true });
      }
    }
    return this.db.updateWorkflowRecord(id, { ...definition, skillSlug: slug, skillPath });
  }

  rollbackTaughtWorkflow(id: string, version: number) {
    const current = this.db.getWorkflowRecord(id), snapshot = this.db.getWorkflowVersion(id, version);
    if (!current || !snapshot) throw new Error("That saved version is no longer available.");
    const definition = {
      name: snapshot.name, description: snapshot.description, instructions: snapshot.instructions,
      startUrl: snapshot.startUrl, steps: snapshot.steps as SkillStep[], version: current.workflow.version + 1,
    };
    this.validateSkill(definition);
    const slug = this.db.nextWorkflowSlug(current.workflow.botId, definition.name, id);
    const oldSlug = current.workflow.skillSlug;
    const skillPath = this.writeTaughtSkill(current.workflow.botId, slug, definition.name, definition.description, definition.instructions, definition.startUrl, definition.steps);
    if (oldSlug !== slug) {
      for (const provider of [".opencode", ".claude"]) {
        const oldDirectory = path.resolve(this.db.workspacesDir, current.workflow.botId, provider, "skills", oldSlug);
        const skillsRoot = path.resolve(this.db.workspacesDir, current.workflow.botId, provider, "skills");
        if (oldDirectory.startsWith(`${skillsRoot}${path.sep}`) && existsSync(oldDirectory)) rmSync(oldDirectory, { recursive: true });
      }
    }
    return this.db.reviseWorkflowRecord(id, { ...definition, skillSlug: slug, skillPath });
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
