import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { inspectAttachment } from "./attachments.js";

async function inspect(name: string, data: string | Uint8Array) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-table-coverage-"));
  try { const file = path.join(root, name); writeFileSync(file, data); return await inspectAttachment(file, name, "application/octet-stream"); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function workbook(sheet: string, extras: Record<string, string> = {}) {
  return zipSync(Object.fromEntries(Object.entries({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Actual expenses" sheetId="8" r:id="rId8"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId8" Target="worksheets/costs.xml"/></Relationships>',
    "xl/worksheets/costs.xml": `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
    ...extras,
  }).map(([name, content]) => [name, strToU8(content)])));
}

test("CSV reports all counted rows but explicitly limits preview coverage", async () => {
  const result = await inspect("expenses.csv", "id,amount\n" + Array.from({ length: 550 }, (_, i) => `${i},10`).join("\n"));
  assert.equal(result.metadata.rows, 551);
  assert.equal(result.metadata.rowsPreviewed, 500);
  assert.equal(result.processingStatus, "partial");
  assert.match(result.extractedText!, /PARTIAL.*Do not calculate whole-file totals/);
  assert.doesNotMatch(result.extractedText!, /Row 501:/);
});
test("quoted CSV retains multiline values, blank cells, escaped quotes and CRLF row boundaries", async () => {
  const result = await inspect("notes.csv", '\uFEFFid,notes,amount\r\nA,"first\nsecond, \"\"quote\"\"",\r\nB,,0');
  assert.equal(result.metadata.rows, 3);
  assert.equal(result.processingStatus, "ready");
  assert.ok(result.extractedText!.includes('Row 2: ["A","first\\nsecond, \\"quote\\"",""]'));
  assert.ok(result.extractedText!.includes('Row 3: ["B","","0"]'));
  const malformed = await inspect("broken.csv", 'id,amount\nA,"10');
  assert.equal(malformed.processingStatus, "partial");
  assert.equal(malformed.extractedText, null);
});
test("wide or text-clipped tables cannot advertise a complete preview", async () => {
  const wide = await inspect("wide.tsv", Array.from({ length: 35 }, (_, i) => `col${i}`).join("\t"));
  assert.equal(wide.metadata.columns, 35);
  assert.equal(wide.processingStatus, "partial");
  const long = await inspect("long.csv", 'id,note\n1,"' + "x".repeat(100_500) + '"');
  assert.equal(long.processingStatus, "partial");
  assert.match(long.extractedText!, /^Coverage: PARTIAL/);
});
test("Excel reads relationship-mapped sheet names and preserves sparse addresses and empty cells", async () => {
  const result = await inspect("sparse.xlsx", workbook('<row r="2"><c r="A2" t="inlineStr"><is><t>Receipt</t></is></c><c r="C2"><v>42</v></c><c r="D2"/></row><row r="900"><c r="F900"><v>9</v></c></row>'));
  assert.match(result.extractedText!, /Sheet: Actual expenses/);
  assert.match(result.extractedText!, /A2="Receipt"\tC2="42"\tD2=""/);
  assert.match(result.extractedText!, /F900="9"/);
  assert.equal(result.processingStatus, "ready");
});
test("formula caches, missing shared strings, and excluded archive parts remain partial", async () => {
  const formula = await inspect("formula.xlsx", workbook('<row r="1"><c r="B1"><f>SUM(B2:B9)</f><v>999</v></c><c r="C1" t="s"><v>17</v></c></row>'));
  assert.equal(formula.processingStatus, "partial");
  assert.match(formula.extractedText!, /FORMULA CACHE: may be stale; not recalculated/);
  assert.match(formula.extractedText!, /Unavailable shared string/);
  const skipped = await inspect("large.xlsx", workbook('<row r="1"><c r="A1"><v>1</v></c></row>', { "xl/worksheets/extra.xml": " ".repeat(3_000_001) }));
  assert.equal(skipped.processingStatus, "partial");
  assert.match(skipped.extractedText!, /^Coverage: PARTIAL/);
});
