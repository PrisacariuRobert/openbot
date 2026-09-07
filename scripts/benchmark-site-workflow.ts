// Independent browser-based acceptance for the measured-project loop. Synthetic
// local site, actual Chromium, production worktree/check/benchmark services.
// Repairs are scripted, not model-generated. No owner checkout or account used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { CodeProjectManager } from "../src/server/code-projects.js";
import { CodeCheckService } from "../src/server/code-checks.js";
import { CodeBenchmarkService } from "../src/server/code-benchmark.js";
import { renderCodeBenchmark } from "../src/shared/code-benchmark.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-experiment-"));
const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
const projects = new CodeProjectManager(db, root);
let workspace = "";
const server = createServer((req, res) => {
  if (req.url !== "/") { res.writeHead(404); res.end(); return; }
  try {
    const settings = JSON.parse(readFileSync(path.join(workspace, "site.json"), "utf8")) as { delay: number; broken: boolean };
    assert.ok([0, 600].includes(settings.delay)); assert.equal(typeof settings.broken, "boolean");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'" });
    // Fixed template; only validated numeric/boolean fixture settings vary.
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Sample order</title><meta name="viewport" content="width=device-width,initial-scale=1"><body><main><h1>Review your order</h1><p role="status">Loading order…</p></main><script>
    setTimeout(() => { document.querySelector('main').innerHTML = '<h1>Review your order</h1><label for="quantity">Quantity</label><input id="quantity" type="number" min="1" max="12" value="1"><button type="button">Update total</button><p id="total" role="status" aria-live="polite">Total: €12</p><p>Free returns within 30 days.</p>'; document.querySelector('button').onclick = () => { document.querySelector('#total').textContent = 'Total: €' + (Number(document.querySelector('input').value) * ${settings.broken ? 1 : 12}); }; document.body.dataset.ready = 'true'; }, ${settings.delay});
    </script></body></html>`);
  } catch { res.writeHead(500); res.end("Invalid fixture"); }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const reports: string[] = [], outcomes: unknown[] = [];
try {
  for (const kind of ["improvable", "unchanged", "faster-but-broken"] as const) {
    const source = path.join(root, kind); mkdirSync(source);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: source, timeout: 10_000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
    const initial = JSON.stringify({ delay: kind === "unchanged" ? 0 : 600, broken: false, note: "baseline" });
    writeFileSync(path.join(source, "site.json"), initial);
    const inputs = "{\"quantities\":[1,3,7],\"unitPrice\":12}\n";
    const oracle = "Keep heading Review your order; labelled Quantity input; Update total keyboard-operable button; live total; return policy; no horizontal overflow at 390px. Totals equal quantity multiplied by 12 for every declared input.\n";
    writeFileSync(path.join(source, "scenario.json"), inputs); writeFileSync(path.join(source, "oracle.md"), oracle);
    git("init", "-b", "main"); git("config", "core.hooksPath", "/dev/null"); git("config", "commit.gpgsign", "false"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "Independent site baseline");
    const project = db.createCodeProject({ name: kind, ...projects.inspectRoot(source), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }] });
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Measure this synthetic site's readiness while preserving its behavior" });
    projects.branch("nova", project.id, `openbot/${kind}`, run.id); workspace = db.getCodeTaskWorkspace(run.id)!.rootPath;
    const checks = new CodeCheckService(db, projects, { executeCodeProject: async (_bot, directory, command) => {
      assert.equal(directory, workspace);
      assert.ok(["node measure-site.cjs", "node verify-site.cjs"].includes(command));
      assert.equal(readFileSync(path.join(workspace, "scenario.json"), "utf8"), inputs);
      assert.equal(readFileSync(path.join(workspace, "oracle.md"), "utf8"), oracle);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
      await context.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(5_000);
      try {
        await page.goto(base); await page.waitForFunction(() => document.body.dataset.ready === "true");
        if (command === "node verify-site.cjs") {
          assert.equal(await page.getByRole("heading", { name: "Review your order", exact: true }).count(), 1);
          assert.equal(await page.locator("html").getAttribute("lang"), "en");
          assert.equal(await page.getByText("Free returns within 30 days.", { exact: true }).count(), 1);
          const values = JSON.parse(inputs) as { quantities: number[]; unitPrice: number };
          for (const quantity of values.quantities) {
            await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill(String(quantity));
            await page.keyboard.press("Tab");
            assert.equal(await page.getByRole("button", { name: "Update total" }).evaluate((button) => button === document.activeElement), true);
            await page.keyboard.press("Enter");
            assert.equal(await page.getByRole("status").innerText(), `Total: €${quantity * values.unitPrice}`);
          }
          assert.equal(await page.getByRole("status").getAttribute("aria-live"), "polite");
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        return { code: 0, stdout: "Browser scenario passed", stderr: "", runtimeIdentity: `controlled-chromium-${browser.version()}-390x844-cold-context` };
      } catch (error) { return { code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error), runtimeIdentity: `controlled-chromium-${browser.version()}-390x844-cold-context` }; }
      finally { await context.close(); }
    } });
    const benchmark = new CodeBenchmarkService(db, projects, checks), input = { projectId: project.id, command: "node measure-site.cjs", regressionCommands: ["node verify-site.cjs"], guardedFiles: ["scenario.json", "oracle.md"] };
    const baseline = await benchmark.measure("nova", run.id, { ...input, phase: "baseline" }); assert.equal(baseline.experiment.baseline.status, "complete");
    projects.write("nova", project.id, "site.json", JSON.stringify({ delay: 0, broken: kind === "faster-but-broken", note: "candidate" }), run.id);
    projects.commit("nova", project.id, "Bounded candidate", ["site.json"], run.id);
    const result = await benchmark.measure("nova", run.id, { ...input, phase: "candidate" });
    if (kind === "improvable") assert.equal(result.comparison?.verdict, "measured_reduction");
    if (kind === "unchanged") assert.notEqual(result.comparison?.verdict, "measured_reduction", "Noise must not be called an improvement");
    if (kind === "faster-but-broken") assert.equal(result.comparison?.verdict, "unverified");
    assert.equal(readFileSync(path.join(source, "site.json"), "utf8"), initial); assert.equal(git("status", "--porcelain"), "");
    assert.equal(readFileSync(path.join(workspace, "oracle.md"), "utf8"), oracle);
    reports.push(`## ${kind}\n\n${renderCodeBenchmark(result.experiment)}`);
    outcomes.push({ kind, comparison: result.comparison, baselineSamplesMs: result.experiment.baseline.samplesMs, candidateSamplesMs: result.experiment.candidates[0].samplesMs, originalCheckoutPreserved: true });
  }
  const evidence = path.join(tmpdir(), "openbot-site-experiment-evidence.json");
  writeFileSync(evidence, JSON.stringify({ fixture: true, realBrowser: true, modelUsed: false, metric: "whole cold-context browser command duration, not Web Vitals", outcomes }, null, 2));
  writeFileSync(path.join(tmpdir(), "openbot-site-experiment-evidence.md"), "# Browser-based project experiment acceptance\n\nSynthetic site, controlled host Chromium, scripted candidates. This tests real DOM behavior, selected accessibility invariants and exact-commit comparison; it does not prove model repair, broad WCAG compliance, field Web Vitals or Docker browser compatibility.\n\n" + reports.join("\n\n"));
  console.log(JSON.stringify({ result: "PASS", evidence, outcomes }));
} finally { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); db.close(); rmSync(root, { recursive: true, force: true }); }
