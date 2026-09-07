import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { exportSpreadsheet, parseExportCsv } from "./spreadsheet-export.js";

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-xlsx-"));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const input = { filename: "report.xlsx", sheets: [{ name: "Expenses", csvPath: "source.csv", numberColumns: [3] }] };

test("CSV export preserves quotes, multiline cells, empty columns, and final rows", () => {
  assert.deepEqual(parseExportCsv('\ufeffid,note,amount\r\n001,"one, two\nthree ""quoted""",12.50\r\n002,,\r\n'), [
    ["id", "note", "amount"], ["001", 'one, two\nthree "quoted"', "12.50"], ["002", "", ""],
  ]);
  assert.deepEqual(parseExportCsv('a,b\n"",'), [["a", "b"], ["", ""]]);
  for (const value of ['', 'a,"unclosed', 'a,"closed" stray', 'a,un"quoted']) assert.throws(() => parseExportCsv(value));
});

test("XLSX export preserves sources and IDs, returns hashes, and never turns text into formulas", () => fixture((root) => {
  const csv = 'id,note,amount\n0001,=SUM(A1:A2),12.50\n0002,@literal,-2.25\n0003,,0\n';
  writeFileSync(path.join(root, "source.csv"), csv);
  const receipt = exportSpreadsheet(root, input);
  assert.equal(readFileSync(path.join(root, "source.csv"), "utf8"), csv);
  assert.equal(receipt.sheets[0].rows, 4);
  assert.equal(receipt.sheets[0].sourceSha256, createHash("sha256").update(csv).digest("hex"));
  const bytes = readFileSync(path.join(root, receipt.path));
  assert.equal(receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
  const archive = unzipSync(bytes), sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">0001/);
  assert.match(sheet, /<c r="C2" t="n"><v>12.50<\/v>/);
  assert.match(sheet, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">=SUM\(A1:A2\)/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(sheet, /state="frozen"/);
  assert.ok(Object.keys(archive).every((name) => !/vba|externalLink/i.test(name)));
  assert.throws(() => exportSpreadsheet(root, input), /already exists/);
  assert.deepEqual(readFileSync(path.join(root, receipt.path)), bytes);
}));

test("invalid numbers and Excel precision loss fail before creating a workbook", () => fixture((root) => {
  for (const value of ["=1+1", "12 EUR", "000123", "1234567890123456", "1e300", "NaN"]) {
    writeFileSync(path.join(root, "source.csv"), `id,note,amount\n1,test,${value}\n`);
    assert.throws(() => exportSpreadsheet(root, input), /at most 15 significant digits/);
    assert.deepEqual(readdirSync(root), ["source.csv"]);
  }
}));

test("CSV export rejects excessive rows, columns, cells, text, and invalid XML controls without truncation", () => {
  assert.throws(() => parseExportCsv("a\n".repeat(10_001)), /10,000 rows/);
  assert.throws(() => parseExportCsv(Array(257).fill("a").join(",")), /256 columns/);
  assert.throws(() => parseExportCsv((Array(256).fill("a").join(",") + "\n").repeat(391)), /100,000 cells/);
  assert.throws(() => parseExportCsv("x".repeat(32_768)), /32,767/);
  assert.throws(() => parseExportCsv("a,\u0000"), /control character/);
});

test("XLSX export denies traversal, hidden sources, symlinks, invalid sheet names, and malformed UTF-8", () => fixture((root) => {
  writeFileSync(path.join(root, "source.csv"), "a,b,c\nx,y,3");
  for (const filename of ["../escape.xlsx", "/tmp/escape.xlsx", ".hidden.xlsx", "report.csv"]) assert.throws(() => exportSpreadsheet(root, { ...input, filename }));
  for (const csvPath of ["../outside.csv", ".hidden.csv", "/tmp/outside.csv"]) assert.throws(() => exportSpreadsheet(root, { ...input, sheets: [{ ...input.sheets[0], csvPath }] }));
  symlinkSync(path.join(root, "source.csv"), path.join(root, "linked.csv"));
  assert.throws(() => exportSpreadsheet(root, { ...input, sheets: [{ ...input.sheets[0], csvPath: "linked.csv" }] }), /symbolic links/);
  symlinkSync(path.join(root, "source.csv"), path.join(root, "report.xlsx"));
  assert.throws(() => exportSpreadsheet(root, input), /already exists/);
  assert.equal(readFileSync(path.join(root, "source.csv"), "utf8"), "a,b,c\nx,y,3");
  for (const name of ["Bad/name", "'edge", "bad\u0000", " "]) assert.throws(() => exportSpreadsheet(root, { ...input, sheets: [{ ...input.sheets[0], name }] }));
  assert.throws(() => exportSpreadsheet(root, { ...input, sheets: [input.sheets[0], { ...input.sheets[0], name: "EXPENSES" }] }), /unique/);
  writeFileSync(path.join(root, "source.csv"), Buffer.from([0xff, 0xfe, 0x31]));
  assert.throws(() => exportSpreadsheet(root, { ...input, filename: "invalid.xlsx" }), /encoded data/);
}));

test("workbook supports multiple named sheets and escaping without trusting source markup", () => fixture((root) => {
  writeFileSync(path.join(root, "source.csv"), 'id,note\n001,<f>bad</f> & _x000D_\n');
  const result = exportSpreadsheet(root, { filename: "multi.xlsx", sheets: [{ name: "Raw & receipts", csvPath: "source.csv" }, { name: "Audit", csvPath: "source.csv" }] });
  const files = unzipSync(readFileSync(path.join(root, result.path)));
  assert.match(strFromU8(files["xl/workbook.xml"]), /name="Raw &amp; receipts"/);
  assert.match(strFromU8(files["xl/worksheets/sheet2.xml"]), /&lt;f&gt;bad&lt;\/f&gt; &amp; _x005F_x000D_/);
  assert.equal(result.sheets.length, 2);
}));
