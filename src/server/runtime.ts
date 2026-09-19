import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { BrowserTarget } from "./safety.js";
import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright-core";
import type { ComputerStatus, SkillStep, TaughtWorkflow } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { skillSlug } from "../shared/skills.js";
import type { LiveViewEvent, LiveViewSource } from "./live-view.js";
import { createCodeCheckView } from "./code-check-view.js";
import { createSkillPackage, parseSkillPackage, skillSecretFindings, skillTemplate, type SkillDefinition } from "./skill-library.js";
import { captureTeachingStep, teachingAddress } from "./teaching-capture.js";
import { browserNavigationBlock, browserServiceForUrl, browserWebsiteBlock } from "./browser-access.js";
import { signInOrigin } from "../shared/browser-sign-in.js";
import { gateObservationCapture, redactSecretsForProvider, newObservationId, OBSERVATION_TTL_MS } from "./observation-envelope.js";
import { issueSemanticTarget, reresolveSemanticTarget } from "./semantic-targets.js";
import { validateVisualAction } from "./visual-grounding.js";
import { journalPropose, journalTransition, journalReconcile, admitOnce, acquireDesktopLease, releaseDesktopLease } from "./action-journal.js";
import { selectModality } from "./modality-router.js";
import { storeObservation, getObservation, findObservationWithTarget, invalidateObservationsForRun, invalidateObservationsForBot, type CapturedObservation, type RegistryTarget, type RegistryPane } from "./observation-registry.js";

type CommandResult = { code: number; stdout: string; stderr: string; sourceChanged?: boolean; runtimeIdentity?: string };
type TeachStep = SkillStep & { at: string };
export class BrowserUploadUncertainError extends Error {}
const PROJECT_SCAN_SKIP = new Set(["node_modules", "vendor"]);

/** One login-wall observation: a short evidence string (never credentials) or
 * null when the page shows no gate. Pure page read, split out for unit tests
 * with a stub page. */
export async function detectLoginWall(page: { locator(s: string): { evaluate<T>(fn: (body: Element) => T): Promise<T> } }): Promise<string | null> {
  return page.locator("body").evaluate((body) => {
    // Keep every callback inline and unnamed: tsx injects a __name helper
    // into declared functions, which does not exist inside the page. Only
    // argument-position arrows and plain loops are used below — both are
    // proven to survive the trip (a nested const-arrow broke this once).
    // Login-like text inside a message list (a phishing subject, a shared doc
    // title) is content, not a gate: matches buried in a long list never
    // count, so an inbox can never cry wolf.
    const skip = new Set<Element>();
    const lists = [...body.querySelectorAll('table,[role="table"],[role="grid"],[role="list"],ul,ol,[role="feed"],[role="rowgroup"]')];
    for (const list of lists) {
      if (list.querySelectorAll('tr,[role="row"],li,[role="article"],article').length <= 5) continue;
      const inner = list.querySelectorAll('h1,h2,[role="heading"],input[type="password"],input[autocomplete="one-time-code"]');
      for (const node of inner) skip.add(node);
    }
    const fields = [...body.querySelectorAll('input[type="password"], input[autocomplete="one-time-code"]')];
    for (const node of fields) {
      if (!skip.has(node) && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden") return "visible credential field";
    }
    let heading = "";
    const heads = [...body.querySelectorAll('h1,h2,[role="heading"]')];
    for (const node of heads) {
      if (skip.has(node) || node.getClientRects().length === 0 || getComputedStyle(node).visibility === "hidden") continue;
      heading += `${node.textContent || ""} `;
      if (heading.length > 120) break;
    }
    heading = heading.slice(0, 120);
    if (/sign[ -]?in|log[ -]?in|verify (?:your |it.?s you)|enter.*(?:code|password)|choose an account/i.test(heading)) {
      const controls = [...body.querySelectorAll('input,button,[role="button"]')];
      for (const node of controls) {
        if (node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden") return `login heading ${JSON.stringify(heading.slice(0, 80))}`;
      }
    }
    return null;
  });
}

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

/** OB-03: subprocess output is bounded per stream (endless output cannot
 * grow memory without limit), and an expired timeout escalates SIGTERM to
 * SIGKILL so the work actually stops — not just the wait. Truncation is
 * reported on stderr so stdout payloads (JSON tool results) stay intact. */
const SUBPROCESS_STREAM_LIMIT = 4 * 1024 * 1024;
const SUBPROCESS_KILL_GRACE_MS = 5_000;

export { SUBPROCESS_STREAM_LIMIT };

export function run(command: string, args: string[], timeoutMs = 30_000, extraEnvironment: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: safeHostEnvironment(extraEnvironment), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false, droppedOut = 0, droppedErr = 0;
    const killTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const settle = (code: number, extraError = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer.current) clearTimeout(killTimer.current);
      if (droppedOut > 0) stderr += `\n[OpenBot truncated stdout at 4 MiB; ${droppedOut} further bytes were dropped, not executed.]`;
      if (droppedErr > 0) stderr += `\n[OpenBot truncated stderr at 4 MiB; ${droppedErr} further bytes were dropped.]`;
      resolve({ code, stdout, stderr: `${stderr}${extraError}` });
    };
    const append = (text: string, stream: "out" | "err") => {
      if (stream === "out") {
        if (stdout.length + text.length > SUBPROCESS_STREAM_LIMIT) {
          const room = Math.max(0, SUBPROCESS_STREAM_LIMIT - stdout.length);
          stdout += text.slice(0, room);
          droppedOut += text.length - room;
        } else stdout += text;
      } else if (stderr.length + text.length > SUBPROCESS_STREAM_LIMIT) {
        const room = Math.max(0, SUBPROCESS_STREAM_LIMIT - stderr.length);
        stderr += text.slice(0, room);
        droppedErr += text.length - room;
      } else stderr += text;
    };
    child.stdout.on("data", (chunk) => append(String(chunk), "out"));
    child.stderr.on("data", (chunk) => append(String(chunk), "err"));
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* already gone */ }
      killTimer.current = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
      }, SUBPROCESS_KILL_GRACE_MS);
    }, timeoutMs);
    child.on("error", (error) => settle(1, error.message));
    child.on("close", (code) => settle(code ?? 1));
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

export function chromePath(): string | undefined {
  const candidates = [
    process.env.OPENBOT_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((value): value is string => Boolean(value));
  return candidates.find(existsSync);
}

/** Multi-label public suffixes where the last two labels are NOT the
 * registrable site (example.co.uk is a site; co.uk is not). Curated subset
 * covering the suffixes browsers actually encounter; extended with a test
 * whenever a new one matters. Full PSL parity is deliberately avoided to
 * keep this dependency-free — a wrong grouping here merges two sites'
 * sessions, so every entry is covered by a fixture. */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "ac.uk", "gov.uk", "nhs.uk", "sch.uk",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp", "ed.jp",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "asn.au", "id.au",
  "co.nz", "org.nz", "net.nz", "govt.nz", "school.nz",
  "com.br", "net.br", "org.br", "gov.br",
  "com.mx", "com.ar", "com.co", "com.tr", "com.sg", "com.hk", "com.tw",
  "co.in", "co.kr", "or.kr", "go.kr",
  "co.za", "com.za", "org.za", "web.za",
  "co.il", "org.il", "net.il", "gov.il",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
]);

/** Group cookies by their registrable site: the label below the public
 * suffix. Never merges example.co.uk with evil.co.uk. */
export function siteForCookieDomain(domain: string): string | null {
  const clean = domain.replace(/^\./, "").toLowerCase().trim();
  const labels = clean.split(".");
  if (labels.length < 2 || labels.some((label) => !label || !/^[a-z0-9-]+$/.test(label))) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    if (labels.length < 3) return null;
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

function cookieDomainMatches(cookieDomain: string, site: string): boolean {
  const clean = cookieDomain.replace(/^\./, "").toLowerCase();
  return clean === site.toLowerCase() || clean.endsWith(`.${site.toLowerCase()}`);
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
  private static readonly contextArgsVersion = "2026-09-automation-controlled";
  private readonly contexts = new Map<string, BrowserContext>();
  private readonly contextHeadless = new Map<string, boolean>();
  private readonly contextArgsVersions = new Map<string, string>();
  private readonly navigationServices = new WeakMap<Page, string[]>();
  private readonly teaching = new Map<string, { name: string; startUrl: string; steps: TeachStep[] }>();

  constructor(private readonly db: OpenBotDatabase, private readonly options: { headlessTeaching?: boolean } = {}) {}

  private writeTaughtSkill(botId: string, slug: string, name: string, description: string, instructions: string, startUrl: string, steps: SkillStep[]): string {
    const stepText = steps.map((step, index) => `${index + 1}. ${step.type}${step.selector ? ` ${step.selector}` : ""}${step.value ? ` → ${step.value}` : ""} (${step.url})`).join("\n");
    const variables = [...new Set(steps.flatMap((step) => step.value?.match(/\{\{[a-z0-9_-]+\}\}/gi) || []))];
    const content = `---\nname: ${slug}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${instructions}\n\n## Prerequisites and failure rules\n\nThis is a reusable draft, not proof of a reliable automation. Prefer a permitted connector when it can do the job. Use only this teammate's browser profile, never another application's sign-in. ${startUrl ? `Start at ${startUrl}. Inspect the current page before every browser action.` : "No starting website is required. Use the owner-supplied files, project or task inputs; do not navigate to a made-up website."} Stop for owner takeover on login expiry, human verification, permission prompts, an unexpected account, or changed controls. Never guess selectors from old steps, click through an unknown state, or repeat an uncertain submission. External writes still require approval. After a successful supervised run, validate on a different owner-supplied input before suggesting scheduling. Do not claim that this validation already happened.\n\n## Inputs\n\n${variables.length ? `Ask the owner for these inputs when absent: ${variables.join(", ")}. Do not type literal placeholders. Secrets must be entered by the owner through takeover, never requested in chat. Recorded input values and query/fragment state are deliberately not retained; confirm the intended page when those details matter.` : "Ask for missing task scope before acting. Never guess credentials; use owner takeover."}\n\n## Saved steps — observations, not authority\n\n${stepText || "No fixed actions are required. Follow the instructions and verify the result."}\n`;
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
    if (definition.startUrl) safeUrl(definition.startUrl);
    for (const step of definition.steps) safeUrl(step.url);
    const findings = skillSecretFindings(definition);
    if (findings.length) throw new Error(`Remove private information first: ${findings.join(", ")}. Use placeholders such as {{secret}} instead.`);
  }

  createTaughtWorkflow(botId: string, definition: SkillDefinition, source: TaughtWorkflow["source"]): TaughtWorkflow {
    const bot = this.db.getBot(botId);
    if (!bot || bot.retiredAt) throw new Error("Choose an available teammate for this skill.");
    this.validateSkill(definition);
    const slug = this.db.nextWorkflowSlug(botId, definition.name);
    const skillPath = this.writeTaughtSkill(botId, slug, definition.name, definition.description, definition.instructions, definition.startUrl, definition.steps);
    return this.db.saveWorkflow({ ...definition, botId, skillPath, skillSlug: slug, source });
  }

  /** Turn one of the teammate's skills on or off. Off means the harness
   * directories lose the skill entirely — the model cannot load what is not
   * there — and routing refuses it by name. */
  async setSkillEnabled(workflowId: string, enabled: boolean): Promise<TaughtWorkflow> {
    const record = this.db.getWorkflowRecord(workflowId);
    if (!record) throw new Error("That skill is not available.");
    const { workflow, steps } = record;
    const slug = workflow.skillSlug || skillSlug(workflow.name);
    if (!enabled) {
      for (const provider of [".opencode", ".claude"]) {
        const directory = path.join(this.db.workspacesDir, workflow.botId, provider, "skills", slug);
        if (existsSync(directory)) rmSync(directory, { recursive: true });
      }
    } else if (!existsSync(path.join(this.db.workspacesDir, workflow.botId, ".opencode", "skills", slug, "SKILL.md"))) {
      this.writeTaughtSkill(workflow.botId, slug, workflow.name, workflow.description, workflow.instructions, workflow.startUrl, steps as SkillStep[]);
    }
    const updated = this.db.setWorkflowEnabled(workflowId, enabled);
    if (!updated) throw new Error("That skill is not available.");
    return updated;
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
      // Providers like Google refuse sign-in when Chromium advertises
      // automation ("This browser or app may not be secure"). This flag keeps
      // navigator.webdriver at the value a normal browser reports. It does not
      // grant the model anything new: page access rules still apply.
      args: ["--disable-blink-features=AutomationControlled", "--disable-background-networking", "--disable-sync", "--no-default-browser-check", ...containerArgs],
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
    this.contextHeadless.set(botId, headless || this.options.headlessTeaching === true);
    this.contextArgsVersions.set(botId, BrowserManager.contextArgsVersion);
    this.contexts.set(botId, context);
    return context;
  }

  private async page(botId: string): Promise<Page> {
    const context = await this.context(botId);
    const active = this.activePage(botId);
    if (active) {
      this.trackDocumentGenerations(active);
      return active;
    }
    const fresh = await context.newPage();
    this.activePages.set(botId, fresh);
    this.trackDocumentGenerations(fresh);
    return fresh;
  }

  /** Tabs: the owner and the agent share one explicit active tab, like a real
   * browser. Agent tools always act on the active tab; background tabs are
   * never inspected unless selected. At most MAX_TABS per teammate. */
  private readonly activePages = new Map<string, Page>();
  private readonly tabIds = new WeakMap<Page, string>();
  private readonly tabSeq = new Map<string, number>();
  static readonly maxTabs = 8;

  /** Host-owned document navigation generations (Finding D): bumped on
   * every main-frame navigation of a tracked page. Same-URL reloads and
   * navigations advance the generation even though the URL is unchanged. */
  private readonly documentGenerations = new WeakMap<Page, number>();
  private readonly generationListeners = new WeakSet<Page>();

  private trackDocumentGenerations(page: Page): void {
    if (this.generationListeners.has(page)) return;
    this.generationListeners.add(page);
    if (!this.documentGenerations.has(page)) this.documentGenerations.set(page, 1);
    page.on("framenavigated", (frame) => {
      try {
        if (frame === page.mainFrame() && !page.isClosed()) {
          this.documentGenerations.set(page, (this.documentGenerations.get(page) ?? 1) + 1);
        }
      } catch {
        // Listener bookkeeping never breaks navigation.
      }
    });
  }

  /** Content generation bound to a live page: title plus a bounded hash of
   * the serialized document. Same-URL in-place replacement changes the
   * hash while the URL stays put. Closure-free (in-page constraint). */
  private async contentGeneration(page: Page): Promise<{ hash: string; length: number }> {
    try {
      return await page.evaluate(() => {
        const root = document.documentElement;
        const html = root ? root.outerHTML : "";
        const sample = `${document.title}|${html.length}|${html.slice(0, 2000)}|${html.slice(-2000)}`;
        let hash = 0x811c9dc5;
        for (let index = 0; index < sample.length; index += 1) {
          hash ^= sample.charCodeAt(index);
          hash = Math.imul(hash, 0x01000193);
        }
        return { hash: (hash >>> 0).toString(36), length: html.length };
      });
    } catch {
      return { hash: "unreadable", length: -1 };
    }
  }

  private documentEpochFor(botId: string, page: Page, contentHash: string): string {
    this.trackDocumentGenerations(page);
    return `${this.tabId(botId, page)}:${this.documentGenerations.get(page) ?? 1}:${contentHash}`;
  }

  private activePage(botId: string): Page | null {
    const context = this.contexts.get(botId);
    if (!context) return null;
    const open = context.pages().filter((page) => !page.isClosed());
    const active = this.activePages.get(botId);
    if (active && open.includes(active)) return active;
    const first = open[0] || null;
    if (first) this.activePages.set(botId, first);
    else this.activePages.delete(botId);
    return first;
  }

  private tabId(botId: string, page: Page): string {
    let id = this.tabIds.get(page);
    if (!id) {
      const next = (this.tabSeq.get(botId) || 0) + 1;
      this.tabSeq.set(botId, next);
      id = `${next}`;
      this.tabIds.set(page, id);
    }
    return id;
  }

  private async tabView(botId: string): Promise<{ tabs: Array<{ id: string; url: string; title: string; active: boolean }>; url: string; title: string }> {
    const context = this.contexts.get(botId);
    const active = this.activePage(botId);
    const tabs: Array<{ id: string; url: string; title: string; active: boolean }> = [];
    for (const page of context?.pages() || []) {
      if (page.isClosed()) continue;
      tabs.push({ id: this.tabId(botId, page), url: page.url(), title: (await page.title().catch(() => "")) || "New tab", active: page === active });
    }
    const current = active && !active.isClosed() ? active : null;
    return { tabs, url: current?.url() || "", title: current ? await current.title().catch(() => "") : "" };
  }

  private findTab(botId: string, tabId: string): Page | null {
    const context = this.contexts.get(botId);
    for (const page of context?.pages() || []) {
      if (!page.isClosed() && this.tabId(botId, page) === tabId) return page;
    }
    return null;
  }

  async listTabs(botId: string) {
    return this.tabView(botId);
  }

  async openTab(botId: string, rawUrl?: string) {
    const url = rawUrl ? safeUrl(rawUrl) : null;
    if (url) this.assertWebsiteAccess(botId, url.toString());
    const context = await this.context(botId);
    const open = context.pages().filter((page) => !page.isClosed());
    if (open.length >= BrowserManager.maxTabs) throw new Error(`This browser already has ${BrowserManager.maxTabs} tabs open. Close one first.`);
    const page = await context.newPage();
    this.activePages.set(botId, page);
    if (url) {
      await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      this.assertPageAccess(botId, page);
    }
    try { await page.bringToFront(); } catch { /* Focus is a courtesy. */ }
    return this.tabView(botId);
  }

  async selectTab(botId: string, tabId: string) {
    const page = this.findTab(botId, tabId);
    if (!page) throw new Error("That tab is no longer open. Pick another one.");
    this.activePages.set(botId, page);
    try { await page.bringToFront(); } catch { /* Focus is a courtesy. */ }
    return this.tabView(botId);
  }

  async closeTab(botId: string, tabId: string) {
    const context = this.contexts.get(botId);
    const open = context?.pages().filter((page) => !page.isClosed()) || [];
    if (open.length <= 1) throw new Error("A browser keeps at least one tab. Open a new one first.");
    const page = this.findTab(botId, tabId);
    if (!page) throw new Error("That tab is no longer open.");
    await page.close().catch(() => {});
    return this.tabView(botId);
  }

  async navigateTab(botId: string, to: "back" | "forward" | "reload") {
    const page = this.activePage(botId);
    if (!page) throw new Error("The private browser is not running. It starts with the next browser task.");
    const done = to === "back" ? await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null)
      : to === "forward" ? await page.goForward({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null)
      : await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
    if (!done && to !== "reload") throw new Error(to === "back" ? "No earlier page in this tab." : "No later page in this tab.");
    this.assertPageAccess(botId, page);
    return this.tabView(botId);
  }

  async open(botId: string, rawUrl: string): Promise<{ url: string; title: string }> {
    const url = safeUrl(rawUrl);
    this.assertWebsiteAccess(botId, url.toString());
    const page = await this.page(botId);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title() };
  }

  /** Open the bot's own persistent browser as a visible window the owner can
   * drive themselves, then hand back with the existing sign-in continue.
   * Same profile as headless work, so a login made by hand belongs to the
   * same bot's browser when the task resumes. Refuses while the bot is
   * actively working so a live page can never be pulled away mid-action. */
  async openWindow(botId: string, rawUrl?: string): Promise<{ url: string; title: string }> {    const bot = this.db.getBot(botId);
    if (!bot) throw new Error("Teammate not found.");
    if (!bot.browserEnabled) throw new Error("This teammate's browser is turned off.");
    if (bot.status === "working") throw new Error(`${bot.name} is working in the browser right now. Wait until the task pauses, then open the window.`);
    const executablePath = chromePath();
    if (!executablePath) throw new Error("Chrome or Chromium is required for browser work.");
    const url = rawUrl ? safeUrl(rawUrl) : null;
    if (url) this.assertWebsiteAccess(botId, url.toString());
    const existing = this.contexts.get(botId);
    if (existing) await existing.close().catch(() => {});
    let context: BrowserContext;
    try {
      const profile = path.join(this.db.computersDir, botId, "browser");
      mkdirSync(profile, { recursive: true });
      const containerArgs = process.env.OPENBOT_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
      context = await chromium.launchPersistentContext(profile, {
        executablePath, headless: false, viewport: { width: 1280, height: 820 },
        serviceWorkers: "block",
        // Same automation-fingerprint fix as the automated context above: the
        // window must look like a normal Chrome to sign-in providers.
        args: ["--disable-blink-features=AutomationControlled", "--disable-background-networking", "--disable-sync", "--no-default-browser-check", ...containerArgs],
      });
    } catch (error) {
      throw new Error(`A visible window needs a display on the Mac running OpenBot. ${error instanceof Error ? error.message : String(error)}`.slice(0, 300));
    }
    await context.route("**/*", (route) => browserWebsiteBlock(this.db, botId, route.request().url()) ? route.abort("blockedbyclient") : route.continue());
    context.on("close", () => { if (this.contexts.get(botId) === context) { this.contexts.delete(botId); this.contextHeadless.delete(botId); this.contextArgsVersions.delete(botId); } });
    this.contextHeadless.set(botId, false);
    this.contextArgsVersions.set(botId, BrowserManager.contextArgsVersion);
    this.contexts.set(botId, context);
    const page = context.pages()[0] || await context.newPage();
    if (url) {
      await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      this.assertPageAccess(botId, page);
    }
    try { await page.bringToFront(); } catch { /* The window is open; focus is a courtesy. */ }
    return { url: page.url(), title: await page.title() };
  }

  private readonly screencasts = new Map<string, { session: CDPSession; frame: Buffer | null; at: number; idle: NodeJS.Timeout | null }>();
  private static readonly screencastIdleMs = 45_000;

  /** Live JPEG frames of the bot's own page via CDP screencast, for in-app
   * viewing (web, Mac, iPhone) without a desktop window. Starts on first
   * request, stops after 45s without viewers or on explicit stop. Works
   * headless: no display is needed to watch. */
  async screencastFrame(botId: string): Promise<{ frame: Buffer; at: number } | null> {
    const bot = this.db.getBot(botId);
    if (!bot) throw new Error("Teammate not found.");
    if (!bot.browserEnabled) throw new Error("This teammate's browser is turned off.");
    let cast = this.screencasts.get(botId);
    if (!cast) {
      const page = await this.page(botId);
      const context = page.context();
      let session: CDPSession;
      try {
        session = await context.newCDPSession(page);
        await session.send("Page.startScreencast", { format: "jpeg", quality: 65, maxWidth: 1280, maxHeight: 820 });
      } catch (error) {
        throw new Error(`Live view is unavailable: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
      }
      cast = { session, frame: null, at: 0, idle: null };
      this.screencasts.set(botId, cast);
      const current = cast;
      session.on("Page.screencastFrame", ({ data, sessionId }: { data: string; sessionId: number }) => {
        current.frame = Buffer.from(data, "base64");
        current.at = Date.now();
        void session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      });
      session.on("close", () => this.stopScreencast(botId));
    }
    if (cast.idle) clearTimeout(cast.idle);
    cast.idle = setTimeout(() => this.stopScreencast(botId), BrowserManager.screencastIdleMs);
    cast.idle.unref?.();
    for (let attempt = 0; attempt < 50 && !cast.frame; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!this.screencasts.get(botId)) return null;
    }
    return cast.frame ? { frame: cast.frame, at: cast.at } : null;
  }

  stopScreencast(botId: string) {
    const cast = this.screencasts.get(botId);
    if (!cast) return false;
    if (cast.idle) clearTimeout(cast.idle);
    this.screencasts.delete(botId);
    void cast.session.send("Page.stopScreencast").catch(() => {});
    void cast.session.detach().catch(() => {});
    return true;
  }

  /** Detect obvious gates without returning field values or the login URL. The
   * model can explicitly request a handoff for gates this conservative check misses.
   * Returns a short evidence string (never credentials) or null. Redirect hops
   * and loading screens are not verdicts: the URL must settle before anything
   * is judged, and a positive is re-checked after settling. */
  async signInState(botId: string): Promise<{ siteOrigin: string; needsSignIn: boolean; evidence: string | null }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    // Wait for the address to stop hopping (login redirects, session-check
    // bounces, client-side forwards). Judging mid-redirect cried wolf on
    // valid sessions more than once.
    let lastUrl = "";
    for (let n = 0; n < 10; n++) {
      let current = "";
      try { current = page.url(); } catch { break; }
      if (current && current === lastUrl) break;
      lastUrl = current;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    this.assertPageAccess(botId, page);
    const settled = async (): Promise<{ siteOrigin: string; needsSignIn: boolean; evidence: string | null }> => {
      const address = new URL(page.url());
      if (/\/(?:login|signin|sign-in|log-in|sso|oauth2?\/authorize)(?:\/|$)/i.test(address.pathname)) {
        return { siteOrigin: address.origin, needsSignIn: true, evidence: `login page ${address.pathname.slice(0, 80)}` };
      }
      const evidence = await detectLoginWall(page as unknown as { url(): string; locator(s: string): { evaluate<T>(fn: (body: Element) => T): Promise<T> } });
      this.assertPageAccess(botId, page);
      return { siteOrigin: new URL(page.url()).origin, needsSignIn: evidence !== null, evidence };
    };
    const first = await settled();
    if (!first.needsSignIn) return first;
    // A positive during navigation is usually a loading interstitial, not a
    // signed-out session. Settle again and re-check once; only a persistent
    // login wall counts. This is the false-alarm fix: never cry wolf on load.
    lastUrl = "";
    for (let n = 0; n < 6; n++) {
      let current = "";
      try { current = page.url(); } catch { break; }
      if (current && current === lastUrl) break;
      lastUrl = current;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    this.assertPageAccess(botId, page);
    return settled();
  }

  /** Sign-in handoffs need a real, visible Chrome: providers like Google
   * refuse automated headless browsers ("This browser or app may not be
   * secure"). Relaunch the bot's browser headed on the same profile,
   * resuming its current page, or the preferred sign-in URL when starting
   * fresh (for example after a server restart with a pending handoff). On a
   * display-less host this keeps the headless browser and the owner uses
   * another machine's window. */
  async ensureHeaded(botId: string, preferredUrl?: string): Promise<void> {
    const bot = this.db.getBot(botId);
    if (!bot?.browserEnabled || bot.status === "working") return;
    const existing = this.contexts.get(botId);
    // Already headed on the current launch settings: keep it, so an open
    // window is never pulled away mid-sign-in. A window launched by an older
    // build (different launch settings, e.g. without the current
    // anti-detection flags) is replaced here, resuming its page.
    if (existing && !this.contextHeadless.get(botId) && this.contextArgsVersions.get(botId) === BrowserManager.contextArgsVersion) return;
    let resumeUrl: string | null = null;
    if (existing) {
      try { const current = existing.pages()[0]?.url(); if (current && /^https?:/i.test(current)) resumeUrl = current; } catch { /* closed under us; open fresh */ }
      await existing.close().catch(() => {});
    }
    const target = resumeUrl || (preferredUrl && /^https?:/i.test(preferredUrl) ? preferredUrl : undefined);
    try { await this.openWindow(botId, target); } catch { /* No display here; the headless browser stays. */ }
  }

  async signInView(botId: string) {
    await this.ensureHeaded(botId);
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    return { siteOrigin: signInOrigin(page.url()), screenshot: await this.screenshot(botId) };
  }

  /** Own-browser bridge: install the owner's session cookies (already read
   * and filtered for this origin) into the teammate's persistent browser, so
   * a login made by hand on the owner's side belongs to this teammate. The
   * page is then reloaded at the origin so the signed-in state is visible to
   * the owner and usable by the task. Cookie values never enter logs or the
   * model. */
  async importOwnerCookies(botId: string, origin: string, cookies: Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: "Strict" | "Lax" | "None" | null }>): Promise<{ url: string; imported: number }> {
    this.assertWebsiteAccess(botId, origin);
    const usable = cookies.filter((cookie) => cookie.name && cookie.value && cookie.domain);
    if (!usable.length) throw new Error("No usable session cookies were found for this site.");
    const context = await this.context(botId);
    await context.addCookies(usable.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      ...(cookie.sameSite ? { sameSite: cookie.sameSite as "Strict" | "Lax" | "None" } : {}),
    })));
    const page = context.pages()[0] || await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => { /* The session is installed even if a slow page refuses to settle. */ });
    this.assertPageAccess(botId, page);
    return { url: page.url(), imported: usable.length };
  }

  /** Per-site data controls: which sites hold session data in this
   * teammate's browser. Only site names and counts — never cookie values. */
  async listSiteData(botId: string): Promise<Array<{ site: string; cookies: number }>> {
    const context = this.contexts.get(botId);
    if (!context) return [];
    const sites = new Map<string, number>();
    for (const cookie of await context.cookies()) {
      const site = siteForCookieDomain(cookie.domain);
      if (site) sites.set(site, (sites.get(site) || 0) + 1);
    }
    return [...sites.entries()].map(([site, cookies]) => ({ site, cookies })).sort((left, right) => left.site.localeCompare(right.site));
  }

  /** Sign out of one site: cookies for that site (and its subdomains) plus
   * the site's origin storage. Other sites' sessions are untouched. */
  async clearSiteData(botId: string, site: string): Promise<{ cleared: number }> {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site)) throw new Error("That does not look like a website address.");
    const context = this.contexts.get(botId);
    if (!context) throw new Error("The private browser is not running. It starts with the next browser task.");
    const cookies = await context.cookies();
    let cleared = 0;
    for (const cookie of cookies) {
      if (!cookieDomainMatches(cookie.domain, site)) continue;
      await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path }).catch(() => {});
      cleared += 1;
    }
    await this.evictOriginStorage(context, site);
    return { cleared };
  }

  /** Sign out everywhere: all cookies and every listed site's storage. */
  async clearAllSiteData(botId: string): Promise<{ cleared: number }> {
    const context = this.contexts.get(botId);
    if (!context) throw new Error("The private browser is not running. It starts with the next browser task.");
    const cookies = await context.cookies();
    const sites = new Set(cookies.map((cookie) => siteForCookieDomain(cookie.domain)).filter(Boolean)) as Set<string>;
    await context.clearCookies();
    for (const site of sites) await this.evictOriginStorage(context, site);
    return { cleared: cookies.length };
  }

  private async evictOriginStorage(context: BrowserContext, site: string): Promise<void> {
    const page = context.pages()[0];
    if (!page) return;
    try {
      const session = await context.newCDPSession(page);
      for (const origin of [`https://${site}`, `https://www.${site}`, `http://${site}`]) {
        await session.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" }).catch(() => {});
      }
      await session.detach().catch(() => {});
    } catch { /* Cookie clearing already happened; storage eviction is best-effort. */ }
  }

  /** Current address and title for the live view header. Page content is not
   * returned here; use snapshot for text. */
  async describePage(botId: string): Promise<{ url: string; title: string }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title() };
  }

  async snapshot(botId: string): Promise<{ url: string; title: string; text: string }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    const text = await page.locator("body").evaluate((body) => {
      const visible = [...body.querySelectorAll<HTMLElement>("h1,h2,h3,p,a,button,input,textarea,select,dialog,[role],[aria-modal=true],[contenteditable=true]")]
        .filter(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.parentElement?.closest('textarea,[contenteditable=true]'));
      const dialog = visible.filter(el => el.matches('dialog,[role=dialog],[aria-modal=true]')).at(-1);
      // A long background page must not push the active editor past the cap.
      // Keep the dialog and editable controls ahead of background prose.
      const elements = [...new Set([
        ...visible.filter(el => dialog && (el === dialog || dialog.contains(el))),
        ...visible.filter(el => el.matches('input,textarea,select,button,[role=button],[role=combobox],[contenteditable=true]')),
        ...visible,
      ])].slice(0, 250);
      return elements.map((element, index) => {
        const html = element as HTMLElement;
        const role = html.getAttribute("role") || html.tagName.toLowerCase();
        const input = html as HTMLInputElement;
        const editable = html.matches('input,textarea,select,[contenteditable=true]');
        const structural = html.matches('dialog,[role=dialog],[role=main],[role=region],[role=grid],[role=row],[role=group],[contenteditable=true],textarea');
        // Ancestor labels must not reintroduce a private textarea or editable
        // value that is redacted on its own line.
        const labelCopy = html.cloneNode(true) as HTMLElement;
        labelCopy.querySelectorAll('input,textarea,select,[contenteditable=true],[aria-hidden=true],.material-icons,.google-material-icons').forEach(el => el.remove());
        const associatedLabel = [...(input.labels || [])].map(el => {
          const copy = el.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('input,textarea,select,[contenteditable=true]').forEach(child => child.remove());
          return copy.textContent || '';
        }).join(' ');
        const privateField = editable && /password|passcode|secret|token|one-time-code|verification|cc-|\b(?:otp|pin|cvv|cvc)\b/i.test(`${input.type} ${input.name} ${input.autocomplete} ${html.getAttribute('aria-label') || ''} ${html.getAttribute('placeholder') || ''} ${associatedLabel} ${html.id}`);
        const label = html.getAttribute("aria-label") || associatedLabel || html.getAttribute("placeholder") || (structural || privateField ? '' : labelCopy.textContent) || (privateField ? "Secure field" : '');
        const value = !editable ? '' : privateField ? '[Private field hidden]' : html instanceof HTMLInputElement && ['checkbox', 'radio'].includes(html.type) ? String(html.checked) : html instanceof HTMLSelectElement ? [...html.selectedOptions].map(option => option.text).join(', ') : html instanceof HTMLInputElement || html instanceof HTMLTextAreaElement ? html.value : html.innerText;
        const candidates = [html.id ? `#${CSS.escape(html.id)}` : '', ...['name','aria-label','placeholder'].map(attr => html.getAttribute(attr) ? `${html.tagName.toLowerCase()}[${attr}="${CSS.escape(html.getAttribute(attr)!)}"]` : '')].filter(Boolean);
        const selector = candidates.find(candidate => document.querySelectorAll(candidate).length === 1);
        return `${index + 1}. [${role}] ${label.trim().replace(/\s+/g, " ").slice(0, 240)}${editable ? ` | value: ${JSON.stringify(value.slice(0, 500))}` : ''}${selector ? ` | selector: ${selector}` : ''}`;
      }).filter((line) => !line.endsWith("] ")).join("\n") + (visible.length > elements.length ? '\n[Partial page: 250 elements maximum. Active editors and controls are prioritized; missing text is not proof that an item does not exist.]' : '');
    });
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title(), text: text.length > 30_000 ? `${text.slice(0, 29_700)}\n[Partial page: text limit reached. Missing content is not proof that an item does not exist.]` : text };
  }

  async describeTarget(botId: string, selector: string): Promise<BrowserTarget & { fingerprint: string }> {
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    const details = await page.locator(selector).first().evaluate((element) => {
      const node = element.closest("button,a,input,textarea,select,[role=button],[role=link]") || element;
      const input = node as HTMLInputElement;
      const form = input.form || node.closest("form");
      // Keep browser-evaluated callbacks closure-free: tsx's named-function
      // helper is a Node global and does not exist inside the page.
      const labelNodes = [...(input.labels || []), node];
      const labelTexts = labelNodes.map(el => {
        const clone = el.cloneNode(true) as Element;
        clone.querySelectorAll('[aria-hidden="true"],.material-icons,.google-material-icons').forEach(icon => icon.remove());
        return (el.getAttribute('aria-label') || clone.textContent || '').replace(/\s+/g, ' ').trim();
      });
      const label = (node.getAttribute("aria-label") || labelTexts.slice(0, -1).join(" ") || labelTexts.at(-1) || node.getAttribute("name") || "").trim().slice(0, 240);
      const controlledIds = (node.getAttribute("aria-controls") || "").trim().split(/\s+/).filter(Boolean);
      const disclosure = node.matches('button,[role="button"]') && node.getAttribute("aria-expanded") === "false" && controlledIds.length > 0 && controlledIds.length <= 3 && controlledIds.every(id => id.length <= 200)
        ? { expanded: false as const, controls: controlledIds }
        : null;
      const stateful = node.matches('input,textarea,select,[contenteditable="true"],[role="checkbox"],[role="switch"],[role="radio"],[role="option"],[role="slider"],[role="spinbutton"],[role="textbox"],[role="combobox"]')
        || ['aria-pressed', 'aria-checked', 'aria-selected'].some(attribute => node.hasAttribute(attribute));
      const dialog = node.closest('dialog,[role="dialog"]');
      // Navigation controls in app sidebars must not become unreviewable just
      // because an unrelated document editor exists elsewhere on the page.
      // This changes review metadata only; clicks still require exact approval.
      const navigation = !form && !dialog && node.matches('button,a,[role="button"],[role="link"]')
        ? node.closest('nav,aside,[role="navigation"],[role="menu"]')
        : null;
      const scope = form || dialog || navigation || document.body;
      const contextScope = form ? "form" as const : dialog ? "dialog" as const : navigation ? "navigation" as const : "page" as const;
      const controls = [...scope.querySelectorAll<HTMLElement>('input:not([type="hidden"]),textarea,select,[contenteditable="true"]')].filter(el => el.getClientRects().length > 0);
      let complete = controls.length <= 24;
      const fields = controls.slice(0, 24).map((el, index) => {
        const associatedLabel = [...((el as HTMLInputElement).labels || [])].map(item => {
          const clone = item.cloneNode(true) as Element;
          clone.querySelectorAll('[aria-hidden="true"],.material-icons,.google-material-icons').forEach(icon => icon.remove());
          return (item.getAttribute('aria-label') || clone.textContent || '').replace(/\s+/g, ' ').trim();
        }).join(' ');
        const name = (el.getAttribute('aria-label') || associatedLabel || el.getAttribute('placeholder') || el.getAttribute('name') || `Field ${index + 1}`).slice(0, 200);
        const privateField = /password|passcode|one-time-code|cc-|secret|token|verification/i.test(`${el.getAttribute('type')} ${el.getAttribute('autocomplete')} ${name}`);
        const value = privateField ? '[Private field hidden]' : el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type) ? String(el.checked) : el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el.value : el.textContent || '';
        if (privateField || value.length > 2000) complete = false;
        return { label: name, value: value.slice(0, 2000) };
      });
      return {
        tag: node.tagName.toLowerCase(), role: node.getAttribute("role") || "",
        label,
        inputType: node instanceof HTMLInputElement || node instanceof HTMLButtonElement ? node.type : "",
        autocomplete: node.getAttribute("autocomplete") || "", href: node instanceof HTMLAnchorElement ? node.href : "",
        formMethod: form?.method.toLowerCase() || "",
        searchForm: Boolean(form && (form.getAttribute("role") === "search" || form.querySelector('input[type="search"]'))),
        stateful,
        review: { url: location.href, label, control: node.getAttribute('role') || node.tagName.toLowerCase(), fields, contextScope, disclosure, complete },
      };
    }, undefined, { timeout: 12_000 });
    this.assertPageAccess(botId, page);
    const target = { url: page.url(), ...details };
    return { ...target, fingerprint: createHash("sha256").update(JSON.stringify(target)).digest("hex") };
  }

  async describeFileInput(botId: string, selector: string) {
    const page = await this.page(botId), matches = page.locator(selector);
    if (await matches.count() !== 1) throw new Error("Choose a selector that identifies exactly one file input.");
    const valid = await matches.first().evaluate((node) => node instanceof HTMLInputElement && node.type === "file" && !node.disabled && !node.hasAttribute("webkitdirectory") && !node.hasAttribute("directory"));
    if (!valid) throw new Error("Choose one enabled file input; folder inputs are not supported.");
    return this.describeTarget(botId, selector);
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

  async click(botId: string, selector: string, fingerprint?: string, actionTimeoutMs = 12_000) {
    const page = await this.page(botId);
    await this.assertTarget(botId, selector, fingerprint);
    await page.locator(selector).first().click({ timeout: actionTimeoutMs });
    this.assertPageAccess(botId, page);
    return { url: page.url(), title: await page.title() };
  }

  async type(botId: string, selector: string, value: string, fingerprint?: string, actionTimeoutMs = 12_000) {
    const page = await this.page(botId);
    await this.assertTarget(botId, selector, fingerprint);
    const locator = page.locator(selector).first();
    await locator.fill(value, { timeout: actionTimeoutMs });
    return { url: page.url(), title: await page.title() };
  }

  /** Finding B: revocation-aware readiness wait plus a short committed
   * input. The legacy click/type wait up to 12s inside a locator action
   * with no cancellation guard; a revoke-then-enable sequence would fire
   * the waiting input. Here readiness is polled in short slices, and every
   * slice re-reads run status, secure-handoff state and the durable input
   * epoch. Only a control that is actionable AND unrevoked reaches the
   * final short-timeout input — and a revocation landing inside that final
   * window is reported as uncertain, never as success. */
  private assertNotRevoked(botId: string, runId: string, admittedEpoch: number): void {
    const run = this.db.getRun(runId);
    if (!run || ["completed", "failed", "cancelled"].includes(run.status)) {
      throw new Error("That task stopped while the control was becoming ready. Nothing was sent.");
    }
    if (this.secureHandoffActive(botId)) {
      throw new Error("SECURE_MODE: owner sign-in started while waiting. Nothing was sent.");
    }
    if (this.db.botInputEpoch(botId) !== admittedEpoch) {
      throw new Error("USER_TAKEOVER: control changed hands while waiting. Nothing was sent.");
    }
  }

  private async waitForActionable(
    page: Page,
    selector: string,
    botId: string,
    runId: string,
    admittedEpoch: number,
    deadlineMs = 12_000,
  ): Promise<void> {
    const start = Date.now();
    for (;;) {
      this.assertNotRevoked(botId, runId, admittedEpoch);
      try {
        await page.locator(selector).first().click({ trial: true, timeout: 250 });
        this.assertNotRevoked(botId, runId, admittedEpoch);
        return;
      } catch (error) {
        // A revocation refusal must surface immediately, never be mistaken
        // for a control that is merely not ready yet.
        if (error instanceof Error && /stopped while|SECURE_MODE|USER_TAKEOVER/.test(error.message)) throw error;
        if (Date.now() - start >= deadlineMs) {
          throw new Error("The control never became ready. Observe again.");
        }
        await page.waitForTimeout(150);
      }
    }
  }

  /** Finding B (round 4): the commit phase performs zero waiting
   * primitives. After trial readiness, every step is an immediate query
   * or dispatch with a synchronous revocation read between steps — there
   * is no second auto-wait for a revocation to land inside. A control
   * that is not immediately actionable refuses instead of waiting. */
  private async commitClick(page: Page, selector: string, botId: string, runId: string, admittedEpoch: number): Promise<void> {
    const locator = page.locator(selector).first();
    if (!(await locator.isEnabled().catch(() => false))) {
      throw new Error("The control is not enabled right now. Observe again.");
    }
    const box = await locator.boundingBox().catch(() => null);
    if (!box) throw new Error("The control has no screen position right now. Observe again.");
    this.assertNotRevoked(botId, runId, admittedEpoch);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  private async commitType(page: Page, selector: string, value: string, botId: string, runId: string, admittedEpoch: number): Promise<void> {
    const locator = page.locator(selector).first();
    if (!(await locator.isEditable().catch(() => false))) {
      throw new Error("The field is not editable right now. Observe again.");
    }
    const box = await locator.boundingBox().catch(() => null);
    if (!box) throw new Error("The field has no screen position right now. Observe again.");
    this.assertNotRevoked(botId, runId, admittedEpoch);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    this.assertNotRevoked(botId, runId, admittedEpoch);
    if (!(await locator.isEditable().catch(() => false))) {
      throw new Error("The field stopped being editable before typing. Observe again.");
    }
    // Keystroke insertion performs no readiness waits: revocation is
    // checked before the first keystroke, and ownership afterwards.
    await page.keyboard.type(value, { delay: 0 });
  }

  /** Ownership check after input crossed the dispatch boundary. A change
   * here does NOT mean nothing happened — the effect may be partial — so
   * callers record uncertainty and reconcile through readback. */
  private assertStillOwned(botId: string, runId: string, admittedEpoch: number): void {
    try {
      this.assertNotRevoked(botId, runId, admittedEpoch);
    } catch (error) {
      throw new Error(`Ownership changed during input (${error instanceof Error ? error.message : String(error)}). The effect may have occurred — verify before retrying.`);
    }
  }

  private async cancellableClick(botId: string, page: Page, selector: string, fingerprint: string, runId: string, admittedEpoch: number, beforeCommit?: () => Promise<void>): Promise<{ url: string; title: string }> {
    await this.waitForActionable(page, selector, botId, runId, admittedEpoch);
    await this.assertTarget(botId, selector, fingerprint);
    // Test-only barrier: lets a fixture deterministically interleave a
    // control-state change and revocation between readiness and commit.
    // Never passed by production callers.
    if (beforeCommit) await beforeCommit();
    await this.commitClick(page, selector, botId, runId, admittedEpoch);
    this.assertPageAccess(botId, page);
    this.assertStillOwned(botId, runId, admittedEpoch);
    return { url: page.url(), title: await page.title() };
  }

  private async cancellableType(botId: string, page: Page, selector: string, value: string, fingerprint: string, runId: string, admittedEpoch: number, beforeCommit?: () => Promise<void>): Promise<{ url: string; title: string }> {
    await this.waitForActionable(page, selector, botId, runId, admittedEpoch);
    await this.assertTarget(botId, selector, fingerprint);
    // Test-only barrier: see cancellableClick.
    if (beforeCommit) await beforeCommit();
    await this.commitType(page, selector, value, botId, runId, admittedEpoch);
    this.assertPageAccess(botId, page);
    this.assertStillOwned(botId, runId, admittedEpoch);
    return { url: page.url(), title: await page.title() };
  }

  async uploadFile(botId: string, selector: string, file: { name: string; mimeType: string; buffer: Buffer }, fingerprint: string, origin: string) {
    const page = await this.page(botId);
    await this.assertTarget(botId, selector, fingerprint);
    if (new URL(page.url()).origin !== origin) throw new Error("The upload page changed after review. Inspect it again and request a new approval.");
    const matches = page.locator(selector);
    if (await matches.count() !== 1) throw new Error("The reviewed file input is no longer unique.");
    const input = await matches.elementHandle();
    if (!input) throw new Error("The reviewed file input is no longer available.");
    try {
      const valid = await input.evaluate((node) => node instanceof HTMLInputElement && node.type === "file" && node.isConnected && !node.disabled && !node.hasAttribute("webkitdirectory") && !node.hasAttribute("directory"));
      if (!valid) throw new Error("The reviewed control is no longer an enabled file input.");
      await this.assertTarget(botId, selector, fingerprint);
      if (new URL(page.url()).origin !== origin) throw new Error("The upload page changed after review.");
      try {
        // Bind selection to this inspected DOM node, never a newly matched input.
        await input.setInputFiles(file, { timeout: 12_000 });
        this.assertPageAccess(botId, page);
        return { url: page.url(), title: await page.title() };
      } catch {
        throw new BrowserUploadUncertainError("The website may have received the file selection, but OpenBot could not confirm the final page state. Check the website before trying again.");
      }
    } finally { await input.dispose().catch(() => undefined); }
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

  /** Direct typing for the in-app sign-in browser: one validated key press
   * (a character or a named key) dispatched straight to the page. */
  async takeoverPress(botId: string, key: string) {
    const page = await this.page(botId);
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
    return { url: page.url(), title: await page.title(), screenshot: await this.screenshot(botId) };
  }

  /** Wheel scrolling under the pointer, so the in-app screen scrolls like a
   * real browser window instead of needing scroll controls. */
  async takeoverScroll(botId: string, x: number, y: number, deltaY: number) {
    const page = await this.page(botId);
    await page.mouse.move(Math.max(0, Math.min(1280, x)), Math.max(0, Math.min(820, y)));
    await page.mouse.wheel(0, Math.max(-3_000, Math.min(3_000, deltaY)));
    await page.waitForTimeout(140);
    return { url: page.url(), title: await page.title(), screenshot: await this.screenshot(botId) };
  }

  async screenshot(botId: string): Promise<string | null> {
    try {
      const page = await this.page(botId);
      return `data:image/jpeg;base64,${(await page.screenshot({ type: "jpeg", quality: 62 })).toString("base64")}`;
    } catch { return null; }
  }

  /**
   * R03 — Host-captured scoped observation. Everything authoritative is
   * derived by the host: tab/document identity, viewport/scroll/DPR,
   * secure-entry state (live login-wall probe), scope permission, owner
   * epoch (revocation-bound), visual capability (server registry, never a
   * caller assertion), and the opaque control/pane targets issued from the
   * actually rendered page. Callers receive IDs only.
   */
  async observeScoped(
    botId: string,
    runId: string,
    input: { surface: "browser-dom" | "browser-visual"; sessionId: string },
  ): Promise<{ observationId: string; expiresAt: string; textPreview: string; modality: "semantic" | "visual" | "native"; reason: string; targetIds: string[]; paneTokens: string[] }> {
    const run = this.db.getRun(runId);
    if (!run || run.botId !== botId) throw new Error("That task is not available to this teammate.");
    if (["completed", "failed", "cancelled"].includes(run.status)) throw new Error("That task has already finished.");
    const bot = this.db.getBot(botId);
    if (!bot?.browserEnabled) throw new Error("This teammate's browser access is turned off.");
    const page = await this.page(botId);
    this.assertPageAccess(botId, page);
    // Secure entry is explicit handoff state, not page-content inference: a
    // password field sitting in a normal form is enumerated-but-redacted
    // (snapshot masks values; secret entry itself goes through owner
    // takeover). Only an active owner sign-in handoff pauses model-visible
    // capture and input. Content walls still trigger handoff requests
    // through the existing sign-in paths; they do not silently expand here.
    const secureMode = this.secureHandoffActive(botId);
    const observationId = newObservationId();
    const capturedAt = Date.now();
    const expiresAtMs = capturedAt + OBSERVATION_TTL_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();
    if (secureMode) {
      // Minimized capture under a credential wall: identity + envelope only,
      // no control enumeration, no pixels for the model.
      const minimal = this.captureIdentity(page, botId);
      storeObservation({
        observationId, runId, botId, sessionId: input.sessionId,
        tabId: minimal.tabId, documentEpoch: minimal.documentEpoch, framePath: "/",
        account: "", ownerEpoch: this.ownerEpochFor(run.threadId, botId),
        viewport: minimal.viewport, deviceScale: 1, browserZoom: 100,
        scroll: { x: 0, y: 0 }, imageWidth: minimal.viewport.cssWidth, imageHeight: minimal.viewport.cssHeight,
        secureMode: true, capturedAt, expiresAt: expiresAtMs,
        targets: [], panes: [],
        page,
      });
      return { observationId, expiresAt, textPreview: "", modality: "semantic", reason: "SECURE_MODE", targetIds: [], paneTokens: [] };
    }
    const snapshot = await this.snapshot(botId);
    const { redacted } = redactSecretsForProvider(snapshot.text.slice(0, 8000));
    const identity = this.captureIdentity(page, botId);
    const live = await page.evaluate(() => ({ dpr: window.devicePixelRatio || 1, sx: window.scrollX || 0, sy: window.scrollY || 0 }));
    const deviceScale = Number.isFinite(live.dpr) && live.dpr > 0 ? live.dpr : 1;
    const scroll = {
      x: Number.isFinite(live.sx) ? live.sx : 0,
      y: Number.isFinite(live.sy) ? live.sy : 0,
    };
    // Finding D: the document epoch is a host-owned generation — tab id,
    // navigation generation and content hash — never the bare URL. Same-URL
    // reloads, replacement documents and tab swaps all invalidate it.
    const content = await this.contentGeneration(page);
    const documentEpoch = this.documentEpochFor(botId, page, content.hash);
    const rawTargets = await this.queryControls(page);
    const targets: RegistryTarget[] = rawTargets.map((control) => {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([observationId, control.framePath, control.role, control.label, control.bounds]))
        .digest("hex")
        .slice(0, 32);
      const issued = issueSemanticTarget({
        observationId,
        documentEpoch,
        framePath: control.framePath,
        role: control.role,
        label: control.label,
        bounds: control.bounds,
        selectorHint: control.selector,
      });
      return {
        targetId: issued.targetId,
        role: control.role,
        label: control.label,
        bounds: control.bounds,
        selector: control.selector,
        framePath: control.framePath,
        fingerprint,
        reviewDigest: control.reviewDigest,
      };
    });
    const panes: RegistryPane[] = (await this.queryScrollableRegions(page)).map((pane, index) => ({
      paneToken: `pane_${observationId.slice(4, 12)}_${index}`,
      framePath: pane.framePath,
      selector: pane.selector,
      label: pane.label,
    }));
    storeObservation({
      observationId, runId, botId, sessionId: input.sessionId,
      tabId: identity.tabId, documentEpoch, framePath: "/",
      account: "", ownerEpoch: this.ownerEpochFor(run.threadId, botId),
      viewport: identity.viewport, deviceScale, browserZoom: 100,
      scroll,
      imageWidth: Math.round(identity.viewport.cssWidth * deviceScale),
      imageHeight: Math.round(identity.viewport.cssHeight * deviceScale),
      secureMode: false, capturedAt, expiresAt: expiresAtMs,
      targets, panes,
      page,
    });
    const looksCanvas = /canvas|diagram|visual editor|chart/i.test(snapshot.text.slice(0, 2000));
    const route = selectModality({
      canvasPrimary: looksCanvas,
      semanticCount: Math.min(250, snapshot.text.split("\n").length),
      opaqueWidgets: looksCanvas ? 1 : 0,
      visualCapability: this.defaultVisualCapability(),
      nativeGranted: false,
    });
    return {
      observationId, expiresAt, textPreview: redacted.slice(0, 4000),
      modality: route.modality, reason: route.reason,
      targetIds: targets.map((target) => target.targetId),
      paneTokens: panes.map((pane) => pane.paneToken),
    };
  }

  /** Active owner sign-in handoff for this teammate's browser: model-visible
   * capture and model input pause until the handoff completes. Host-owned
   * approval state — never a caller assertion. Fail-closed: an unreadable
   * approval store pauses input rather than authorizing it. */
  private secureHandoffActive(botId: string): boolean {
    try {
      return this.db.listApprovals().some(
        (entry) =>
          entry.botId === botId &&
          (this.db.getApprovalAction(entry.id) as { type?: string } | null)?.type === "browser_sign_in",
      );
    } catch {
      return true;
    }
  }

  /** Host-owned owner epoch: thread identity plus the teammate's durable
   * input-revocation counter. Stop/takeover/sign-in bumps invalidate every
   * observation captured under an older epoch. */
  private ownerEpochFor(threadId: string, botId: string): string {
    return `thread:${threadId}:input${this.db.botInputEpoch(botId)}`;
  }

  private captureIdentity(page: Page, botId: string): {
    tabId: string; documentEpoch: string;
    viewport: { cssWidth: number; cssHeight: number };
  } {
    const viewport = page.viewportSize() || { width: 1280, height: 820 };
    return {
      tabId: this.tabId(botId, page),
      documentEpoch: page.url(),
      viewport: { cssWidth: viewport.width, cssHeight: viewport.height },
    };
  }

  /** Visible interactive controls of the live main frame, evaluated in-page.
   * Closure-free by necessity (see detectLoginWall): only argument-position
   * arrows and plain loops — no nested const-bound functions, which tsx
   * rewrites with a __name helper that does not exist inside the page.
   *
   * Finding C: every control also carries a host-observed canonical review
   * digest (tag, role, label, input type, autocomplete, href, form method,
   * statefulness and bounded redacted form fields, hashed in-page). The
   * executor re-runs the SAME routine for the acted-upon selector and
   * requires byte equality: a changed form value, destination or attribute
   * changes the digest and forces a new review instead of dispatch. */
  private async queryControls(page: Page, onlySelector: string | null = null): Promise<Array<{ role: string; label: string; bounds: { x: number; y: number; width: number; height: number } | null; selector: string; framePath: string; reviewDigest: string }>> {
    return page.locator("body").evaluate(async (body, selectorArg) => {
      const out: Array<{ role: string; label: string; bounds: { x: number; y: number; width: number; height: number } | null; selector: string; framePath: string; reviewDigest: string }> = [];
      let candidates: Element[] = [];
      if (selectorArg) {
        const single = body.querySelectorAll(selectorArg);
        if (single.length !== 1) return out;
        candidates = [single[0]!];
      } else {
        candidates = [...body.querySelectorAll("a,button,input,textarea,select,[role=button],[role=link],[role=checkbox],[role=radio],[role=option],[role=slider],[role=combobox],[contenteditable=true]")];
      }
      for (const node of candidates) {
        const html = node as HTMLElement;
        const rect = html.getBoundingClientRect();
        if (!selectorArg && (rect.width <= 0 || rect.height <= 0 || getComputedStyle(node).visibility === "hidden")) continue;
        let selector = html.tagName.toLowerCase();
        if (html.id) selector = `#${CSS.escape(html.id)}`;
        else if (html.getAttribute("data-testid")) selector = `[data-testid="${CSS.escape(html.getAttribute("data-testid")!)}"]`;
        else if (html.getAttribute("name")) selector = `${html.tagName.toLowerCase()}[name="${CSS.escape(html.getAttribute("name")!)}"]`;
        else if (html.getAttribute("aria-label")) selector = `${html.tagName.toLowerCase()}[aria-label="${CSS.escape(html.getAttribute("aria-label")!)}"]`;
        else {
          const parent = html.parentElement;
          const siblings = parent ? [...parent.children].filter((child) => child.tagName === html.tagName) : [];
          const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(html) + 1})` : "";
          const prefix = parent && (parent as HTMLElement).id ? `#${CSS.escape((parent as HTMLElement).id)} > ` : "";
          selector = `${prefix}${html.tagName.toLowerCase()}${suffix}`;
        }
        const label = (html.getAttribute("aria-label") || html.textContent || html.getAttribute("name") || html.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 240);
        const input = node as HTMLInputElement;
        const form = input.form || node.closest("form");
        const dialog = node.closest("dialog,[role=dialog]");
        const navigation = !form && !dialog && node.matches("button,a,[role=button],[role=link]") ? node.closest("nav,aside,[role=navigation],[role=menu]") : null;
        const scope = form || dialog || navigation || document.body;
        const stateful = node.matches("input,textarea,select,[contenteditable=true],[role=checkbox],[role=switch],[role=radio],[role=option],[role=slider],[role=spinbutton],[role=textbox],[role=combobox]") ? "1" : "0";
        const scopeControls = [...scope.querySelectorAll("input:not([type=hidden]),textarea,select,[contenteditable=true]")].filter((el) => (el as HTMLElement).getClientRects().length > 0).slice(0, 24);
        const fields: Array<{ label: string; value: string }> = [];
        for (const el of scopeControls) {
          const field = el as HTMLElement;
          const name = (field.getAttribute("aria-label") || field.getAttribute("placeholder") || field.getAttribute("name") || "field").slice(0, 200);
          const raw = field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio") ? String(field.checked) : field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement ? field.value : field.textContent || "";
          const secret = /password|passcode|one-time-code|cc-|secret|token|verification/i.test(`${field.getAttribute("type") || ""} ${field.getAttribute("autocomplete") || ""} ${name}`);
          fields.push({ label: name, value: secret ? "[Private field hidden]" : raw.slice(0, 2000) });
        }
        const canonical = JSON.stringify({
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute("role") || "",
          label,
          inputType: node instanceof HTMLInputElement || node instanceof HTMLButtonElement ? (node as HTMLInputElement).type : "",
          autocomplete: node.getAttribute("autocomplete") || "",
          href: node instanceof HTMLAnchorElement ? (node as HTMLAnchorElement).href : "",
          formMethod: form ? (form as HTMLFormElement).method.toLowerCase() : "",
          stateful,
          fields,
          url: location.href,
        });
        const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
        const digestView = new Uint8Array(digestBytes);
        let reviewDigest = "";
        for (let index = 0; index < digestView.length; index += 1) reviewDigest += digestView[index]!.toString(16).padStart(2, "0");
        out.push({
          role: node.getAttribute("role") || node.tagName.toLowerCase(),
          label,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          selector,
          framePath: "/",
          reviewDigest,
        });
        if (out.length >= 150) break;
      }
      return out;
    }, onlySelector);
  }

  /** Re-run the observation-time review routine for one selector and return
   * its canonical digest. Same routine, same bytes: equality with the
   * stored digest means the bounded target/form/destination state is
   * unchanged since review. Null when the selector no longer resolves
   * uniquely (destroyed or ambiguous — both refuse). */
  private async controlReviewDigest(page: Page, selector: string): Promise<string | null> {
    try {
      const rows = await this.queryControls(page, selector);
      return rows.length === 1 ? rows[0]!.reviewDigest : null;
    } catch {
      return null;
    }
  }

  /** Scrollable regions of the live page (main frame + owned same-origin
   * iframes), evaluated in-page under the same closure-free constraint. */
  private async queryScrollableRegions(page: Page): Promise<Array<{ selector: string; framePath: string; label: string }>> {
    const main = await page.locator("body").evaluate((body) => {
      const panes: Array<{ selector: string; framePath: string; label: string }> = [];
      const candidates = [body, ...body.querySelectorAll("div,main,section,article,aside,ul,table")];
      for (const candidate of candidates) {
        const html = candidate as HTMLElement;
        if (html.scrollHeight > html.clientHeight + 4 && html.clientHeight > 40 && getComputedStyle(html).overflowY !== "visible") {
          let selector = html.tagName.toLowerCase();
          if (html.id) selector = `#${CSS.escape(html.id)}`;
          else if (html.getAttribute("data-testid")) selector = `[data-testid="${CSS.escape(html.getAttribute("data-testid")!)}"]`;
          panes.push({ selector, framePath: "/", label: (html.getAttribute("aria-label") || html.id || html.tagName).toLowerCase().slice(0, 120) });
          if (panes.length >= 20) break;
        }
      }
      return panes;
    });
    // Owned same-origin iframes: addressable via frameSelector + selector.
    // Only frames whose DOCUMENT actually scrolls are issued as panes.
    const frames: Array<{ selector: string; framePath: string; label: string }> = [];
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      let origin = "";
      try {
        origin = new URL(frame.url()).origin;
      } catch {
        continue;
      }
      if (!origin.startsWith("http://127.0.0.1") && !origin.startsWith("http://localhost")) continue;
      const scrollable = await frame.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4).catch(() => false);
      if (!scrollable) continue;
      const frameElement = await frame.frameElement().catch(() => null);
      if (!frameElement) continue;
      const frameSelector = await frameElement.evaluate((node) => {
        const html = node as HTMLElement;
        if (html.id) return `#${CSS.escape(html.id)}`;
        const testId = html.getAttribute("data-testid");
        if (testId) return `iframe[data-testid="${CSS.escape(testId)}"]`;
        return "iframe";
      }).catch(() => null);
      if (frameSelector) frames.push({ selector: "body", framePath: frameSelector, label: `frame ${frameSelector}`.slice(0, 120) });
    }
    return [...main, ...frames].slice(0, 24);
  }

  /** Drop every registry observation for a teammate (Stop/takeover/
   * sign-in). Queued proposals must re-observe; the durable input epoch
   * (checked in assertPreInput) makes pre-revocation observations unusable
   * even if an ID is replayed. */
  revokeObservationsForBot(botId: string): number {
    return invalidateObservationsForBot(botId);
  }

  revokeObservationsForRun(runId: string): number {
    return invalidateObservationsForRun(runId);
  }

  /** Server-owned visual capability registry. Callers name an adapter; the
   * host decides what it may receive. Unknown adapters are text-only:
   * VISION_UNAVAILABLE instead of guessed coordinates. Process-local and
   * empty by default — a restart clears registrations (fail-closed).
   * Host/test setup registers entries via registerVisualAdapter. */
  private readonly visualAdapters = new Map<string, "visual-supported" | "text-only">();

  registerVisualAdapter(adapterId: string, capability: "visual-supported" | "text-only"): void {
    this.visualAdapters.set(adapterId, capability);
  }

  visualCapabilityForAdapter(adapterId: string): "visual-supported" | "text-only" {
    return this.visualAdapters.get(adapterId) ?? "text-only";
  }

  private defaultVisualCapability(): "visual-supported" | "text-only" {
    return [...this.visualAdapters.values()].includes("visual-supported") ? "visual-supported" : "text-only";
  }

  /**
   * R03 — Host-authoritative semantic action. The caller supplies only an
   * opaque targetId (issued by observeScoped from the live page), the action
   * kind, and — for typing — the final value plus its review digest. The
   * host looks the target up, re-resolves it against the CURRENT page
   * (unique role/label match in the same frame + production fingerprint
   * equality), re-checks run/bot authorization, scope, secure mode, owner
   * epoch and input ownership immediately before input, admits the exact
   * final payload to the durable journal, and dispatches through the
   * reviewed-fingerprint click/type path. Anything else is refused with
   * zero input.
   */
  async semanticAct(
    botId: string,
    runId: string,
    input: { targetId: string; sessionId: string; kind: "click" | "type"; value?: string; reviewDigest?: string | null; approvalId?: string | null; mutationKey?: string | null; __testBarrier?: { beforeCommit?: () => Promise<void> } },
  ): Promise<{ url: string; title: string }> {
    const observation = this.requireActionObservation(input.targetId, runId, botId, input.sessionId);
    const target = observation.targets.find((candidate) => candidate.targetId === input.targetId);
    if (!target) throw new Error("AMBIGUOUS_TARGET: that control is not uniquely observable right now. Observe again.");
    if (input.kind === "type" && (typeof input.value !== "string" || input.value.length > 20_000)) {
      throw new Error("A bounded typed value is required.");
    }
    // Eligibility before admission: refusals leave no journal row behind.
    this.assertActEligible(observation, runId, botId);
    // Finding C: an explicitly supplied approval must be a real,
    // host-owned, approved record for this run and teammate — a free-form
    // digest string is identity only, never authorization. When the
    // approval names a selector it must name this target's selector.
    if (input.approvalId) this.assertApprovalBinding(input.approvalId, runId, botId, target.selector);
    const payloadDigest = createHash("sha256")
      .update(JSON.stringify({ targetId: target.targetId, kind: input.kind, value: input.kind === "type" ? input.value : null, reviewDigest: input.reviewDigest ?? null, observationId: observation.observationId, mutationKey: input.mutationKey ?? null }))
      .digest("hex");
    const actionId = `sem_${target.fingerprint}_${payloadDigest.slice(0, 12)}`;
    const admittedEpoch = this.admitAction({
      actionId, runId, botId, surface: "browser-dom",
      surfaceIdentity: `tab:${observation.tabId}/doc:${observation.documentEpoch}/frame:${target.framePath}`,
      ownershipEpoch: observation.ownerEpoch, target: target.label,
      payloadDigest, reviewDigest: input.reviewDigest ?? null, account: observation.account,
      mutationKey: input.mutationKey ?? null,
    });
    // Pin the observed page (Finding D): the pinned object must still be
    // open and must still be the active tab. A tab switch, no matter the
    // URL, invalidates the observation.
    const page = observation.page;
    if (page.isClosed() || this.activePage(botId) !== page) {
      journalTransition(this.db, actionId, "failed_before_effect", "tab changed before dispatch");
      throw new Error("STALE_OBSERVATION: the tab changed after observation. Observe again.");
    }
    // Revalidate the host-owned document generation on the pinned page.
    await this.assertDocumentEpoch(botId, page, observation, actionId);
    // Re-resolve against the CURRENT document: unique live match in the
    // same frame. Same-named controls stay distinguishable (AMBIGUOUS →
    // zero input); a vanished control is TARGET_DESTROYED.
    const liveCandidates = (await this.queryControls(page)).filter(
      (candidate) => candidate.framePath === target.framePath && candidate.role === target.role && candidate.label === target.label,
    );
    if (liveCandidates.length === 0) {
      journalTransition(this.db, actionId, "failed_before_effect", "target destroyed before dispatch");
      throw new Error("TARGET_DESTROYED: the control is gone. Observe again.");
    }
    if (liveCandidates.length > 1 || !liveCandidates.some((candidate) => candidate.selector === target.selector)) {
      journalTransition(this.db, actionId, "failed_before_effect", "ambiguous target at dispatch");
      throw new Error("AMBIGUOUS_TARGET: that control is not uniquely observable right now. Observe again.");
    }
    // Finding C: re-run the observation-time review routine and require
    // byte equality with the stored digest. A changed form value,
    // destination or attribute forces a new review — the fresh state is
    // never substituted as the approved baseline.
    const liveDigest = await this.controlReviewDigest(page, target.selector);
    if (liveDigest === null || liveDigest !== target.reviewDigest) {
      journalTransition(this.db, actionId, "failed_before_effect", "reviewed state changed before dispatch");
      throw new Error("STALE_OBSERVATION: the form or control changed after review. Request a new review.");
    }
    const fresh = await this.describeTarget(botId, target.selector);
    this.assertPreInput(observation, runId, botId, admittedEpoch);
    journalTransition(this.db, actionId, "dispatch_started");
    try {
      // Production reviewed-fingerprint path: the live fingerprint was just
      // proven equal to reviewed state, and click/type re-verify it at
      // dispatch with cancellable readiness below.
      const result = input.kind === "click"
        ? await this.cancellableClick(botId, page, target.selector, fresh.fingerprint, runId, admittedEpoch, input.__testBarrier?.beforeCommit)
        : await this.cancellableType(botId, page, target.selector, input.value ?? "", fresh.fingerprint, runId, admittedEpoch, input.__testBarrier?.beforeCommit);
      journalTransition(this.db, actionId, "effect_observed");
      return result;
    } catch (error) {
      // Failures that prove nothing was sent (never-ready control, wait-
      // phase revocation, pre-commit refusal) stay retryable. Anything at
      // or after the dispatch boundary is uncertain and reconciles through
      // readback — never reported as ordinary success or silent absence.
      // Post-commit ownership notes embed the revocation text, so they are
      // classified first: the effect may already have occurred.
      const message = error instanceof Error ? error.message : String(error);
      const crossedBoundary = /Ownership changed during input/i.test(message);
      const nothingSent =
        !crossedBoundary &&
        /never became ready|not enabled right now|not editable|no screen position|That task stopped while|Nothing was sent|USER_TAKEOVER|SECURE_MODE|That task is no longer runnable|browser access is turned off/i.test(message);
      journalTransition(this.db, actionId, nothingSent ? "failed_before_effect" : "outcome_uncertain", message);
      throw error;
    }
  }

  /** Validate an explicitly supplied approval against host records. */
  private assertApprovalBinding(approvalId: string, runId: string, botId: string, selector: string | null): void {
    const approval = this.db.getApproval(approvalId);
    if (!approval || approval.status !== "approved" || approval.runId !== runId || approval.botId !== botId) {
      throw new Error("That approval is not a completed host review for this task and teammate.");
    }
    const action = this.db.getApprovalAction(approvalId) as { args?: { selector?: unknown } } | null;
    const approvedSelector = action?.args && typeof action.args.selector === "string" ? action.args.selector : null;
    if (approvedSelector && selector && approvedSelector !== selector) {
      throw new Error("That approval names a different control. Request a new review.");
    }
  }

  /** Eligibility checked BEFORE journal admission so refused work leaves
   * no admitted row behind: secure entry, runnable task, enabled teammate.
   * Epoch/ownership freshness is re-checked in assertPreInput right before
   * input, after every await. */
  private assertActEligible(observation: CapturedObservation, runId: string, botId: string): void {
    if (observation.secureMode) {
      throw new Error("SECURE_MODE: owner sign-in is showing. Model-visible input is paused until handoff completes.");
    }
    const run = this.db.getRun(runId);
    if (!run || run.botId !== botId || ["completed", "failed", "cancelled"].includes(run.status)) {
      throw new Error("That task is not runnable. Observe again under the current task.");
    }
    if (!this.db.getBot(botId)?.browserEnabled) throw new Error("This teammate's browser access is turned off.");
  }

  /** Shared pre-input gate, checked immediately before every new-path
   * dispatch — after all awaits, not just after observation. Denial, Stop,
   * takeover, secure entry and uncertainty prevent dispatch. */
  private assertPreInput(
    observation: CapturedObservation,
    runId: string,
    botId: string,
    admittedEpoch: number,
  ): void {
    if (observation.secureMode || this.secureHandoffActive(botId)) {
      throw new Error("SECURE_MODE: owner sign-in is showing. Model-visible input is paused until handoff completes.");
    }
    const run = this.db.getRun(runId);
    if (!run || run.botId !== botId || ["completed", "failed", "cancelled"].includes(run.status)) {
      throw new Error("That task is no longer runnable. Observe again under the current task.");
    }
    const bot = this.db.getBot(botId);
    if (!bot?.browserEnabled) throw new Error("This teammate's browser access is turned off.");
    if (this.db.botInputEpoch(botId) !== admittedEpoch) {
      throw new Error("USER_TAKEOVER: control changed hands after this action was admitted. Observe again.");
    }
    const current = getObservation(observation.observationId);
    if (!current || current.ownerEpoch !== this.ownerEpochFor(run.threadId, botId)) {
      throw new Error("STALE_OBSERVATION: ownership changed after observation. Observe again.");
    }
  }

  /** Revalidate the host-owned document generation on the pinned page.
   * Same-URL reloads, replacement documents and navigations all change the
   * generation even though the URL is unchanged. */
  private async assertDocumentEpoch(botId: string, page: Page, observation: CapturedObservation, actionId: string): Promise<void> {
    const content = await this.contentGeneration(page);
    const epoch = this.documentEpochFor(botId, page, content.hash);
    if (epoch !== observation.documentEpoch) {
      journalTransition(this.db, actionId, "failed_before_effect", "document changed before dispatch");
      throw new Error("STALE_OBSERVATION: the document changed after observation. Observe again.");
    }
  }

  /** Admit the exact final payload to the durable journal. Returns the
   * input-ownership epoch bound to the admission for pre-input re-check. */
  private admitAction(input: {
    actionId: string; runId: string; botId: string; surface: "browser-dom" | "browser-visual" | "native";
    surfaceIdentity: string; ownershipEpoch: string; target: string;
    payloadDigest: string; reviewDigest: string | null; account: string;
    mutationKey?: string | null;
  }): number {
    journalPropose(this.db, { ...input });
    if (input.mutationKey) this.assertMutationFence(input.mutationKey, input.runId, input.botId, input.actionId);
    if (!admitOnce(this.db, input.actionId)) {
      throw new Error("This action was already admitted. Check its result instead of sending it again.");
    }
    return this.db.botInputEpoch(input.botId);
  }

  /** Finding A: refuse when the same logical mutation is already unresolved
   * (or already completed) under any observation, renderer or attempt. The
   * mutation key is assigned by the accountable outer layer per unit of
   * intended effect; distinct genuinely-new work uses distinct keys, so the
   * fence never bans unrelated actions. */
  private assertMutationFence(mutationKey: string, runId: string, botId: string, actionId: string): void {
    const clashes = this.db.journalActionFindByMutation(mutationKey, runId, botId).filter((row) => row.actionId !== actionId);
    const unresolved = clashes.filter((row) => row.stage !== "verified" && row.stage !== "failed_before_effect");
    if (unresolved.length > 0) {
      journalTransition(this.db, actionId, "failed_before_effect", "same unresolved mutation exists");
      throw new Error("UNCERTAIN_CONFLICT: the same effect is already unresolved. Reconcile it before sending it again.");
    }
    if (clashes.some((row) => row.stage === "verified")) {
      journalTransition(this.db, actionId, "failed_before_effect", "same mutation already completed");
      throw new Error("DUPLICATE_MUTATION: this effect already completed. Check its result instead of sending it again.");
    }
  }

  /** Resolve an opaque target to its host-captured observation, enforcing
   * run/bot/session binding and observation freshness. Never mints targets
   * from caller labels. */
  private requireActionObservation(targetId: string, runId: string, botId: string, sessionId: string): CapturedObservation {
    const observation = findObservationWithTarget(targetId);
    if (!observation) throw new Error("STALE_OBSERVATION: unknown or expired observation. Observe again.");
    if (observation.runId !== runId || observation.botId !== botId || observation.sessionId !== sessionId) {
      throw new Error("That observation belongs to a different task or teammate.");
    }
    return observation;
  }

  /**
   * R03 — Registry-bound visual action. The caller supplies an observation
   * ID, an adapter ID, and image-relative coordinates. The transform comes
   * from the host-captured observation — never caller geometry. Capability
   * is derived from the server-owned adapter registry. Freshness (TTL, tab,
   * document, account, owner epoch), live geometry (viewport, DPR product,
   * scroll), secure mode, run authorization and input ownership are all
   * checked immediately before input; assertPageAccess runs before AND
   * after. Held buttons/modifiers release on every exit path.
   */
  async visualAct(
    botId: string,
    runId: string,
    input: {
      observationId: string;
      sessionId: string;
      adapterId: string;
      action: "click" | "double-click" | "drag" | "scroll" | "key";
      point: { x: number; y: number };
      endPoint?: { x: number; y: number };
      key?: string;
      approvalId?: string | null;
      mutationKey?: string | null;
    },
  ): Promise<{ url: string; title: string; cssX: number; cssY: number }> {
    const capability = this.visualCapabilityForAdapter(input.adapterId);
    const observation = getObservation(input.observationId);
    if (!observation || observation.runId !== runId || observation.botId !== botId || observation.sessionId !== input.sessionId) {
      throw new Error("STALE_OBSERVATION: unknown, expired, or foreign observation. Observe again.");
    }
    if (capability !== "visual-supported") {
      throw new Error("VISION_UNAVAILABLE: this adapter cannot ground visual targets. Hand back the task instead of guessing coordinates.");
    }
    // Eligibility before admission: refusals leave no journal row behind.
    this.assertActEligible(observation, runId, botId);
    if (input.approvalId) this.assertApprovalBinding(input.approvalId, runId, botId, null);
    // Pin the observed page (Finding D): it must still be open and active.
    const page = observation.page;
    if (page.isClosed() || this.activePage(botId) !== page) {
      throw new Error("STALE_OBSERVATION: the tab changed after observation. Observe again before acting.");
    }
    this.assertPageAccess(botId, page);
    // Finding D: revalidate the host-owned document generation on the
    // pinned page. Same-URL replacement, reloads and navigations refuse.
    const content = await this.contentGeneration(page);
    if (this.documentEpochFor(botId, page, content.hash) !== observation.documentEpoch) {
      throw new Error("STALE_OBSERVATION: the document changed after observation. Observe again before acting.");
    }
    const live = await page.evaluate(() => ({
      dpr: window.devicePixelRatio || 1,
      w: window.innerWidth || 0,
      h: window.innerHeight || 0,
      sx: window.scrollX || 0,
      sy: window.scrollY || 0,
    }));
    const transform = {
      observationId: observation.observationId,
      capturedX: 0,
      capturedY: 0,
      capturedWidth: observation.viewport.cssWidth,
      capturedHeight: observation.viewport.cssHeight,
      cropX: 0,
      cropY: 0,
      cropWidth: observation.imageWidth,
      cropHeight: observation.imageHeight,
      imageWidth: observation.imageWidth,
      imageHeight: observation.imageHeight,
      deviceScale: observation.deviceScale,
      browserZoom: observation.browserZoom,
    };
    const validated = validateVisualAction(
      {
        observationId: observation.observationId,
        transform,
        action: input.action,
        point: input.point,
        endPoint: input.endPoint,
        key: input.key,
        currentGeometry: {
          cssWidth: live.w,
          cssHeight: live.h,
          deviceScale: live.dpr,
          browserZoom: observation.browserZoom,
          scrollX: live.sx,
          scrollY: live.sy,
        },
        capturedScroll: observation.scroll,
      },
      capability,
    );
    // Browser zoom folds into devicePixelRatio: the live product must match.
    if (validated.ok && Math.abs(live.dpr - (observation.deviceScale * observation.browserZoom) / 100) > 0.01) {
      throw new Error("STALE_OBSERVATION: zoom/scale drift since observation. Observe again before acting.");
    }
    if (validated.ok && (Math.abs(live.w - observation.viewport.cssWidth) > 2 || Math.abs(live.h - observation.viewport.cssHeight) > 2)) {
      throw new Error("STALE_OBSERVATION: the window changed after observation. Observe again before acting.");
    }
    if (!validated.ok) {
      if (validated.reason === "VISION_UNAVAILABLE") throw new Error("VISION_UNAVAILABLE: this adapter cannot ground visual targets. Hand back the task instead of guessing coordinates.");
      throw new Error(`${validated.reason}: the screenshot changed after observation. Observe again before acting.`);
    }
    const payloadDigest = createHash("sha256")
      .update(JSON.stringify({ observationId: observation.observationId, action: input.action, point: input.point, endPoint: input.endPoint ?? null, key: input.key ?? null, adapterId: input.adapterId, mutationKey: input.mutationKey ?? null }))
      .digest("hex");
    const actionId = `vis_${observation.observationId}_${Math.round(validated.cssX)}_${Math.round(validated.cssY)}_${payloadDigest.slice(0, 8)}`;
    const admittedEpoch = this.admitAction({
      actionId, runId, botId, surface: "browser-visual",
      surfaceIdentity: `tab:${observation.tabId}/doc:${observation.documentEpoch}/obs:${observation.observationId}`,
      ownershipEpoch: observation.ownerEpoch, target: `${Math.round(validated.cssX)},${Math.round(validated.cssY)}`,
      payloadDigest, reviewDigest: null, account: observation.account,
      mutationKey: input.mutationKey ?? null,
    });
    this.assertPreInput(observation, runId, botId, admittedEpoch);
    this.assertPageAccess(botId, page);
    if (!acquireDesktopLease(runId, botId, "browser-visual", actionId)) {
      journalTransition(this.db, actionId, "failed_before_effect", "input lease held by another task");
      throw new Error("Another task holds the input lease. Wait for it to finish.");
    }
    journalTransition(this.db, actionId, "dispatch_started");
    // Finding B: revocation is re-checked between every input phase, and
    // held buttons release on every exit. A cancelled action stops between
    // phases instead of completing a stale gesture.
    const checkPhase = (phase: string) => {
      try {
        this.assertNotRevoked(botId, runId, admittedEpoch);
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)} (before ${phase})`);
      }
    };
    try {
      if (input.action === "click") {
        checkPhase("click");
        await page.mouse.click(validated.cssX, validated.cssY);
      } else if (input.action === "double-click") {
        checkPhase("double-click");
        await page.mouse.dblclick(validated.cssX, validated.cssY);
      } else if (input.action === "drag" && input.endPoint) {
        const end = validateVisualAction(
          {
            observationId: observation.observationId, transform, action: "drag",
            point: input.endPoint, currentGeometry: { cssWidth: live.w, cssHeight: live.h, deviceScale: live.dpr, browserZoom: observation.browserZoom, scrollX: live.sx, scrollY: live.sy },
            capturedScroll: observation.scroll,
          },
          capability,
        );
        if (!end.ok) throw new Error(`${end.reason}: drag end point invalid. Observe again.`);
        checkPhase("drag-press");
        await page.mouse.move(validated.cssX, validated.cssY);
        await page.mouse.down();
        try {
          checkPhase("drag-move");
          await page.mouse.move(end.cssX, end.cssY, { steps: 12 });
        } finally {
          await page.mouse.up().catch(() => undefined);
        }
      } else if (input.action === "scroll") {
        checkPhase("scroll");
        await page.mouse.move(validated.cssX, validated.cssY);
        await page.mouse.wheel(0, 400);
      } else if (input.action === "key" && input.key) {
        checkPhase("focus-click");
        await page.mouse.click(validated.cssX, validated.cssY);
        checkPhase("key-press");
        await page.keyboard.press(input.key);
      } else {
        throw new Error("That visual action is not supported with these arguments.");
      }
      await page.waitForTimeout(180);
      this.assertPageAccess(botId, page);
      journalTransition(this.db, actionId, "effect_observed");
      releaseDesktopLease(runId);
      return { url: page.url(), title: await page.title(), cssX: validated.cssX, cssY: validated.cssY };
    } catch (error) {
      await page.mouse.up().catch(() => undefined);
      releaseDesktopLease(runId);
      journalTransition(this.db, actionId, "outcome_uncertain", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * R03/R06 — Region scroll against the actually authorized region. The
   * pane token is opaque (issued by observeScoped from the live page); the
   * host resolves it to a frame + selector, scrolls THAT element, and reads
   * back its scroll position. The requested region is never discarded.
   */
  async scrollPane(
    botId: string,
    runId: string,
    input: { observationId: string; sessionId: string; paneToken: string; deltaY: number; approvalId?: string | null; mutationKey?: string | null },
  ): Promise<{ url: string; title: string; moved: number; beforeTop: number; afterTop: number }> {
    const observation = getObservation(input.observationId);
    if (!observation || observation.runId !== runId || observation.botId !== botId || observation.sessionId !== input.sessionId) {
      throw new Error("STALE_OBSERVATION: unknown, expired, or foreign observation. Observe again.");
    }
    const pane = observation.panes.find((candidate) => candidate.paneToken === input.paneToken);
    if (!pane) throw new Error("That scroll region was not observed. Observe again.");
    // Eligibility before admission: refusals leave no journal row behind.
    this.assertActEligible(observation, runId, botId);
    if (input.approvalId) this.assertApprovalBinding(input.approvalId, runId, botId, pane.selector);
    const bounded = Math.max(-3000, Math.min(3000, Math.round(input.deltaY)));
    if (!Number.isFinite(bounded) || bounded === 0) throw new Error("A non-zero bounded scroll amount is required.");
    const payloadDigest = createHash("sha256")
      .update(JSON.stringify({ observationId: observation.observationId, paneToken: pane.paneToken, deltaY: bounded, mutationKey: input.mutationKey ?? null }))
      .digest("hex");
    const actionId = `scr_${observation.observationId}_${pane.paneToken}_${payloadDigest.slice(0, 8)}`;
    const admittedEpoch = this.admitAction({
      actionId, runId, botId, surface: "browser-dom",
      surfaceIdentity: `tab:${observation.tabId}/doc:${observation.documentEpoch}/frame:${pane.framePath}`,
      ownershipEpoch: observation.ownerEpoch, target: `scroll ${pane.label}`,
      payloadDigest, reviewDigest: null, account: observation.account,
      mutationKey: input.mutationKey ?? null,
    });
    // Pin the observed page and revalidate its document generation: a
    // replacement document at the same URL refuses instead of scrolling
    // the new content.
    const page = observation.page;
    if (page.isClosed() || this.activePage(botId) !== page) {
      journalTransition(this.db, actionId, "failed_before_effect", "tab changed before dispatch");
      throw new Error("STALE_OBSERVATION: the tab changed after observation. Observe again.");
    }
    await this.assertDocumentEpoch(botId, page, observation, actionId);
    this.assertPreInput(observation, runId, botId, admittedEpoch);
    this.assertPageAccess(botId, page);
    journalTransition(this.db, actionId, "dispatch_started");
    try {
      // Unique resolution: an ambiguous or vanished pane refuses instead
      // of scrolling an arbitrary first match.
      const frameScope = pane.framePath === "/" ? page : page.frameLocator(pane.framePath);
      const scroller = frameScope.locator(pane.selector === "body" ? "html" : pane.selector);
      if ((await scroller.count()) !== 1) {
        throw new Error("That scroll region is no longer unique. Observe again.");
      }
      const readTop = async (): Promise<number> => scroller.first().evaluate((node) => {
        const html = node as HTMLElement;
        if (html.tagName === "HTML") return document.documentElement.scrollTop;
        return html.scrollTop;
      });
      const beforeTop = await readTop();
      this.assertNotRevoked(botId, runId, admittedEpoch);
      await scroller.first().evaluate((node, dy) => {
        const html = node as HTMLElement;
        if (html.tagName === "HTML") document.documentElement.scrollBy(0, dy);
        else html.scrollBy(0, dy);
      }, bounded);
      await page.waitForTimeout(140);
      const afterTop = await readTop();
      this.assertPageAccess(botId, page);
      journalTransition(this.db, actionId, "effect_observed");
      return { url: page.url(), title: await page.title(), moved: afterTop - beforeTop, beforeTop, afterTop };
    } catch (error) {
      journalTransition(this.db, actionId, "outcome_uncertain", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async status(botId: string, computer: ComputerManager): Promise<ComputerStatus> {
    const context = this.contexts.get(botId);
    const page = this.activePage(botId);
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
    let attaching = false;
    let lastStatus = "";

    const publishStatus = (event: Extract<LiveViewEvent, { type: "status" }>) => {
      const key = JSON.stringify(event);
      if (key !== lastStatus) { lastStatus = key; emit(event); }
    };

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
      const currentSession = session, currentPage = tracked;
      void describe().then(({ title, currentUrl }) => {
        if (!stopped && session === currentSession && tracked === currentPage) publishStatus({ type: "status", browser: session ? "ready" : "stopped", title, currentUrl });
      });
    };

    const attach = async () => {
      if (stopped || attaching) return;
      if (!this.db.getBot(botId)?.browserEnabled || !this.isAvailable()) {
        detach(); emitStatus(); return;
      }
      const context = this.contexts.get(botId);
      if (!context) {
        detach(); emitStatus();
        return;
      }
      if (session && tracked && !tracked.isClosed()) {
        // Follow tab switches: reattach when the active tab moved on.
        const candidates = context.pages().filter((candidate) => !candidate.isClosed());
        const active = this.activePages.get(botId);
        const current = active && candidates.includes(active) ? active : candidates[0];
        if (tracked === current) { emitStatus(); return; }
      }
      const open = context.pages().filter((candidate) => !candidate.isClosed());
      const active = this.activePages.get(botId);
      const page = (active && open.includes(active) ? active : open[0]) || null;
      if (!page) { detach(); emitStatus(); return; }
      if (session && tracked === page) return;
      attaching = true;
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
          if (!stopped && session === cdp && tracked === page && this.db.getBot(botId)?.browserEnabled && typeof data === "string" && data.length > 0) emit({ type: "frame", jpeg: data });
        });
        session = cdp;
        tracked = page;
        page.once("close", () => {
          if (tracked === page) {
            detach();
            emitStatus();
          }
        });
        const details = await describe();
        if (stopped || session !== cdp || page.isClosed()) return;
        // Readiness precedes the first frame, even when CDP emits that frame
        // before startScreencast resolves. Late viewers replay both in order.
        publishStatus({ type: "status", browser: "ready", ...details });
        await cdp.send("Page.startScreencast", { format: "jpeg", quality: 58, maxWidth: 1280, maxHeight: 820, everyNthFrame: 1 });
      } catch {
        detach();
        if (!stopped) publishStatus({ type: "status", browser: "unavailable" });
      } finally { attaching = false; }
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
