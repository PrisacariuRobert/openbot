import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { exportSpreadsheet } from "./spreadsheet-export.js";
import { inspectWorkspaceSpreadsheet } from "./spreadsheet-inspect.js";

function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-inspect-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "source.csv"), 'ID,Amount,Total\n001,12,\n002,-2,=1+1\n');
  exportSpreadsheet(root, { filename: "saved.xlsx", sheets: [{ name: "Original", csvPath: "source.csv", numberColumns: [2], formulas: [{ cell: "C2", formula: "=SUM(B2:B3)" }] }] });
  return root;
}

test("reopens saved workbook bytes, retains text IDs and distinguishes formulas from literal strings without calculation", t => {
  const root = fixture(t), before = readFileSync(path.join(root, "saved.xlsx"));
  const result = inspectWorkspaceSpreadsheet(root, { path: "saved.xlsx" });
  assert.equal(result.source.sha256, createHash("sha256").update(before).digest("hex"));
  assert.equal(result.source.bytes, before.length);
  assert.equal(result.metadata.formulasPreviewed, 1);
  assert.equal(result.metadata.partial, true);
  assert.match(result.extractedText!, /A2="001"/);
  assert.match(result.extractedText!, /C2="" \[FORMULA CACHE: may be stale; not recalculated\] \[STORED FORMULA: "SUM\(B2:B3\)"\]/);
  assert.match(result.extractedText!, /C3="=1\+1"/);
  assert.match(result.instructions, /does not recalculate/);
  assert.deepEqual(readFileSync(path.join(root, "saved.xlsx")), before);
});

test("inspection refuses traversal, hidden files, symlinks, oversized files and non-workbooks", t => {
  const root = fixture(t);
  symlinkSync(path.join(root, "saved.xlsx"), path.join(root, "link.xlsx"));
  mkdirSync(path.join(root, "folder"));
  symlinkSync(path.join(root, "folder"), path.join(root, "shortcut"));
  writeFileSync(path.join(root, "folder/saved.xlsx"), readFileSync(path.join(root, "saved.xlsx")));
  writeFileSync(path.join(root, "huge.xlsx"), Buffer.alloc(8 * 1024 * 1024 + 1));
  writeFileSync(path.join(root, "broken.xlsx"), 'not a workbook');
  writeFileSync(path.join(root, "empty.xlsx"), zipSync({ "other.txt": strToU8("nothing") }));
  for (const filename of ["../saved.xlsx", "..\\saved.xlsx", path.join(root, "saved.xlsx"), ".secret.xlsx", "link.xlsx", "shortcut/saved.xlsx", "source.csv", "huge.xlsx", "broken.xlsx", "empty.xlsx"]) {
    assert.throws(() => inspectWorkspaceSpreadsheet(root, { path: filename }), filename);
  }
  assert.throws(() => inspectWorkspaceSpreadsheet(root, { path: "saved.xlsx", calculate: true }));
});

test("external formula definitions stay inert and missing shared definitions remain explicitly unresolved", t => {
  const root = fixture(t);
  const formula = 'WEBSERVICE(&quot;https://example.invalid/data&quot;)';
  writeFileSync(path.join(root, "untrusted.xlsx"), zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Data" sheetId="1"/></sheets></workbook>'),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1"><f>${formula}</f><v>99</v></c><c r="B1"><f t="shared" si="0"/><v>2</v></c></row></sheetData></worksheet>`),
  }));
  const result = inspectWorkspaceSpreadsheet(root, { path: "untrusted.xlsx" });
  assert.match(result.extractedText!, /WEBSERVICE/);
  assert.match(result.extractedText!, /shared\/array definition unavailable here/);
  assert.match(result.extractedText!, /never executed/);
  assert.equal(result.metadata.formulasPreviewed, 2);
});
