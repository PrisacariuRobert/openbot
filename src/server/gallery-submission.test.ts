import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { GALLERY_ISSUE_FORM, gallerySlug, galleryIssueUrl, MAX_FORM_URL, readGalleryIssue } from "../shared/gallery-submission.js";
import { applyGallerySubmission } from "./gallery-submission.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const bundle = { kind: "openbot-teammate", version: 1, bot: { name: "Plant sitter", emoji: "🌿", mascot: "sprout", color: "#299575", role: "Reminds you to water", instructions: "Remind the owner to water each plant on its own schedule. Never buy anything; ask before adding a reminder." }, skills: [], routines: [] };
const issue = (fields: { slug?: string; about?: string; json?: string }) => [
  "### Short name for the gallery", "", fields.slug ?? "plant-sitter", "",
  "### One sentence about it", "", fields.about ?? "Keeps track of which plant needs water when, and reminds you on the right day.", "",
  "### Teammate file", "", "```json", fields.json ?? JSON.stringify(bundle, null, 2), "```", "",
  "### Before you submit", "", "- [X] It contains no personal details", "",
].join("\n");

test("the form is prefilled with the teammate, or the file is copied when it's too long for an address", () => {
  const small = galleryIssueUrl({ bot: { name: "Plant sitter" }, about: "About it" }, JSON.stringify(bundle));
  assert.equal(small.includesFile, true);
  const url = new URL(small.url);
  assert.equal(`${url.origin}${url.pathname}`, GALLERY_ISSUE_FORM);
  assert.equal(url.searchParams.get("template"), "gallery_submission.yml");
  assert.equal(url.searchParams.get("title"), "[Gallery] Plant sitter");
  assert.equal(url.searchParams.get("slug"), "plant-sitter");
  assert.deepEqual(JSON.parse(url.searchParams.get("teammate")!), bundle);
  const large = galleryIssueUrl({ bot: { name: "Plant sitter" } }, "x".repeat(MAX_FORM_URL));
  assert.equal(large.includesFile, false);
  assert.equal(new URL(large.url).searchParams.has("teammate"), false);
  assert.ok(large.url.length <= MAX_FORM_URL);
  assert.equal(gallerySlug("Café Planner!"), "cafe-planner");
});

test("a submitted issue becomes a gallery file and index entry that pass the gallery's own checks", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-gallery-submit-"));
  try {
    cpSync(path.join(ROOT, "site", "teammates"), dir, { recursive: true });
    assert.deepEqual(applyGallerySubmission(dir, issue({})), { slug: "plant-sitter", name: "Plant sitter" });
    const saved = JSON.parse(readFileSync(path.join(dir, "plant-sitter.json"), "utf8"));
    assert.equal(saved.about, "Keeps track of which plant needs water when, and reminds you on the right day.");
    const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as Array<{ slug: string; mascot: string }>;
    assert.equal(index.at(-1)!.slug, "plant-sitter");
    assert.throws(() => applyGallerySubmission(dir, issue({})), /already has a teammate called plant-sitter/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bad submissions say what to fix and write nothing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-gallery-submit-"));
  try {
    cpSync(path.join(ROOT, "site", "teammates"), dir, { recursive: true });
    const before = readFileSync(path.join(dir, "index.json"), "utf8");
    for (const [fields, message] of [
      [{ slug: "Plant Sitter" }, /lowercase letters/],
      [{ slug: "../escape" }, /lowercase letters/],
      [{ about: "Short." }, /30 to 240 characters/],
      [{ json: "{ not json" }, /isn't valid JSON/],
      [{ json: JSON.stringify({ hello: "world" }) }, /isn't a Sidemates teammate/],
      [{ json: JSON.stringify({ ...bundle, bot: { ...bundle.bot, instructions: `Use the key sk-${"a".repeat(30)} for everything.` } }) }, /key or password/],
    ] as const) assert.throws(() => applyGallerySubmission(dir, issue(fields)), message, JSON.stringify(fields).slice(0, 60));
    assert.equal(readFileSync(path.join(dir, "index.json"), "utf8"), before);
    assert.match(String((readGalleryIssue("no headings here") as { error: string }).error), /short name/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the workflow passes the issue text only through the environment, with pinned actions and narrow permissions", () => {
  const raw = readFileSync(path.join(ROOT, ".github", "workflows", "gallery-submission.yml"), "utf8");
  const workflow = parse(raw) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, { if: string; steps: Array<{ run?: string; uses?: string; env?: Record<string, string> }> }> };
  assert.deepEqual(Object.keys(workflow.on), ["issues"]);
  assert.deepEqual(workflow.permissions, { contents: "write", "pull-requests": "write", issues: "write" });
  const steps = workflow.jobs.submit!.steps;
  for (const step of steps) {
    if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/, `${step.uses} is pinned`);
    assert.doesNotMatch(step.run ?? "", /\$\{\{\s*github\.event/, "no issue text inside a shell script");
  }
  assert.equal(steps.find((step) => step.env?.ISSUE_BODY)?.env?.ISSUE_BODY, "${{ github.event.issue.body }}");
  assert.ok(steps.some((step) => step.run?.includes("npx tsx --test src/server/gallery.test.ts")), "the gallery's own check runs");
  const form = parse(readFileSync(path.join(ROOT, ".github", "ISSUE_TEMPLATE", "gallery_submission.yml"), "utf8")) as { title: string; body: Array<{ id?: string }> };
  assert.equal(form.title, "[Gallery] ");
  assert.deepEqual(form.body.map((field) => field.id).filter(Boolean), ["slug", "about", "teammate", "checks"], "the field ids the studio prefills");
});
