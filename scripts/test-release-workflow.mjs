import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"));
const signing = workflow.jobs["sign-notarize"];
const publishing = workflow.jobs.publish;

test("the release signs artifacts before creating a draft, without uploading to a nonexistent release", () => {
  assert.ok(publishing.needs.includes("sign-notarize"));
  const signerCommands = signing.steps.map((step) => step.run ?? "").join("\n");
  assert.doesNotMatch(signerCommands, /gh release/);
  const finalArtifact = signing.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(finalArtifact.with.name, "openbot-darwin-arm64-final");
  assert.equal(finalArtifact.with["if-no-files-found"], "error");
  assert.equal(finalArtifact.if, undefined, "The final artifact is also produced when no certificate exists.");
  assert.match(finalArtifact.with.path, /signed\/\*\.tar\.gz/);
  assert.match(finalArtifact.with.path, /signed\/\*\.sha256/);
  const downloads = publishing.steps.filter((step) => step.uses?.startsWith("actions/download-artifact@"));
  assert.deepEqual(downloads.map((step) => step.with.name).sort(), ["openbot-darwin-arm64-final", "openbot-linux-x64", "openbot-win-x64"]);
  const create = publishing.steps.find((step) => step.run?.includes("gh release create"));
  assert.match(create.run, /--draft\b/);
  assert.match(create.run, /--verify-tag\b/);
});

test("optional signing uses a supported step condition and configured signing failures block publishing", () => {
  assert.doesNotMatch(signing.if, /secrets\./);
  assert.equal(signing["continue-on-error"], undefined);
  const configuration = signing.steps.find((step) => step.id === "signing");
  assert.match(configuration.run, /enabled=true/);
  assert.match(configuration.run, /enabled=false/);
  assert.ok(configuration.env.MACOS_CERT_P12);
  const sign = signing.steps.find((step) => step.name === "Sign and notarize");
  assert.equal(sign.if, "steps.signing.outputs.enabled == 'true'");
  assert.equal(sign["continue-on-error"], undefined);
  assert.match(sign.run, /set -eu/);
  assert.match(sign.run, /trap cleanup EXIT/);
  assert.doesNotMatch(publishing.if, /always\(|!cancelled\(/, "Failed dependencies must retain GitHub's default success gate.");
});
