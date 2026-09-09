import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { CodeProjectManager } from "../src/server/code-projects.js";
import { CodeCheckService } from "../src/server/code-checks.js";
import { ComputerManager } from "../src/server/runtime.js";

// No model, owner repository, package installation, or external write is used.
// Docker may fetch the configured official runtime images if not cached.
// Colima's default mounts include the owner's home, not macOS /var/folders.
const fixtureBase = path.resolve(import.meta.dirname, "../.openbot/runtime-tests");
mkdirSync(fixtureBase, { recursive: true });
const root = mkdtempSync(path.join(fixtureBase, "code-"));
const db = new OpenBotDatabase(root);
const projects = new CodeProjectManager(db, root);
const computer = new ComputerManager(db);
const service = new CodeCheckService(db, projects, computer);
let passed = false;
const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
try {
  if (!(await computer.available())) {
    // Environmental skip, not a failure: this acceptance test needs a
    // container host. CI provides one; a local run without Docker reports
    // the skip and passes the suite honestly.
    console.log("SKIP: Docker/Colima is not running on this host. Start it to run the real-runtime acceptance checks.");
    process.exit(0);
  }
  db.updateBot("nova", { computerEnabled: true });
  for (const kind of ["node", "python"] as const) {
    const source = path.join(root, kind);
    mkdirSync(source);
    const file = kind === "node" ? "total.cjs" : "total.py";
    const oracle = kind === "node" ? "total.test.cjs" : "test_total.py";
    const broken = kind === "node" ? "module.exports = items => items.reduce((sum, item) => sum + item.price, 0);\n" : "def total(items):\n    return sum(item['price'] for item in items)\n";
    const test = kind === "node" ? "const assert = require('node:assert/strict'); const total = require('./total.cjs'); assert.equal(total([{price:12,quantity:3},{price:5,quantity:2}]),46); assert.equal(total([]),0);\n" : "import unittest\nfrom total import total\nclass Totals(unittest.TestCase):\n    def test_quantities(self):\n        self.assertEqual(total([{'price':12,'quantity':3},{'price':5,'quantity':2}]),46)\n    def test_empty(self):\n        self.assertEqual(total([]),0)\n";
    writeFileSync(path.join(source, file), broken);
    writeFileSync(path.join(source, oracle), test);
    git(source, "init", "-b", "main");
    git(source, "add", ".");
    git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "Independent failing fixture");
    const project = db.createCodeProject({ name: `${kind} fixture`, ...projects.inspectRoot(source), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }] });
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Fix quantities and prove the exact repaired commit." });
    projects.branch("nova", project.id, `openbot/verify-${kind}`, run.id);
    const command = kind === "node" ? "node total.test.cjs" : "python3 -m unittest -v";
    const failing = await service.execute("nova", project.id, run.id, command);
    assert.equal(failing.check.status, "failed", failing.stderr);
    assert.match(failing.stderr + failing.stdout, /AssertionError/, "Reproduce the oracle failure, not a missing runtime or mount.");
    assert.throws(() => projects.assertCheckedCommit("nova", project.id, run.id));
    projects.replace("nova", project.id, file, kind === "node" ? "sum + item.price" : "item['price'] for", kind === "node" ? "sum + item.price * item.quantity" : "item['price'] * item['quantity'] for", 1, run.id);
    projects.commit("nova", project.id, "Fix quantity totals", [file], run.id);
    const passing = await service.execute("nova", project.id, run.id, command);
    assert.equal(passing.check.status, "passed", passing.stderr);
    assert.doesNotThrow(() => projects.assertCheckedCommit("nova", project.id, run.id));
    assert.notEqual(failing.check.headCommit, passing.check.headCommit);
    assert.equal(readFileSync(path.join(source, file), "utf8"), broken);
    assert.equal(readFileSync(path.join(db.getCodeTaskWorkspace(run.id)!.rootPath, oracle), "utf8"), test);
    assert.equal(git(source, "status", "--porcelain"), "");
    console.log(JSON.stringify({ result: "PASS", toolchain: kind, runtime: "real network-disabled Docker", reproducedFailure: true, checkedRepairedCommit: true, originalCheckoutPreserved: true, independentOracleUnchanged: true }));
  }
  passed = true;
} finally {
  db.close();
  if (passed) rmSync(root, { recursive: true, force: true });
  else console.error(`Disposable failure fixture retained at ${root}`);
}
