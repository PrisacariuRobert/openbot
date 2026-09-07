import assert from "node:assert/strict";
import test from "node:test";
import { codeSecurityGuidance as scan } from "./code-security-guidance.js";

test("security advice names bounded risks and line locations without exposing source", () => {
  const result = scan("src/example.tsx", "// fixture\neval(input);\nelement.innerHTML = secret;\nexec(cmd);\nconst options = {rejectUnauthorized: false};");
  assert.deepEqual(result.warnings.map((warning) => warning.rule), ["shell-command", "dynamic-code", "html-injection", "tls-disabled"]);
  assert.equal(result.warnings.find((warning) => warning.rule === "dynamic-code")?.line, 2);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.equal(result.kind, "advisory"); assert.match(result.coverage, /not a security audit/);
  assert.deepEqual(scan("src/example.tsx", "eval(input);").warnings, scan("src/example.tsx", "eval(input);").warnings);
});
test("safe YAML, data files and non-eval methods do not trigger these rules", () => {
  assert.deepEqual(scan("notes.md", "eval(input); pickle.loads(data)").warnings, []);
  assert.deepEqual(scan("data.json", '{"command":"eval(input)"}').warnings, []);
  assert.deepEqual(scan("safe.ts", 'model.eval(); spawn("tool", args);').warnings, []);
  assert.deepEqual(scan("safe.py", "yaml.safe_load(text)\nyaml.load(text, Loader=yaml.SafeLoader)").warnings, []);
  assert.ok(scan("mixed.py", "yaml.load(text, Loader=yaml.SafeLoader)\nyaml.load(text)").warnings.some((warning) => warning.rule === "unsafe-yaml"));
});
test("Python, crypto and workflow advisories are bounded and describe partial coverage", () => {
  assert.equal(scan("load.py", "pickle.loads(data)\nsubprocess.run(cmd, shell=True)\nverify=False\nAES.MODE_ECB").warnings.length, 4);
  assert.equal(scan(".github/workflows/ci.yml", "run: echo ${{ github.event.issue.title }}").warnings[0]?.rule, "workflow-input");
  assert.equal(scan("large.js", " ".repeat(1_000_001)).truncated, true);
  assert.equal(scan("x.js", "eval(x);".repeat(10_000)).warnings.length, 1);
});
