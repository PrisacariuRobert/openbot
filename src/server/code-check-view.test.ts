import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCodeCheckView } from "./code-check-view.js";

test("check views omit private paths, preserve source, and detect tracked changes without following replacement links", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-check-view-"));
  const source = path.join(root, "source"), data = path.join(source, "private-data");
  mkdirSync(path.join(source, "lib"), { recursive: true });
  writeFileSync(path.join(source, "lib", "total.py"), "original\n");
  writeFileSync(path.join(source, ".env"), "SECRET=fixture\n");
  for (const args of [["init"], ["add", "."]]) assert.equal(spawnSync("git", args, { cwd: source, stdio: "ignore" }).status, 0);
  const view = createCodeCheckView(source, data, [".git", ".env"]);
  try {
    assert.ok(!existsSync(path.join(view.rootPath, ".git")));
    assert.ok(!existsSync(path.join(view.rootPath, ".env")));
    assert.ok(!existsSync(path.join(view.rootPath, "private-data")), "Never recursively copy the private runner into its own check view.");
    assert.equal(view.unchanged(), true);
    writeFileSync(path.join(view.rootPath, "generated.txt"), "disposable build output");
    assert.equal(view.unchanged(), true);
    writeFileSync(path.join(view.rootPath, "lib", "total.py"), "changed\n");
    assert.equal(view.unchanged(), false);
    assert.equal(readFileSync(path.join(source, "lib", "total.py"), "utf8"), "original\n");
    rmSync(path.join(view.rootPath, "lib"), { recursive: true });
    symlinkSync(path.join(source, "lib"), path.join(view.rootPath, "lib"));
    assert.equal(view.unchanged(), false, "A symlinked parent is not a verified source file, even if contents match.");
  } finally { view.dispose(); rmSync(root, { recursive: true, force: true }); }
});
