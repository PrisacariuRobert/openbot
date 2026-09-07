import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { recipeId, starterRecipes, type RecipeExample } from "../shared/recipes.js";
import { OpenBotDatabase } from "./database.js";
import { GoogleWorkspaceConnector, GOOGLE_SCOPES } from "./google-workspace.js";
import { WorkReportService } from "./work-reports.js";
import { PageWatchMonitor } from "./page-watch.js";
import { CodeProjectManager } from "./code-projects.js";
import { CodeCheckService } from "./code-checks.js";

// Fixed fixtures only. No owner database, live HTTP, Mac apps, user-supplied
// commands, provider, shell interpolation or installed third-party skill runs.
export async function runRecipeExample(id: unknown): Promise<RecipeExample> {
  const selected = recipeId.parse(id), recipe = starterRecipes.find((entry) => entry.id === selected)!;
  const started = performance.now(), root = mkdtempSync(path.join(tmpdir(), "openbot-recipe-example-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data"), seedStarterBots: true });
  const checks: string[] = [];
  let markdown = "";
  try {
    if (recipe.workKind) {
      const at = Date.parse("2026-09-05T07:00:00Z");
      db.configureGoogleConnector({ clientId: "example.apps.googleusercontent.com" });
      db.completeGoogleConnector({ accessToken: "synthetic-example-only", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "sample@example.com" });
      db.setBotConnectorAccess("nova", { canRead: true, canSend: false });
      db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "google-calendar");
      const methods: string[] = [];
      const google = new GoogleWorkspaceConnector(db, "http://127.0.0.1:1/callback", (async (input, init) => {
        const url = new URL(String(input)); methods.push(init?.method || "GET");
        assert.equal(methods.at(-1), "GET");
        if (url.pathname.endsWith("/threads")) return Response.json({ threads: [{ id: "example-thread" }] });
        if (url.pathname.endsWith("/threads/example-thread")) return Response.json({ id: "example-thread", messages: [{ id: "example-message", internalDate: String(at - 60_000), labelIds: ["INBOX", "UNREAD"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Mira <mira@example.com>" }, { name: "Subject", value: "Launch review" }], body: { data: Buffer.from("Could you review the agenda before our 08:00 launch review?").toString("base64url") } } }] });
        if (url.pathname.endsWith("/calendars/primary/events")) return Response.json({ items: [{ id: "example-event", summary: "Launch review", start: { dateTime: "2026-09-05T08:00:00Z" }, end: { dateTime: "2026-09-05T08:30:00Z" }, htmlLink: "https://calendar.google.com/calendar/event?eid=example" }] });
        throw new Error("The example attempted an unexpected data source.");
      }) as typeof fetch);
      const unavailable = async (): Promise<never> => { throw new Error("Safe examples cannot read Mac apps."); };
      const service = new WorkReportService(db, google, () => at, { available: false, mail: unavailable, calendar: unavailable });
      const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Synthetic recipe example" });
      const snapshot = await service.collect("nova", run.id, { kind: recipe.workKind, timeZone: "UTC" });
      assert.ok(snapshot.sources.length > 0);
      const source = snapshot.sources.find((item) => item.service === (recipe.workKind === "inbox" ? "gmail" : "google-calendar"))!;
      assert.ok(source);
      const report = service.save("nova", run.id, { snapshotId: snapshot.id, items: [{ priority: "soon", text: "Review the agenda before the launch review.", sourceRefs: [source.ref] }], drafts: recipe.workKind === "inbox" ? [{ sourceRef: source.ref, body: "Thanks, Mira. I’ll review the agenda before our meeting." }] : [] });
      assert.equal(db.getWorkReport(snapshot.id)?.snapshotId, snapshot.id);
      assert.ok(methods.length > 0 && methods.every((method) => method === "GET"));
      checks.push("The production collector decoded synthetic mail and calendar responses.", "A real report was saved with references matched to its snapshot.", "Only read requests were made to the fixture; nothing was sent.");
      if (recipe.workKind === "inbox") { assert.equal(report.drafts[0]?.to, "mira@example.com"); checks.push("The unsent draft recipient was bound to the received message."); }
      markdown = report.markdown;
    } else if (selected === "source-change-digest") {
      const routine = db.createRoutine({ name: "Example release watch", botId: "nova", threadId: "bot-nova", prompt: "Summarize the source change", triggerType: "webpage", triggerConfig: { pageUrl: "https://example.com/releases" }, intervalMinutes: 15 });
      let source = "Release 1: a calmer inbox.", clock = Date.now();
      const events: string[] = [];
      const monitor = new PageWatchMonitor(db, (_routine, _payload, id) => { events.push(id); return true; }, async () => source, () => clock);
      await monitor.checkNow(routine.id); assert.equal(events.length, 0);
      clock += 16 * 60_000; await monitor.checkNow(routine.id); assert.equal(events.length, 0);
      source = "Release 2: a calmer inbox and source-linked meeting notes.";
      clock += 16 * 60_000; await monitor.checkNow(routine.id); assert.equal(events.length, 1);
      monitor.stop();
      const resumed = new PageWatchMonitor(db, (_routine, _payload, id) => { events.push(id); return true; }, async () => source, () => clock);
      clock += 16 * 60_000; await resumed.checkNow(routine.id); resumed.stop(); assert.equal(events.length, 1);
      checks.push("The first check saved a baseline without dispatching work.", "An unchanged check dispatched nothing.", "A content change dispatched once; restarting the monitor did not duplicate it.");
      markdown = "# A change worth your attention\n\nThe sample release page added source-linked meeting notes.\n\n- Baseline: saved\n- Unchanged: no task\n- Changed: one dispatch\n- Restart, unchanged: no duplicate\n\nThis exercises the production change detector with an injected text reader. It does not test live HTTP, authenticated feeds, a model summary, or background startup.";
    } else {
      const source = path.join(root, "project"); mkdirSync(source);
      const broken = "module.exports = items => items.reduce((sum, item) => sum + item.price, 0);\n";
      const oracle = "const assert = require('node:assert/strict'); const total = require('./total.cjs'); assert.equal(total([{price:12,quantity:3},{price:5,quantity:2}]),46); assert.equal(total([]),0);\n";
      writeFileSync(path.join(source, "total.cjs"), broken); writeFileSync(path.join(source, "total.test.cjs"), oracle);
      const git = (...args: string[]) => execFileSync("git", args, { cwd: source, timeout: 10_000, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdio: ["ignore", "pipe", "pipe"] }).trim();
      git("init", "-b", "main"); git("config", "core.hooksPath", "/dev/null"); git("config", "commit.gpgsign", "false"); git("add", ".");
      git("-c", "user.name=Example", "-c", "user.email=example@example.com", "commit", "-m", "Independent failing example");
      const projects = new CodeProjectManager(db, root);
      const project = db.createCodeProject({ name: "Sample totals", ...projects.inspectRoot(source), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }] });
      const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Repair the synthetic quantity bug" });
      projects.branch("nova", project.id, "openbot/example", run.id);
      const fixturePath = db.getCodeTaskWorkspace(run.id)!.rootPath;
      const service = new CodeCheckService(db, projects, { executeCodeProject: async (_bot, directory, command) => {
        assert.equal(directory, fixturePath); assert.equal(command, "node total.test.cjs");
        assert.equal(readFileSync(path.join(directory, "total.test.cjs"), "utf8"), oracle);
        const content = readFileSync(path.join(directory, "total.cjs"), "utf8");
        assert.ok([broken, broken.replace("sum + item.price", "sum + item.price * item.quantity")].includes(content));
        let code = 0, stdout = "", stderr = "";
        // Only the two hard-coded fixture programs above can reach execution.
        try { stdout = execFileSync(process.execPath, ["total.test.cjs"], { cwd: directory, encoding: "utf8", timeout: 5_000, maxBuffer: 32_768, env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] }); }
        catch (error) { const value = error as { status?: number; stdout?: string; stderr?: string }; if (typeof value.status !== "number") throw error; code = value.status; stdout = String(value.stdout || ""); stderr = String(value.stderr || ""); }
        return { code, stdout, stderr, sourceChanged: false, runtimeIdentity: "controlled-host-node-fixture" };
      } });
      const before = await service.execute("nova", project.id, run.id, "node total.test.cjs");
      assert.equal(before.check.status, "failed"); assert.match(before.stderr, /AssertionError/);
      projects.replace("nova", project.id, "total.cjs", "sum + item.price", "sum + item.price * item.quantity", 1, run.id);
      projects.commit("nova", project.id, "Account for quantities", ["total.cjs"], run.id);
      const after = await service.execute("nova", project.id, run.id, "node total.test.cjs");
      assert.equal(after.check.status, "passed"); assert.notEqual(after.check.headCommit, before.check.headCommit);
      projects.assertCheckedCommit("nova", project.id, run.id);
      assert.equal(readFileSync(path.join(source, "total.cjs"), "utf8"), broken); assert.equal(git("status", "--porcelain"), "");
      checks.push("An independent assertion failed before the repair.", "A separate Git worktree was repaired; the same assertion then passed.", "Receipts matched the exact commits; the original checkout and test were preserved.");
      markdown = `# A small fix, with evidence\n\nThe sample total ignored quantities. It now multiplies each price by its quantity.\n\n- Before: assertion failed on ${before.check.headCommit.slice(0, 8)}\n- After: the same assertion passed on ${after.check.headCommit.slice(0, 8)}\n- Original checkout: unchanged\n\nThis uses the real project and check services with fixed sample code executed by host Node. It does not test Docker, an AI-generated repair, your repository, or a publish operation.`;
    }
    return { recipeId: selected, fixture: true, providerUsed: false, elapsedMs: Math.round(performance.now() - started), checks, markdown: `> Safe example · synthetic data · no model used. Interpretations and the repair are prewritten examples, not AI output.\n\n${markdown}` };
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
}
