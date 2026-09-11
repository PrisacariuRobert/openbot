import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Dialog, type Page } from "playwright-core";
import { chromePath } from "./runtime.js";

/** Dedicated tester browser sessions for independent evaluation.
 *
 * Each session is its own incognito browser context pointed at the OpenBot
 * app itself. Sessions belong to no teammate, start no tasks, and cannot
 * leave the studio: only loopback http(s) URLs are reachable, enforced
 * before anything loads. The evaluator drives the real UI while teammates
 * work undisturbed in their own profiles.
 *
 * Honesty rules built in: locator actions keep Playwright's actionability
 * checks (no forced clicks through overlays, no hidden-element clicks);
 * timeouts report the current state instead of claiming success; dialogs
 * are never auto-accepted; every action is journaled with an id. */

export interface TesterAct {
  kind: "click" | "dblclick" | "rightclick" | "hover" | "fill" | "type" | "press" | "check" | "uncheck" | "select" | "focus" | "clear" | "scroll" | "drag" | "reload" | "back" | "forward" | "goto";
  selector?: string;
  ref?: string;
  text?: string;
  key?: string;
  option?: string;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  deltaX?: number;
  deltaY?: number;
  actionId?: string;
}

export interface TesterWait {
  kind: "text" | "selector" | "enabled" | "hidden" | "url" | "dialog" | "download";
  value?: string;
  timeoutMs?: number;
}

export interface TesterEvent {
  seq: number;
  at: string;
  type: string;
  detail: string;
  actionId?: string;
}

interface QueuedDialog {
  id: string;
  type: string;
  message: string;
  defaultValue: string;
  handle: Dialog;
}

interface StoredDownload {
  id: string;
  filename: string;
  url: string;
  bytes: number | null;
  sha256: string | null;
  status: "pending" | "done" | "failed";
  at: string;
}

interface TesterPage {
  page: Page;
  index: number;
  openerIndex: number | null;
}

interface TesterSession {
  id: string;
  label: string;
  context: BrowserContext;
  pages: TesterPage[];
  activePage: number;
  viewport: { width: number; height: number };
  mobile: boolean;
  createdAt: string;
  seq: number;
  events: TesterEvent[];
  droppedEvents: number;
  dialogs: QueuedDialog[];
  downloads: StoredDownload[];
}

const MAX_EVENTS_PER_SESSION = 500;
const MAX_DOWNLOADS_KEPT = 20;

export function testerUrlAllowed(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** Compact a CDP accessibility tree to one line per useful element — small
 * enough to read, structured enough to act on. Supports scoping to a
 * subtree (by backend node ref), depth limits, and interactive-only
 * filtering so long conversations and settings pages stay retrievable. */
export function compactAxTree(tree: unknown, opts?: { ref?: number; maxDepth?: number; interactiveOnly?: boolean }): string[] {
  interface AxNode { nodeId?: string; backendDOMNodeId?: number; childIds?: string[]; role?: { value?: string }; name?: { value?: string }; value?: { value?: string | number }; disabled?: boolean }
  const nodes = (tree as { nodes?: AxNode[] } | null)?.nodes;
  if (!Array.isArray(nodes)) return [];
  const byId = new Map(nodes.filter((node) => typeof node.nodeId === "string").map((node) => [node.nodeId as string, node]));
  const maxDepth = Math.max(1, Math.min(12, opts?.maxDepth || 12));
  const interactiveOnly = opts?.interactiveOnly !== false;
  const keep = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "listbox", "option", "menuitem", "DisclosureTriangle", "tab", "switch", "slider", "spinbutton", "heading", "img", "StaticText"]);
  const lines: string[] = [];
  const emit = (node: AxNode, depth: number): void => {
    const role = node.role?.value || "";
    const name = (node.name?.value || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!keep.has(role)) return;
    if (interactiveOnly && (role === "StaticText" || role === "img") && !name) return;
    if (!interactiveOnly && !name && role !== "heading") return;
    const value = node.value?.value;
    const ref = typeof node.backendDOMNodeId === "number" ? ` [ref:${node.backendDOMNodeId}]` : "";
    const state = node.disabled ? " [disabled]" : "";
    lines.push(`${"  ".repeat(Math.min(depth, 6))}- ${role}${name ? `: ${name}` : ""}${typeof value === "string" && value ? ` (value: ${value.slice(0, 80)})` : ""}${state}${ref}`);
  };
  const visited = new Set<AxNode>();
  const visit = (node: AxNode, depth: number, seen: Set<string>): void => {
    visited.add(node);
    if (depth > maxDepth || lines.length >= 200) return;
    const id = node.nodeId || "";
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    emit(node, depth);
    for (const childId of node.childIds || []) {
      const child = byId.get(childId);
      if (child) visit(child, depth + 1, seen);
    }
  };
  if (opts?.ref !== undefined) {
    const root = nodes.find((node) => node.backendDOMNodeId === opts.ref);
    if (!root) return [];
    visit(root, 0, new Set());
    return lines;
  }
  const root = nodes.find((node) => node.role?.value === "RootWebArea") || nodes[0];
  const seen = new Set<string>();
  if (root) visit(root, 0, seen);
  // Fallback: flat scan for nodes unreachable through childIds (some trees
  // arrive without linkage). Already-visited nodes are skipped by identity.
  for (const node of nodes) {
    if (lines.length >= 200) break;
    if (visited.has(node)) continue;
    emit({ ...node, childIds: [] }, 0);
    if (lines.length >= 120) break;
  }
  return lines;
}

function classifyPlaywrightError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/strict mode violation|resolved to \d+ elements/i.test(message)) return "AMBIGUOUS_ELEMENT";
  // Disabled is checked before visible: a disabled control's timeout log
  // mentions both, and the actionable fact is the disabled state.
  if (/disabled|not enabled|not editable|is disabled/i.test(message)) return "ELEMENT_DISABLED";
  if (/Timeout \d+ms exceeded/i.test(message)) {
    if (/waiting for.*visible|element is not visible/i.test(message)) return "ELEMENT_OBSCURED";
    if (/waiting for/i.test(message)) return "ELEMENT_NOT_FOUND";
    return "TIMEOUT";
  }
  if (/not visible|hidden/i.test(message)) return "ELEMENT_OBSCURED";
  if (/has been closed|Target closed|page closed/i.test(message)) return "PAGE_CLOSED";
  if (/net::|ERR_/i.test(message)) return "TIMEOUT";
  return "UNKNOWN";
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|password|auth|code|signature/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString().slice(0, 500);
  } catch {
    return rawUrl.slice(0, 500);
  }
}

export class TesterBrowser {
  private browser: Browser | null = null;
  private sessions = new Map<string, TesterSession>();

  constructor(
    private readonly dataRoot: string,
    private readonly defaultUrl: string,
  ) {}

  private get storageRoot(): string {
    const root = path.join(this.dataRoot, "tester");
    mkdirSync(root, { recursive: true });
    return root;
  }

  private log(session: TesterSession, type: string, detail: string, actionId?: string): void {
    session.seq += 1;
    session.events.push({ seq: session.seq, at: new Date().toISOString(), type, detail: detail.slice(0, 1_000), ...(actionId ? { actionId } : {}) });
    if (session.events.length > MAX_EVENTS_PER_SESSION) {
      session.events.splice(0, session.events.length - MAX_EVENTS_PER_SESSION);
      session.droppedEvents += 1;
    }
  }

  private async launch(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.browser) await this.browser.close().catch(() => {});
    const profile = path.join(this.storageRoot, "browser");
    mkdirSync(profile, { recursive: true });
    const executablePath = chromePath();
    this.browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: true,
      args: ["--disable-background-networking", "--disable-sync", "--no-default-browser-check"],
    });
    return this.browser;
  }

  private getSession(sessionId?: string): TesterSession {
    const session = this.sessions.get(sessionId || "default");
    if (!session) throw Object.assign(new Error(`Unknown tester session “${sessionId || "default"}”. Create one with tester_session first.`), { code: "WRONG_SESSION" });
    return session;
  }

  private activePage(session: TesterSession): Page {
    const entry = session.pages.find((page) => page.index === session.activePage) || session.pages[0];
    if (!entry || entry.page.isClosed()) throw Object.assign(new Error("The tester page is closed. Open the app again."), { code: "PAGE_CLOSED" });
    return entry.page;
  }

  private watchPage(session: TesterSession, page: Page, openerIndex: number | null): void {
    const index = session.pages.length ? Math.max(...session.pages.map((entry) => entry.index)) + 1 : 0;
    session.pages.push({ page, index, openerIndex });
    page.on("popup", (child) => {
      this.watchPage(session, child, index);
      this.log(session, "popup", `opened page ${session.pages[session.pages.length - 1]!.index} from page ${index}: ${sanitizeUrl(child.url())}`);
    });
    page.on("dialog", (dialog) => {
      const queued: QueuedDialog = {
        id: randomUUID(), type: dialog.type(), message: dialog.message().slice(0, 500), defaultValue: dialog.defaultValue().slice(0, 200),
        handle: dialog,
      };
      session.dialogs.push(queued);
      // Never auto-accept: the dialog stays pending until tester_dialog resolves it.
      this.log(session, "dialog-opened", `${queued.type}: ${queued.message} (id ${queued.id})`);
    });
    page.on("download", (download) => {
      void (async () => {
        const id = randomUUID();
        const record: StoredDownload = {
          id, filename: download.suggestedFilename().slice(0, 160), url: sanitizeUrl(download.url()),
          bytes: null, sha256: null, status: "pending", at: new Date().toISOString(),
        };
        const dir = path.join(this.storageRoot, "downloads");
        mkdirSync(dir, { recursive: true });
        session.downloads.push(record);
        this.pruneDownloads(dir);
        try {
          const target = path.join(dir, `${id}-${record.filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "download"}`);
          await download.saveAs(target);
          const bytes = readFileSync(target);
          record.bytes = bytes.length;
          record.sha256 = createHash("sha256").update(bytes).digest("hex");
          record.status = "done";
        } catch {
          record.status = "failed";
        }
        this.log(session, "download", `${record.filename}: ${record.status}${record.bytes !== null ? `, ${record.bytes} bytes, sha256 ${record.sha256}` : ""}`);
      })();
    });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        this.log(session, message.type() === "error" ? "console-error" : "console-warning", message.text().slice(0, 500));
      }
    });
    page.on("pageerror", (error) => this.log(session, "page-error", String(error).slice(0, 500)));
    page.on("requestfailed", (request) => this.log(session, "request-failed", `${request.method()} ${sanitizeUrl(request.url())} ${request.failure()?.errorText || ""}`.slice(0, 500)));
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) this.log(session, "navigation", sanitizeUrl(frame.url()));
    });
  }

  private pruneDownloads(dir: string): void {
    try {
      const files = readdirSync(dir).map((name) => ({ name, at: statSync(path.join(dir, name)).mtimeMs })).sort((a, b) => b.at - a.at);
      for (const extra of files.slice(MAX_DOWNLOADS_KEPT)) rmSync(path.join(dir, extra.name), { force: true });
    } catch { /* best effort */ }
  }

  downloads(sessionId?: string): StoredDownload[] {
    return (this.sessions.get(sessionId || "default")?.downloads || []).slice(-20);
  }

  downloadPath(id: string): { path: string; filename: string } | null {
    const dir = path.join(this.storageRoot, "downloads");
    try {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(`${id}-`)) return { path: path.join(dir, name), filename: name.slice(id.length + 1) || "download" };
      }
    } catch { /* none yet */ }
    return null;
  }

  async createSession(input: { id?: string; label?: string; width?: number; height?: number; mobile?: boolean }): Promise<{ sessionId: string; label: string; viewport: { width: number; height: number }; mobile: boolean }> {
    const width = Math.max(320, Math.min(1920, Math.floor(input.width || 1440)));
    const height = Math.max(400, Math.min(1600, Math.floor(input.height || 900)));
    const mobile = input.mobile === true;
    const browser = await this.launch();
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      ...(mobile ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" } : {}),
    });
    const id = input.id || `tester-${randomUUID().slice(0, 8)}`;
    const previous = this.sessions.get(id);
    if (previous) await this.closeSession(id).catch(() => {});
    const session: TesterSession = {
      id, label: (input.label || "tester").slice(0, 60), context: context as unknown as TesterSession["context"],
      pages: [], activePage: 0, viewport: { width, height }, mobile,
      createdAt: new Date().toISOString(), seq: 0, events: [], droppedEvents: 0, dialogs: [], downloads: [],
    };
    this.sessions.set(id, session);
    const page = await context.newPage();
    this.watchPage(session, page, null);
    this.log(session, "session-created", `viewport ${width}x${height}${mobile ? ", touch emulated (labelled, not a real device)" : ""}`);
    return { sessionId: id, label: session.label, viewport: session.viewport, mobile };
  }

  listSessions(): Array<{ sessionId: string; label: string; url: string | null; title: string | null; viewport: { width: number; height: number }; mobile: boolean; pages: number; createdAt: string }> {
    return [...this.sessions.values()].map((session) => {
      const page = session.pages.find((entry) => entry.index === session.activePage)?.page;
      return {
        sessionId: session.id, label: session.label,
        url: page && !page.isClosed() ? sanitizeUrl(page.url()) : null,
        title: null, viewport: session.viewport, mobile: session.mobile,
        pages: session.pages.filter((entry) => !entry.page.isClosed()).length, createdAt: session.createdAt,
      };
    });
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    await session.context.close().catch(() => {});
    return true;
  }

  async resizeSession(sessionId: string, width: number, height: number): Promise<{ width: number; height: number }> {
    const session = this.getSession(sessionId);
    const next = { width: Math.max(320, Math.min(1920, Math.floor(width))), height: Math.max(400, Math.min(1600, Math.floor(height))) };
    // Live resize keeps every page and its state — no context recreation.
    for (const entry of session.pages) {
      if (!entry.page.isClosed()) await entry.page.setViewportSize(next).catch(() => {});
    }
    session.viewport = next;
    this.log(session, "viewport", `resized to ${next.width}x${next.height}, state preserved`);
    return next;
  }

  async activatePage(sessionId: string | undefined, index: number): Promise<{ url: string }> {
    const session = this.getSession(sessionId);
    const entry = session.pages.find((page) => page.index === index && !page.page.isClosed());
    if (!entry) throw Object.assign(new Error(`No open tester page ${index} in this session.`), { code: "PAGE_CLOSED" });
    session.activePage = index;
    try { await entry.page.bringToFront(); } catch { /* headless courtesy */ }
    return { url: entry.page.url() };
  }

  private async ensureDefault(): Promise<TesterSession> {
    let session = this.sessions.get("default");
    if (!session) {
      await this.createSession({ id: "default", label: "default" });
      session = this.sessions.get("default")!;
    }
    return session;
  }

  async open(rawUrl?: string, sessionId?: string): Promise<{ url: string; title: string; sessionId: string }> {
    const target = rawUrl?.trim() || this.defaultUrl;
    if (!testerUrlAllowed(target)) throw new Error("The tester browser only visits the studio itself (loopback addresses).");
    const session = sessionId ? this.getSession(sessionId) : await this.ensureDefault();
    const page = this.activePage(session);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
    this.log(session, "navigation", sanitizeUrl(page.url()));
    return { url: page.url(), title: await page.title().catch(() => ""), sessionId: session.id };
  }

  async snapshot(sessionId?: string, opts?: { compact?: boolean; limit?: number; cursor?: number; ref?: number; maxDepth?: number; interactiveOnly?: boolean }): Promise<{ url: string; title: string; snapshot: string; truncated: boolean; nextCursor: number | null; sessionId: string }> {
    const session = this.getSession(sessionId);
    const page = this.activePage(session);
    let tree: unknown = null;
    try {
      const cdp = await session.context.newCDPSession(page);
      try {
        tree = await cdp.send("Accessibility.getFullAXTree", { depth: 14 });
      } finally {
        await cdp.detach().catch(() => {});
      }
    } catch {
      tree = null;
    }
    if (!tree) {
      const html = await page.content().then((body) => body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").slice(0, 30_000)).catch(() => "unavailable");
      return { url: page.url(), title: await page.title().catch(() => ""), snapshot: html, truncated: true, nextCursor: null, sessionId: session.id };
    }
    const lines = compactAxTree(tree, opts);
    const limit = Math.max(1, Math.min(200, opts?.limit || 120));
    const cursor = Math.max(0, opts?.cursor || 0);
    const slice = lines.slice(cursor, cursor + limit);
    return {
      url: page.url(), title: await page.title().catch(() => ""),
      snapshot: slice.join("\n") || "(no interactive elements found)",
      truncated: cursor + limit < lines.length,
      nextCursor: cursor + limit < lines.length ? cursor + limit : null,
      sessionId: session.id,
    };
  }

  async screenshot(sessionId?: string, opts?: { fullPage?: boolean; label?: string }): Promise<{ url: string; pngBase64: string; viewport: { width: number; height: number }; fullPage: boolean }> {
    const session = this.getSession(sessionId);
    const page = this.activePage(session);
    // Captures the current page exactly as it is: no navigation, no scroll
    // reset, no menu closing. Full-page captures are labelled as such.
    const png = await page.screenshot({ type: "png", fullPage: opts?.fullPage === true });
    this.log(session, "screenshot", `${opts?.fullPage ? "full-page" : "viewport"}${opts?.label ? ` (${opts.label.slice(0, 80)})` : ""}`);
    return { url: page.url(), pngBase64: png.toString("base64"), viewport: session.viewport, fullPage: opts?.fullPage === true };
  }

  private async resolveTarget(session: TesterSession, page: Page, input: TesterAct): Promise<{ description: string; point: { x: number; y: number } | null; locator: string | null }> {
    if (input.ref !== undefined) {
      // Resolve the snapshot reference to a live element, then measure it
      // in-page. getBoundingClientRect is deliberately more forgiving than
      // layout quads (inline and transformed boxes included); a zero box
      // still means no visible control, and covered/disabled controls fail
      // honestly instead of force-clicking. When the target sits inside a
      // popover that has since closed (the dropdown-menu lifecycle from
      // S3-H01: open at snapshot time, closed at click time), report that
      // specific cause so the tester re-opens and retries with a fresh ref
      // instead of debugging a generic visibility failure.
      const backendNodeId = Number(input.ref);
      if (!Number.isInteger(backendNodeId)) throw Object.assign(new Error(`Reference “${input.ref}” is not a snapshot node id. Take a fresh snapshot.`), { code: "STALE_SNAPSHOT" });
      const cdp = await session.context.newCDPSession(page);
      try {
        const resolved = await cdp.send("DOM.resolveNode", { backendNodeId }).catch(() => null) as { object?: { objectId?: string } } | null;
        const objectId = resolved?.object?.objectId;
        if (!objectId) throw Object.assign(new Error(`Reference ${input.ref} no longer resolves. Take a fresh snapshot.`), { code: "STALE_SNAPSHOT" });
        const inspected = await cdp.send("Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: `function() {
            const rect = this.getBoundingClientRect();
            const style = getComputedStyle(this);
            const disabled = this.disabled === true || this.getAttribute("aria-disabled") === "true";
            const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
            let covered = false;
            if (visible) {
              const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              covered = !!top && top !== this && !this.contains(top);
            }
            let closedPopover = false;
            let ancestor = this.parentElement;
            while (ancestor && !closedPopover) {
              if (ancestor.hasAttribute && ancestor.hasAttribute("popover")) {
                let showing = false;
                try { showing = ancestor.matches(":popover-open"); } catch { showing = true; }
                if (!showing) closedPopover = true;
              }
              ancestor = ancestor.parentElement;
            }
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height, disabled, visible, covered, closedPopover };
          }`,
          returnByValue: true,
        }).catch(() => null) as { result?: { value?: { x?: number; y?: number; w?: number; h?: number; disabled?: boolean; visible?: boolean; covered?: boolean; closedPopover?: boolean } } } | null;
        const box = inspected?.result?.value;
        if (!box || !box.visible || !(box.w || 0) || !(box.h || 0)) {
          if (box?.closedPopover) {
            throw Object.assign(new Error(`Reference ${input.ref} sits in a popover menu that has since closed — open the combobox again, take a fresh snapshot, then click the fresh option ref.`), { code: "POPOVER_CLOSED" });
          }
          throw Object.assign(new Error(`Reference ${input.ref} has no visible box right now.`), { code: "ELEMENT_OBSCURED" });
        }
        if (box.disabled) throw Object.assign(new Error(`Reference ${input.ref} is disabled.`), { code: "ELEMENT_DISABLED" });
        if (box.covered) throw Object.assign(new Error(`Reference ${input.ref} is covered by another element.`), { code: "ELEMENT_OBSCURED" });
        return { description: `ref:${input.ref}`, point: { x: box.x || 0, y: box.y || 0 }, locator: null };
      } finally {
        await cdp.detach().catch(() => {});
      }
    }
    if (input.selector) return { description: `selector ${input.selector}`, point: null, locator: input.selector };
    if (typeof input.x === "number" && typeof input.y === "number") {
      const size = page.viewportSize() || session.viewport;
      if (input.x < 0 || input.y < 0 || input.x > size.width || input.y > size.height) {
        throw Object.assign(new Error(`Coordinates (${input.x}, ${input.y}) fall outside this session's ${size.width}x${size.height} viewport.`), { code: "ELEMENT_OBSCURED" });
      }
      return { description: `point (${input.x}, ${input.y})`, point: { x: input.x, y: input.y }, locator: null };
    }
    throw Object.assign(new Error("Give a snapshot ref, a selector, or x/y coordinates."), { code: "ELEMENT_NOT_FOUND" });
  }

  async act(input: TesterAct & { sessionId?: string }): Promise<{ url: string; title: string; resolved: string; dispatched: string; dialogId?: string; actionId?: string }> {
    const session = this.getSession(input.sessionId);
    const page = this.activePage(session);
    const actionId = input.actionId?.slice(0, 80);
    const fail = (error: unknown): never => {
      const code = (error as { code?: string } | null)?.code || classifyPlaywrightError(error);
      const dialogId = (error as { dialogId?: string } | null)?.dialogId;
      const last = session.events.at(-1);
      const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
      // One failure per attempt: an identical consecutive entry is a retry
      // artifact, not a second failure.
      if (!(last && last.type === "action-failed" && last.detail === `${input.kind}: ${code} — ${message}` && last.actionId === actionId)) {
        this.log(session, "action-failed", `${input.kind}: ${code} — ${message}`, actionId);
      }
      throw Object.assign(new Error(`${code}: ${message} (at ${page.url()})`), { code, ...(dialogId ? { dialogId } : {}) });
    };
    try {
      // Page-level actions need no target at all — requiring a selector for
      // a keypress or a navigation was a contract bug, not a safety feature.
      const needsTarget = !["reload", "back", "forward", "press", "goto"].includes(input.kind);
      const target = needsTarget
        ? await this.resolveTarget(session, page, input).catch(fail)
        : { description: "page", point: null as { x: number; y: number } | null, locator: null as string | null };
      const locator = target.locator ? page.locator(target.locator) : null;
      const point = target.point || (locator ? await locator.boundingBox().then((box) => (box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null)).catch(() => null) : null);
      const at = async (): Promise<{ x: number; y: number }> => {
        if (point) return point;
        if (!locator) throw new Error("No target point.");
        // Strict single match: a selector hitting several controls reports
        // AMBIGUOUS_ELEMENT instead of silently acting on the first one.
        if ((await locator.count()) > 1) {
          const total = await locator.count();
          throw Object.assign(new Error(`Selector matched ${total} elements. Refine it to one control instead of acting on the first match.`), { code: "AMBIGUOUS_ELEMENT" });
        }
        await locator.waitFor({ state: "visible", timeout: 12_000 });
        if ((await locator.count()) !== 1) throw Object.assign(new Error("Selector no longer matches exactly one control."), { code: "AMBIGUOUS_ELEMENT" });
        const box = await locator.boundingBox();
        if (!box) throw new Error("Target has no visible box.");
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      const dialogCountBefore = session.dialogs.length;
      const dialogPending = (): never => {
        const dialog = session.dialogs.slice(dialogCountBefore)[0]!;
        this.log(session, "action", `${input.kind} → ${target.description}: dispatched, awaiting dialog ${dialog.id}`, actionId);
        throw Object.assign(
          new Error(`Dispatched — a ${dialog.type} dialog is now pending (id ${dialog.id}). Accept or dismiss it explicitly with tester_dialog; do not retry the action blindly.`),
          { code: "DIALOG_PENDING", dialogId: dialog.id },
        );
      };
      const dispatch = async (work: () => Promise<unknown>): Promise<void> => {
        // S5-H01 / S4-H02: Playwright's mouse dispatch does not resolve while
        // a native dialog is open, so a click that triggers confirm() would
        // otherwise hang to the MCP timeout. Poll the dialog queue while the
        // action settles; the first dialog becomes an actionable result.
        const outcome: { state: "pending" | "ok" | "rejected"; failure?: unknown } = { state: "pending" };
        const workDone = work().then(() => { outcome.state = "ok"; }, (error) => { outcome.state = "rejected"; outcome.failure = error; });
        const deadline = Date.now() + 2_000;
        while (outcome.state === "pending" && Date.now() < deadline) {
          if (session.dialogs.length > dialogCountBefore) dialogPending();
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        if (session.dialogs.length > dialogCountBefore) dialogPending();
        if (outcome.state === "rejected") {
          // A dispatched action that opened a dialog is not a failure: report
          // awaiting-decision instead of letting the tester retry a Send.
          if (session.dialogs.length > dialogCountBefore) dialogPending();
          throw outcome.failure;
        }
        if (outcome.state === "pending") await workDone;
      };
      switch (input.kind) {
        case "click":
          if (locator) await dispatch(() => locator.click({ timeout: 12_000 }));
          else { const p = await at(); await dispatch(() => page.mouse.click(p.x, p.y)); }
          break;
        case "dblclick":
          if (locator) await dispatch(() => locator.dblclick({ timeout: 12_000 }));
          else { const p = await at(); await dispatch(() => page.mouse.dblclick(p.x, p.y)); }
          break;
        case "rightclick":
          if (locator) await dispatch(() => locator.click({ button: "right", timeout: 12_000 }));
          else { const p = await at(); await dispatch(() => page.mouse.click(p.x, p.y, { button: "right" })); }
          break;
        case "hover": {
          const p = await at();
          await page.mouse.move(p.x, p.y);
          break;
        }
        case "fill":
          if (typeof input.text !== "string") throw new Error("Fill needs text.");
          if (locator) await dispatch(() => locator.fill(input.text as string, { timeout: 12_000 }));
          else {
            const p = await at();
            await dispatch(async () => {
              await page.mouse.click(p.x, p.y);
              await page.keyboard.press("ControlOrMeta+A");
              // Clearing is a real edit: press Backspace so input/change fire
              // and the app's state updates. Typing "" dispatches nothing, so
              // the old value (and the synced draft) would silently survive.
              if (input.text === "") await page.keyboard.press("Backspace");
              else await page.keyboard.type(input.text as string);
            });
          }
          break;
        case "type":
          if (typeof input.text !== "string") throw new Error("Type needs text.");
          if (locator) {
            await dispatch(async () => {
              await locator.focus({ timeout: 12_000 });
              await page.keyboard.type(input.text as string);
            });
          } else {
            const p = await at();
            await dispatch(async () => {
              await page.mouse.click(p.x, p.y);
              await page.keyboard.type(input.text as string);
            });
          }
          break;
        case "press":
          if (!input.key) throw new Error("Press needs a key.");
          await dispatch(() => page.keyboard.press(input.key as string));
          break;
        case "check":
          if (!locator) throw new Error("Check needs a selector or ref.");
          await locator.check({ timeout: 12_000 });
          break;
        case "uncheck":
          if (!locator) throw new Error("Uncheck needs a selector or ref.");
          await locator.uncheck({ timeout: 12_000 });
          break;
        case "select":
          if (!locator || input.option === undefined) throw new Error("Select needs a selector and an option value or label.");
          await locator.selectOption(input.option, { timeout: 12_000 });
          break;
        case "focus":
          if (locator) await dispatch(() => locator.focus({ timeout: 12_000 }));
          else { const p = await at(); await dispatch(() => page.mouse.click(p.x, p.y)); }
          break;
        case "clear":
          if (locator) await dispatch(() => locator.fill("", { timeout: 12_000 }));
          else {
            // Ref-targeted clear: click, select all, then delete so the field
            // and its persisted draft actually change (regression from S5-H02).
            const p = await at();
            await dispatch(async () => {
              await page.mouse.click(p.x, p.y);
              await page.keyboard.press("ControlOrMeta+A");
              await page.keyboard.press("Backspace");
            });
          }
          break;
        case "scroll": {
          const p = { x: Math.max(0, Math.min(1440, input.x ?? 720)), y: Math.max(0, Math.min(900, input.y ?? 450)) };
          await page.mouse.move(p.x, p.y);
          await page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 400);
          break;
        }
        case "drag": {
          const from = await at();
          const toX = Math.max(0, Math.min(1440, input.toX ?? from.x));
          const toY = Math.max(0, Math.min(900, input.toY ?? from.y));
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(toX, toY, { steps: 12 });
          await page.mouse.up();
          break;
        }
        case "reload":
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
          break;
        case "back":
          await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
          break;
        case "forward":
          await page.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
          break;
        case "goto": {
          const url = (input.text || "").trim();
          if (!testerUrlAllowed(url)) throw Object.assign(new Error("The tester browser only visits the studio itself (loopback addresses)."), { code: "PRODUCTION_TARGET_DENIED" });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          break;
        }
      }
      await page.waitForTimeout(250);
      // S5-H01 / S4-H02: mouse dispatch resolves before a native dialog is
      // queued, so a click that opened one would otherwise report plain
      // success. After the settle delay, surface the pending dialog as an
      // actionable awaiting-dialog result instead.
      const openedDuringAction = session.dialogs.slice(dialogCountBefore);
      if (openedDuringAction.length) {
        const dialog = openedDuringAction[0]!;
        this.log(session, "action", `${input.kind} → ${target.description}: dispatched, awaiting dialog ${dialog.id}`, actionId);
        throw Object.assign(
          new Error(`Dispatched — a ${dialog.type} dialog is now pending (id ${dialog.id}). Accept or dismiss it explicitly with tester_dialog; do not retry the action blindly.`),
          { code: "DIALOG_PENDING", dialogId: dialog.id },
        );
      }
      this.log(session, "action", `${input.kind} → ${target.description}: dispatched`, actionId);
      return { url: page.url(), title: await page.title().catch(() => ""), resolved: target.description, dispatched: "dispatched", ...(actionId ? { actionId } : {}) };
    } catch (error) {
      return fail(error);
    }
  }

  async wait(input: TesterWait & { sessionId?: string }): Promise<{ matched: boolean; elapsedMs: number; url: string }> {
    const session = this.getSession(input.sessionId);
    const page = this.activePage(session);
    const timeout = Math.max(500, Math.min(120_000, input.timeoutMs ?? 15_000));
    const started = Date.now();
    try {
      if (input.kind === "text") {
        if (!input.value) throw new Error("A text wait needs the expected text.");
        await page.getByText(input.value).first().waitFor({ timeout });
      } else if (input.kind === "selector") {
        if (!input.value) throw new Error("A selector wait needs a selector.");
        await page.locator(input.value).first().waitFor({ timeout });
      } else if (input.kind === "enabled") {
        if (!input.value) throw new Error("An enabled wait needs a selector.");
        await page.waitForFunction(
          (selector) => { const el = document.querySelector(selector) as (HTMLElement & { disabled?: boolean }) | null; return !!el && !el.hasAttribute("disabled") && (el as { disabled?: boolean }).disabled !== true; },
          input.value, { timeout },
        );
      } else if (input.kind === "hidden") {
        if (!input.value) throw new Error("A hidden wait needs a selector.");
        await page.locator(input.value).first().waitFor({ state: "hidden", timeout });
      } else if (input.kind === "url") {
        if (!input.value) throw new Error("A url wait needs a substring.");
        await page.waitForURL((url) => url.toString().includes(input.value!), { timeout });
      } else if (input.kind === "dialog") {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && !session.dialogs.length) await new Promise((resolve) => setTimeout(resolve, 150));
        if (!session.dialogs.length) throw new Error(`No browser dialog appeared within ${timeout}ms.`);
      } else if (input.kind === "download") {
        const before = this.downloads(session.id).filter((entry) => entry.status === "done").length;
        const deadline = Date.now() + timeout;
        for (;;) {
          const done = this.downloads(session.id).filter((entry) => entry.status === "done").length;
          if (done > before) break;
          if (Date.now() >= deadline) throw new Error(`No download completed within ${timeout}ms.`);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } else {
        throw new Error("Unknown wait kind.");
      }
      const elapsedMs = Date.now() - started;
      this.log(session, "wait", `${input.kind}${input.value ? ` “${input.value.slice(0, 120)}”` : ""}: matched in ${elapsedMs}ms`);
      return { matched: true, elapsedMs, url: page.url() };
    } catch (error) {
      const elapsedMs = Date.now() - started;
      this.log(session, "wait-timeout", `${input.kind}: no match in ${elapsedMs}ms at ${sanitizeUrl(page.url())}`);
      throw Object.assign(new Error(`TIMEOUT waiting ${timeout}ms for ${input.kind}${input.value ? ` “${input.value.slice(0, 120)}”` : ""} — current page ${page.url()} (evidence, not success)`), { code: "TIMEOUT" });
    }
  }

  dialogs(sessionId?: string): QueuedDialog[] {
    return this.getSession(sessionId).dialogs.slice(-20);
  }

  async resolveDialog(sessionId: string | undefined, id: string, accept: boolean, promptText?: string): Promise<{ resolved: boolean }> {
    const session = this.getSession(sessionId);
    const index = session.dialogs.findIndex((dialog) => dialog.id === id);
    if (index === -1) throw Object.assign(new Error("That dialog is no longer pending. List dialogs again."), { code: "DIALOG_PENDING" });
    const [queued] = session.dialogs.splice(index, 1);
    if (accept) await queued.handle.accept(promptText ?? queued.handle.defaultValue()).catch(() => {});
    else await queued.handle.dismiss().catch(() => {});
    this.log(session, "dialog-resolved", `${queued.type} ${accept ? "accepted" : "dismissed"}: ${queued.message.slice(0, 200)}`);
    return { resolved: true };
  }

  events(sessionId?: string, opts?: { cursor?: number; limit?: number; type?: string }): { events: TesterEvent[]; nextCursor: number | null; dropped: number } {
    const session = this.getSession(sessionId);
    const limit = Math.max(1, Math.min(200, opts?.limit || 100));
    const cursor = Math.max(0, opts?.cursor || 0);
    const filtered = opts?.type ? session.events.filter((event) => event.type === opts.type) : session.events;
    const slice = filtered.filter((event) => event.seq > cursor).slice(0, limit);
    const last = slice.at(-1)?.seq ?? cursor;
    return { events: slice, nextCursor: slice.length === limit ? last : null, dropped: session.droppedEvents };
  }

  async stageFixture(filename: string, contentBase64: string, mime?: string): Promise<{ fixtureId: string; filename: string; bytes: number; sha256: string }> {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(contentBase64, "base64");
    } catch {
      throw new Error("The fixture content is not valid base64.");
    }
    if (!bytes.length || bytes.length > 25_000_000) throw new Error("Stage a non-empty file under 25 MB.");
    const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "fixture";
    const fixtureId = randomUUID();
    // The file keeps its requested display name inside its own fixture
    // directory: the browser (and the UI chips) see qa-orders.csv, while the
    // fixture id stays the stable handle. Storage identity and display name
    // are separate on purpose.
    const dir = path.join(this.storageRoot, "fixtures", fixtureId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, safe), bytes);
    return { fixtureId, filename: safe, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }

  fixturePath(fixtureId: string): { path: string; filename: string } | null {
    const dir = path.join(this.storageRoot, "fixtures");
    try {
      // Current layout: one directory per fixture id, display name inside.
      const sub = path.join(dir, fixtureId);
      for (const name of readdirSync(sub)) {
        return { path: path.join(sub, name), filename: name };
      }
    } catch { /* fall through to the legacy layout */ }
    try {
      // Legacy layout (pre-subdirectory): <fixtureId>-<name> flat files.
      for (const name of readdirSync(dir)) {
        if (name.startsWith(`${fixtureId}-`)) return { path: path.join(dir, name), filename: name.slice(fixtureId.length + 1) || "fixture" };
      }
    } catch { /* none staged */ }
    return null;
  }

  async upload(input: { selector?: string; fixtureIds: string[]; sessionId?: string }): Promise<{ files: Array<{ filename: string; bytes: number; sha256: string }>; selector: string }> {
    if (!input.fixtureIds.length || input.fixtureIds.length > 6) throw new Error("Stage one to six fixtures first, then upload them.");
    const session = this.getSession(input.sessionId);
    const page = this.activePage(session);
    const files = input.fixtureIds.map((id) => {
      const found = this.fixturePath(id);
      if (!found) throw Object.assign(new Error(`Staged fixture “${id}” does not exist. Stage it first.`), { code: "ELEMENT_NOT_FOUND" });
      return found.path;
    });
    const selector = input.selector || "input[type=file]";
    try {
      await page.locator(selector).first().setInputFiles(files, { timeout: 15_000 });
    } catch (error) {
      throw Object.assign(new Error(`File input not ready: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`), { code: classifyPlaywrightError(error) });
    }
    const { readFileSync } = await import("node:fs");
    const result = files.map((file) => {
      const bytes = readFileSync(file);
      return { filename: path.basename(file).replace(/^[0-9a-f-]{36}-/, ""), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
    this.log(session, "upload", `${result.length} file(s) into ${selector}: ${result.map((file) => `${file.filename} (${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}…)`).join(", ")}`);
    return { files: result, selector };
  }

  async close(sessionId?: string): Promise<boolean> {
    if (sessionId) return this.closeSession(sessionId);
    const ids = [...this.sessions.keys()];
    for (const id of ids) await this.closeSession(id).catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
    return ids.length > 0;
  }
}
