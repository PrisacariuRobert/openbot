/**
 * Task R3, run by .github/workflows/gallery-submission.yml: reads a gallery issue from
 * ISSUE_BODY, writes site/teammates/<slug>.json and its index entry, and prints the
 * slug and name for the next steps. On a problem it writes the reason for the issue
 * comment and exits 1. The issue text is data; nothing in it is run.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyGallerySubmission } from "../src/server/gallery-submission.js";

try {
  const { slug, name } = applyGallerySubmission(path.resolve(import.meta.dirname, "..", "site", "teammates"), process.env.ISSUE_BODY || "");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\nname=${name.replace(/[\r\n]/g, " ")}\n`);
  console.log(`Added ${name} as ${slug}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.env.RUNNER_TEMP) writeFileSync(path.join(process.env.RUNNER_TEMP, "gallery-error.txt"), message);
  console.error(message);
  process.exit(1);
}
