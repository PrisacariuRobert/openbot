import path from "node:path";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CELLS = 100_000;
const formulaCell = z.object({ cell: z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,3}$/), formula: z.string().min(2).max(1000) }).strict();
const sheetName = z.string().min(1).max(31).refine((name) => !/[\\/?*\[\]:\x00-\x1f]/.test(name) && name.trim() === name && !name.startsWith("'") && !name.endsWith("'"), "Choose a valid Excel sheet name.");
export const spreadsheetExportInput = z.object({
  filename: z.string().max(160).regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*\.xlsx$/, "Choose a new .xlsx filename without folders."),
  sheets: z.array(z.object({
    name: sheetName,
    csvPath: z.string().min(1).max(2048),
    numberColumns: z.array(z.number().int().min(1).max(256)).max(256).default([]),
    formulas: z.array(formulaCell).max(10_000).default([]),
  }).strict()).min(1).max(8),
}).strict().refine((input) => new Set(input.sheets.map((sheet) => sheet.name.toLowerCase())).size === input.sheets.length, "Sheet names must be unique.");

// Strict, bounded export: unlike a preview, it must never silently drop rows/cells.
export function parseExportCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  if (!text.length) throw new Error("The CSV is empty. Add a header row before exporting.");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closed = false, cells = 0;
  const cell = () => {
    if (value.length > 32_767) throw new Error("A cell exceeds Excel's 32,767-character limit.");
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new Error("The CSV contains a control character Excel cannot preserve.");
    row.push(value); value = ""; closed = false;
    if (row.length > 256 || ++cells > MAX_CELLS) throw new Error("Export is limited to 256 columns and 100,000 cells. Split this CSV first.");
  };
  const line = () => {
    cell(); rows.push(row); row = [];
    if (rows.length > 10_000) throw new Error("Export is limited to 10,000 rows per sheet. Split this CSV first.");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += char;
    } else if (char === ",") cell();
    else if (char === "\n" || char === "\r") { line(); if (char === "\r" && text[i + 1] === "\n") i++; }
    else if (char === '"' && !value && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error("The CSV has malformed quoting. Fix it before exporting.");
      value += char;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted cell.");
  if (value || closed || row.length || !/[\r\n]$/.test(text)) line();
  return rows;
}

const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/\r/g, "&#13;");
// Literal strings resembling SpreadsheetML escapes must not be decoded into different text.
const cellText = (value: string) => xml(value.replace(/_x[0-9a-f]{4}_/gi, (match) => `_x005F_${match.slice(1)}`));
const documentXml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

export function readWorkspaceCsv(root: string, relative: string) {
  const parts = relative.split(/[\\/]/);
  if (path.isAbsolute(relative) || parts.some((part) => !part || part.startsWith(".")) || !relative.toLowerCase().endsWith(".csv")) throw new Error("Choose a visible .csv file relative to this teammate's workspace.");
  let target = root;
  for (const part of parts) {
    target = path.join(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error("CSV sources cannot use symbolic links.");
  }
  if (!realpathSync(target).startsWith(`${root}${path.sep}`)) throw new Error("The CSV must be inside this workspace.");
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("Choose a regular CSV file no larger than 2 MiB.");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0, read = 0;
    while (length < buffer.length && (read = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += read;
    if (length > MAX_BYTES) throw new Error("The CSV exceeds 2 MiB.");
    const bytes = buffer.subarray(0, length);
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), sha256: hash(bytes) };
  } finally { closeSync(fd); }
}

// Explicit authoring only: CSV strings never become executable formulas.
// The small grammar excludes external books, DDE, macros and dynamic/network
// functions. No formula is evaluated as host code.
const formulaFunctions = new Set(['SUM', 'SUMIF', 'SUMIFS', 'COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'IF', 'AND', 'OR', 'NOT', 'ROUND', 'MIN', 'MAX', 'ABS', 'AVERAGE']);
function validateFormula(formula: string, names: Set<string>) {
  if (!formula.startsWith('=') || !/[A-Z0-9]/.test(formula.slice(1)) || /[\x00-\x1f\[\]|{}\\]/.test(formula)) throw new Error('Use an explicit local formula without external references or special commands.');
  let rest = formula.slice(1), depth = 0;
  while (rest.trim()) {
    rest = rest.trimStart();
    const string = rest.match(/^"(?:[^"]|"")*"/);
    if (string) { rest = rest.slice(string[0].length); continue; }
    const reference = rest.match(/^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_ ]*))!)?\$?([A-Z]{1,2})\$?([1-9]\d{0,3})(?![A-Za-z0-9_])/);
    if (reference) {
      const name = reference[1]?.replace(/''/g, "'") || reference[2];
      if (name && !names.has(name.toLowerCase())) throw new Error(`Formula references an unknown sheet: ${name}.`);
      const col = [...reference[3]!].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
      if (col > 256) throw new Error('Formula references are limited to columns A–IV and rows 1–9999.');
      rest = rest.slice(reference[0].length); continue;
    }
    const fn = rest.match(/^([A-Z]+)\s*(?=\()/);
    if (fn) {
      if (!formulaFunctions.has(fn[1]!)) throw new Error(`Unsupported formula function ${fn[1]}. Use basic local arithmetic, SUMIFS, COUNTIFS or IF.`);
      rest = rest.slice(fn[0].length); continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) { rest = rest.slice(number[0].length); continue; }
    const bool = rest.match(/^(?:TRUE|FALSE)\b/);
    if (bool) { rest = rest.slice(bool[0].length); continue; }
    const char = rest[0]!;
    if (!'()+-*/^%,:<>='.includes(char)) throw new Error('Use basic formulas with bounded A1 references, not whole columns, named or dynamic references.');
    if (char === '(') depth++;
    if (char === ')' && --depth < 0) throw new Error('The formula has unbalanced parentheses.');
    rest = rest.slice(1);
  }
  if (depth !== 0) throw new Error('The formula has unbalanced parentheses.');
}

export function exportSpreadsheet(workspace: string, args: unknown) {
  const input = spreadsheetExportInput.parse(args);
  if (!lstatSync(workspace).isDirectory() || lstatSync(workspace).isSymbolicLink()) throw new Error("The teammate workspace is not available.");
  const root = realpathSync(workspace);
  const names = new Set(input.sheets.map(sheet => sheet.name.toLowerCase()));
  let formulaCount = 0, literalFormulaCells = 0;
  let totalCells = 0;
  const sheets = input.sheets.map((sheet) => {
    const source = readWorkspaceCsv(root, sheet.csvPath), rows = parseExportCsv(source.content);
    const columns = Math.max(...rows.map((row) => row.length));
    totalCells += rows.reduce((sum, row) => sum + row.length, 0);
    if (totalCells > MAX_CELLS) throw new Error("This workbook exceeds 100,000 cells. Export fewer sheets at once.");
    if (sheet.numberColumns.some((column) => column > columns)) throw new Error(`A number column is outside sheet ${sheet.name}.`);
    const numbers = new Set(sheet.numberColumns);
    const formulas = new Map<string, string>();
    for (const item of sheet.formulas) {
      validateFormula(item.formula, names);
      if (formulas.has(item.cell)) throw new Error(`Duplicate formula destination ${sheet.name}!${item.cell}.`);
      formulas.set(item.cell, item.formula);
    }
    let appliedFormulas = 0;
    const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
      const ref = `${columnName(c)}${r + 1}`;
      const formula = formulas.get(ref);
      if (formula) {
        if (r === 0) throw new Error('Formula destinations cannot replace header labels.');
        if (value.trim() && value !== formula) throw new Error(`Formula destination ${sheet.name}!${ref} must be empty or contain that exact formula as text. Preserve source inputs.`);
        appliedFormulas++;
        return `<c r="${ref}"><f>${xml(formula.slice(1))}</f></c>`;
      }
      if (/^\s*=/.test(value)) literalFormulaCells++;
      if (r > 0 && numbers.has(c + 1) && value !== "") {
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || value.replace(/[-.]/g, "").replace(/^0+/, "").length > 15 || (Number(value) === 0 && /[1-9]/.test(value))) throw new Error(`Sheet ${sheet.name}, ${ref}: use an unformatted number of at most 15 significant digits, or keep this column as text.`);
        return `<c r="${ref}" t="n"><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${cellText(value)}</t></is></c>`;
    }).join("")}</row>`).join("");
    if (appliedFormulas !== formulas.size) throw new Error(`A formula destination in ${sheet.name} is outside the CSV data area. Add an empty destination cell first.`);
    formulaCount += appliedFormulas;
    const range = `A1:${columnName(columns - 1)}${rows.length}`;
    return { ...sheet, rows: rows.length, columns, sourceSha256: source.sha256, xml: documentXml(`<worksheet xmlns="${ns}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="${columns}" width="22" customWidth="1"/></cols><sheetData>${data}</sheetData><autoFilter ref="${range}"/></worksheet>`) };
  });
  const files: Record<string, Uint8Array> = {};
  const add = (filename: string, content: string) => { files[filename] = strToU8(content); };
  add("[Content_Types].xml", documentXml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`));
  add("_rels/.rels", documentXml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`));
  add("xl/workbook.xml", documentXml(`<workbook xmlns="${ns}" xmlns:r="${relNs}"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`));
  add("xl/_rels/workbook.xml.rels", documentXml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${relNs}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="${relNs}/styles" Target="styles.xml"/></Relationships>`));
  add("xl/styles.xml", documentXml(`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF443674"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`));
  sheets.forEach((sheet, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheet.xml));
  const workbook = zipSync(files, { level: 6 });
  const target = path.join(root, input.filename);
  // Exclusive creation: a retry can never replace an existing workbook or symlink.
  let fd: number;
  try { fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("That workbook already exists. Choose a new filename; existing files are never replaced.");
    throw error;
  }
  try { writeFileSync(fd, workbook); fsyncSync(fd); }
  catch (error) { closeSync(fd); unlinkSync(target); throw error; }
  closeSync(fd);
  return {
    saved: true, path: input.filename, bytes: workbook.length, sha256: hash(workbook), formulaCount, literalFormulaCells,
    calculation: formulaCount ? 'Explicit local formulas are stored as real Excel formulas. Recalculate and verify in a spreadsheet reader; export alone does not prove their results.' : 'This workbook contains no calculating formulas.',
    warning: literalFormulaCells ? `${literalFormulaCells} cells that look like formulas were kept as literal text. They will NOT calculate. Use explicit formulas entries for calculations; never claim these text cells are live formulas.` : null,
    sheets: sheets.map(({ name, csvPath, rows, columns, numberColumns, sourceSha256 }) => ({ name, csvPath, rows, columns, numberColumns, sourceSha256 })),
    instructions: "Reopen the saved file with spreadsheet_inspect({path: filename}) to check stored cells and formulas, without Docker. Then link the .xlsx file in your final answer. Rows include headers. Sources were not modified. CSV values stay literal; only selected columns become numbers and explicit formulas entries become formulas. Nothing is calculated on the host by this export. This receipt verifies export bytes and counts, not calculation results or visual layout. Do not claim a literal formula string will recalculate.",
  };
}
