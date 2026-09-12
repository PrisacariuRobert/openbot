import test from "node:test";
import assert from "node:assert/strict";
import {
  fileExt,
  fileFamily,
  fileLabel,
  fileSiglaClass,
} from "./file-glyph.js";

test("file extensions resolve to VS Code-style families", () => {
  assert.equal(fileFamily({ name: "brief.md" }), "text");
  assert.equal(fileFamily({ name: "app.tsx" }), "code");
  assert.equal(fileFamily({ name: "data.JSON" }), "data");
  assert.equal(fileFamily({ name: "recon.csv" }), "sheet");
  assert.equal(fileFamily({ name: "deck.pptx" }), "slide");
  assert.equal(fileFamily({ name: "memo.pdf" }), "pdf");
  assert.equal(fileFamily({ name: "shot.PNG" }), "image");
  assert.equal(fileFamily({ name: "clip.mp4" }), "media");
  assert.equal(fileFamily({ name: "take.zip" }), "archive");
  assert.equal(fileFamily({ name: "notes" }), "file");
});

test("kind and mime fall back when the extension is unknown", () => {
  assert.equal(fileFamily({ name: "report.abc", kind: "spreadsheet" }), "sheet");
  assert.equal(
    fileFamily({ name: "scan.abc", mime: "application/pdf" }),
    "pdf",
  );
  assert.equal(fileFamily({ name: "blob.abc", kind: "file" }), "file");
});

test("tile labels use the real extension, never a generic word", () => {
  assert.equal(fileLabel({ name: "brief.md" }), "MD");
  assert.equal(fileLabel({ name: "recon.csv" }), "CSV");
  assert.equal(fileLabel({ name: "archive.tar.gz" }), "GZ");
  assert.equal(fileLabel({ name: "notes", kind: "text" }), "DOC");
});

test("sigla classes carry the family", () => {
  assert.equal(
    fileSiglaClass({ name: "recon.csv" }),
    "file-sigla ft-sheet",
  );
  assert.equal(fileExt("a.b.cdefg"), "cdef");
  assert.equal(fileExt("noext"), "");
});
