import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MacAppInfo {
  name: string;
  bundleId: string | null;
  pid: number;
  focused: boolean;
  windowTitle: string | null;
}

export interface MacAppElement {
  index: string;
  role: string;
  label: string | null;
  enabled: boolean;
  focused: boolean;
  frame?: { x: number; y: number; width: number; height: number };
}

const findProcess = `
function findProcess(systemEvents, appRef) {
  const needle = String(appRef).toLowerCase();
  const processes = systemEvents.applicationProcesses();
  for (const process of processes) {
    try { if (String(process.name()).toLowerCase() === needle) return process; } catch (e) {}
    try { if (String(process.bundleIdentifier()).toLowerCase() === needle) return process; } catch (e) {}
  }
  return null;
}
`;

const boundedTree = `
function collectElements(root, limit) {
  const queue = [root], output = [];
  while (queue.length && output.length < limit) {
    const current = queue.shift();
    output.push(current);
    let children = [];
    try { children = current.uiElements(); } catch (e) {}
    for (const child of children) {
      if (output.length + queue.length >= limit) break;
      queue.push(child);
    }
  }
  return output;
}
`;

const listScript = `
function run() {
  const systemEvents = Application("System Events");
  const front = systemEvents.applicationProcesses.whose({ frontmost: true })[0];
  const frontName = front ? front.name() : null;
  const apps = [];
  for (const process of systemEvents.applicationProcesses.whose({ visible: true })()) {
    let bundleId = null, windowTitle = null;
    try { bundleId = process.bundleIdentifier(); } catch (e) {}
    try { const windows = process.windows(); if (windows.length) windowTitle = windows[0].name(); } catch (e) {}
    const name = process.name();
    apps.push({ name, bundleId, pid: process.unixId(), focused: name === frontName, windowTitle });
  }
  return JSON.stringify({ apps });
}
`;

const inspectScript = `
${findProcess}
${boundedTree}
function interactiveRole(role) {
  const value = String(role || "").toLowerCase();
  return ["button","textfield","textarea","checkbox","radio","slider","popup","menuitem","link","tab","combo","incrementor","disclosure","switch","cell","row","searchfield"].some((part) => value.includes(part));
}
function run(argv) {
  const appRef = argv[0], maximum = Math.max(1, Math.min(100, parseInt(argv[1] || "50", 10)));
  const systemEvents = Application("System Events"), process = findProcess(systemEvents, appRef);
  if (!process) return JSON.stringify({ error: "app_not_found", app: appRef });
  try { process.frontmost = true; } catch (e) {}
  delay(0.04);
  let root = process, windowTitle = null;
  try { const windows = process.windows(); if (windows.length) { root = windows[0]; windowTitle = windows[0].name(); } } catch (e) {}
  const raw = collectElements(root, Math.max(60, Math.min(600, maximum * 6)));
  const elements = [];
  for (let index = 0; index < raw.length && elements.length < maximum; index++) {
    const element = raw[index];
    let role = "unknown";
    try { role = String(element.role()); } catch (e) {}
    if (!interactiveRole(role)) continue;
    let title = null, value = null, description = null, enabled = true, focused = false, frame = null;
    try { title = element.title(); } catch (e) {}
    try { value = element.value(); } catch (e) {}
    try { description = element.description(); } catch (e) {}
    try { enabled = !!element.enabled(); } catch (e) {}
    try { focused = !!element.focused(); } catch (e) {}
    if (elements.length < 8) {
      try { const p = element.position(), s = element.size(); frame = { x: p[0], y: p[1], width: s[0], height: s[1] }; } catch (e) {}
    }
    const parts = [title, value, description].filter((part) => part != null && String(part).trim()).map(String);
    const item = { index: String(index), role, label: parts[0] || null, enabled, focused };
    if (frame) item.frame = frame;
    elements.push(item);
  }
  let bundleId = null;
  try { bundleId = process.bundleIdentifier(); } catch (e) {}
  return JSON.stringify({ app: { name: process.name(), bundleId, pid: process.unixId(), focused: true, windowTitle }, elements, totalCount: raw.length });
}
`;

const clickScript = `
${findProcess}
${boundedTree}
function run(argv) {
  const appRef = argv[0], elementIndex = parseInt(argv[1], 10), count = Math.max(1, Math.min(2, parseInt(argv[2] || "1", 10)));
  const systemEvents = Application("System Events"), process = findProcess(systemEvents, appRef);
  if (!process) return JSON.stringify({ error: "app_not_found" });
  try { process.frontmost = true; } catch (e) {}
  delay(0.04);
  let root = process;
  try { const windows = process.windows(); if (windows.length) root = windows[0]; } catch (e) {}
  const raw = collectElements(root, Math.max(60, Math.min(1200, elementIndex + 1)));
  if (!raw[elementIndex]) return JSON.stringify({ error: "element_not_found" });
  try { for (let i = 0; i < count; i++) raw[elementIndex].click(); return JSON.stringify({ ok: true }); }
  catch (e) { return JSON.stringify({ error: "click_failed", message: String(e) }); }
}
`;

const typeScript = `
${findProcess}
function run(argv) {
  const appRef = argv[0], text = argv[1], clear = argv[2] === "1";
  const systemEvents = Application("System Events"), process = findProcess(systemEvents, appRef);
  if (!process) return JSON.stringify({ error: "app_not_found" });
  try { process.frontmost = true; } catch (e) {}
  delay(0.08);
  if (clear) { systemEvents.keystroke("a", { using: "command down" }); delay(0.04); }
  systemEvents.keystroke(text);
  return JSON.stringify({ ok: true });
}
`;

const keyScript = `
${findProcess}
function run(argv) {
  const appRef = argv[0], key = String(argv[1]).toLowerCase(), modifiers = JSON.parse(argv[2] || "[]");
  const systemEvents = Application("System Events"), process = findProcess(systemEvents, appRef);
  if (!process) return JSON.stringify({ error: "app_not_found" });
  try { process.frontmost = true; } catch (e) {}
  delay(0.05);
  const codes = { return:36, enter:36, escape:53, esc:53, tab:48, space:49, delete:51, backspace:51, up:126, down:125, left:123, right:124, home:115, end:119, pageup:116, pagedown:121 };
  const using = modifiers.map((item) => { const value = String(item).toLowerCase(); if (value === "cmd" || value === "command" || value === "meta") return "command down"; if (value === "option" || value === "alt") return "option down"; if (value === "ctrl" || value === "control") return "control down"; return "shift down"; });
  if (codes[key] != null) systemEvents.keyCode(codes[key], using.length ? { using } : {});
  else systemEvents.keystroke(key, using.length ? { using } : {});
  return JSON.stringify({ ok: true });
}
`;

const scrollScript = `
${findProcess}
function run(argv) {
  const appRef = argv[0], amount = Math.max(-20, Math.min(20, parseInt(argv[1] || "0", 10)));
  const systemEvents = Application("System Events"), process = findProcess(systemEvents, appRef);
  if (!process) return JSON.stringify({ error: "app_not_found" });
  try { process.frontmost = true; } catch (e) {}
  const code = amount >= 0 ? 125 : 126;
  for (let i = 0; i < Math.abs(amount); i++) systemEvents.keyCode(code);
  return JSON.stringify({ ok: true });
}
`;

export class MacAppControl {
  private assertAvailable() {
    if (process.platform !== "darwin") throw new Error("Mac app control is available on macOS only.");
  }

  private async run<T>(script: string, args: string[] = [], timeout = 10_000): Promise<T> {
    this.assertAvailable();
    try {
      const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script, ...args], { timeout, maxBuffer: 12 * 1024 * 1024 });
      return JSON.parse(stdout.trim() || "null") as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/assistive access|not authorized|accessibility/i.test(message)) throw new Error("OpenBot needs Accessibility permission in System Settings → Privacy & Security → Accessibility before it can use Mac apps.");
      const stopped = error as { killed?: boolean; signal?: string | null };
      if (stopped.killed || stopped.signal === "SIGTERM") throw new Error("OpenBot could not read that app before the safety timeout. Check Accessibility permission in System Settings → Privacy & Security, then try the app again.");
      throw error;
    }
  }

  async list(): Promise<{ apps: MacAppInfo[] }> {
    return this.run(listScript);
  }

  async open(app: string): Promise<MacAppInfo> {
    this.assertAvailable();
    const clean = app.trim();
    if (!clean || clean.length > 160) throw new Error("Choose a valid Mac app name.");
    try { await execFileAsync("open", ["-b", clean], { timeout: 8_000 }); }
    catch { await execFileAsync("open", ["-a", clean], { timeout: 8_000 }); }
    await new Promise((resolve) => setTimeout(resolve, 180));
    const state = await this.inspect(clean, 1);
    if ("error" in state) throw new Error(`Could not find the Mac app “${clean}”.`);
    return state.app;
  }

  async inspect(app: string, maxElements = 50): Promise<{ app: MacAppInfo; elements: MacAppElement[]; totalCount: number } | { error: string; app: string }> {
    return this.run(inspectScript, [app.trim(), String(maxElements)]);
  }

  async click(app: string, elementIndex: string, clickCount = 1): Promise<void> {
    const result = await this.run<{ ok?: boolean; error?: string; message?: string }>(clickScript, [app.trim(), elementIndex, String(clickCount)]);
    if (!result?.ok) throw new Error(result?.message || "That Mac control is no longer available. Inspect the app again and retry.");
  }

  async type(app: string, text: string, clear = false): Promise<void> {
    if (text.length > 8_000) throw new Error("Mac text entry is limited to 8,000 characters at a time.");
    const result = await this.run<{ ok?: boolean; error?: string }>(typeScript, [app.trim(), text, clear ? "1" : "0"]);
    if (!result?.ok) throw new Error("OpenBot could not enter text in that Mac app.");
  }

  async key(app: string, key: string, modifiers: string[] = []): Promise<void> {
    const result = await this.run<{ ok?: boolean }>(keyScript, [app.trim(), key, JSON.stringify(modifiers)]);
    if (!result?.ok) throw new Error("OpenBot could not press that key in the Mac app.");
  }

  async scroll(app: string, amount: number): Promise<void> {
    const result = await this.run<{ ok?: boolean }>(scrollScript, [app.trim(), String(Math.round(amount))]);
    if (!result?.ok) throw new Error("OpenBot could not scroll that Mac app.");
  }
}
