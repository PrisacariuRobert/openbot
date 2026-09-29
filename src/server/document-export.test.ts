import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportDocument, inlineRuns, markdownToBody } from "./document-export.js";

test("Markdown becomes Word structure: title, headings, lists and inline styles", () => {
  const { body } = markdownToBody("# Cover letter\n\nDear **Team**,\n\n- First\n- Second\n\n1. One\n2. Two\n\nSee [site](https://example.com).", "Application");
  assert.match(body, /<w:pStyle w:val="Title"\/>/);
  assert.match(body, /<w:pStyle w:val="Heading1"\/>/);
  assert.equal((body.match(/<w:numId w:val="1"\/>/g) || []).length, 2, "two bullets");
  assert.equal((body.match(/<w:numId w:val="2"\/>/g) || []).length, 2, "two numbered items");
  assert.match(inlineRuns("a **b** *c* `d`"), /<w:b\/>.*<w:i\/>.*Menlo/);
  assert.ok(!inlineRuns("<script>&").includes("<script>"), "text is escaped");
});

test("a title that repeats the first heading is written once", () => {
  const { body } = markdownToBody("# Welcome to the Studio! 🎉\n\nHello.", "Welcome to the Studio! 🎉");
  assert.equal((body.match(/Welcome to the Studio!/g) || []).length, 1);
  assert.doesNotMatch(body, /w:val="Title"/);
});

test("exports a real .docx that macOS can read, without overwriting or leaving the workspace", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-docx-"));
  try {
    writeFileSync(path.join(root, "letter.md"), "# Junior Data Analyst\n\nDear Hiring Team,\n\nI am applying for the **junior data analyst** role.\n\n- SQL and Python\n- Clear reporting\n\nKind regards,\n[Your Name]\n");
    const result = exportDocument(root, { filename: "Cover Letter.docx", sourcePath: "letter.md", title: "Application" });
    assert.equal(result.saved, true);
    assert.ok(existsSync(path.join(root, "Cover Letter.docx")));
    if (process.platform === "darwin") {
      const text = spawnSync("textutil", ["-convert", "txt", "-stdout", path.join(root, "Cover Letter.docx")], { encoding: "utf8" });
      assert.equal(text.status, 0, text.stderr);
      for (const phrase of ["Application", "Junior Data Analyst", "junior data analyst", "SQL and Python", "[Your Name]"]) assert.ok(text.stdout.includes(phrase), `${phrase} in ${text.stdout}`);
    }
    assert.throws(() => exportDocument(root, { filename: "Cover Letter.docx", sourcePath: "letter.md" }), /already exists/);
    assert.throws(() => exportDocument(root, { filename: "x.docx", sourcePath: "../outside.md" }), /visible .md or .txt/);
    symlinkSync("/etc/hosts", path.join(root, "hosts.txt"));
    assert.throws(() => exportDocument(root, { filename: "y.docx", sourcePath: "hosts.txt" }), /symbolic links/);
    assert.throws(() => exportDocument(root, { filename: "../z.docx", sourcePath: "letter.md" }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
