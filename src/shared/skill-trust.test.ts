import assert from "node:assert/strict";
import test from "node:test";
import { diffLines, diffSkill, skillScripts } from "./skill-trust.js";

test("a diff keeps three lines of context around each change and drops the rest", () => {
  const before = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
  const after = before.replace("line 10", "line ten");
  const lines = diffLines(before, after);
  assert.deepEqual(lines.map((line) => `${line.kind}:${line.text}`), ["same:line 7", "same:line 8", "same:line 9", "removed:line 10", "added:line ten", "same:line 11", "same:line 12", "same:line 13"]);
});

test("a skill diff names added, removed and changed files; unchanged files are left out", () => {
  const diff = diffSkill({ "SKILL.md": "a\nb", "references/old.md": "x", "LICENSE.txt": "MIT" }, { "SKILL.md": "a\nc", "scripts/run.py": "print(1)", "LICENSE.txt": "MIT" });
  assert.deepEqual(diff.map((file) => [file.file, file.status, file.added, file.removed]), [["SKILL.md", "changed", 1, 1], ["references/old.md", "removed", 0, 1], ["scripts/run.py", "added", 1, 0]]);
  assert.deepEqual(skillScripts({ "SKILL.md": "", "scripts/b.sh": "", "scripts/a.py": "", "references/x.md": "" }), ["scripts/a.py", "scripts/b.sh"]);
});
