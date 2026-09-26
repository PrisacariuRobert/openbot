import path from "node:path";
import { closeSync, constants, fsyncSync, fstatSync, lstatSync, openSync, readSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";

/** A real Word document (.docx) from a Markdown or text file the teammate
 * wrote in its workspace. Same rules as the workbook export: sources stay
 * inside the workspace, nothing is overwritten, the result is a new file. */

const MAX_BYTES = 1024 * 1024;
export const documentExportInput = z.object({
  filename: z.string().max(160).regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*\.docx$/, "Choose a new .docx filename without folders."),
  sourcePath: z.string().min(1).max(2048),
  title: z.string().trim().max(200).optional(),
}).strict();

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function readWorkspaceText(root: string, relative: string) {
  const parts = relative.split(/[\\/]/);
  if (path.isAbsolute(relative) || parts.some((part) => !part || part.startsWith(".")) || !/\.(?:md|markdown|txt)$/i.test(relative)) throw new Error("Choose a visible .md or .txt file relative to this teammate's workspace.");
  let target = root;
  for (const part of parts) {
    target = path.join(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error("Document sources cannot use symbolic links.");
  }
  if (!realpathSync(target).startsWith(`${root}${path.sep}`)) throw new Error("The source must be inside this workspace.");
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("Choose a regular text file no larger than 1 MiB.");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0, read = 0;
    while (length < buffer.length && (read = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += read;
    if (length > MAX_BYTES) throw new Error("The source exceeds 1 MiB.");
    const bytes = buffer.subarray(0, length);
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), sha256: hash(bytes) };
  } finally { closeSync(fd); }
}

/** **bold**, *italic* / _italic_, `code`, [text](url) → Word runs. */
export function inlineRuns(text: string): string {
  const runs: string[] = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  const run = (value: string, props = "") => { if (value) runs.push(`<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(value)}</w:t></w:r>`); };
  for (const match of text.matchAll(pattern)) {
    run(text.slice(last, match.index));
    if (match[2] || match[3]) run(match[2] || match[3]!, "<w:b/>");
    else if (match[4] || match[5]) run(match[4] || match[5]!, "<w:i/>");
    else if (match[6]) run(match[6], '<w:rFonts w:ascii="Menlo" w:hAnsi="Menlo"/><w:sz w:val="20"/>');
    else if (match[7]) { run(match[7], '<w:color w:val="1F4E9E"/><w:u w:val="single"/>'); run(` (${match[8]})`, '<w:color w:val="6E6E73"/>'); }
    last = match.index! + match[0].length;
  }
  run(text.slice(last));
  return runs.join("");
}

/** Headings, paragraphs, bullet and numbered lists, rules. */
export function markdownToBody(markdown: string, title?: string): { body: string; paragraphs: number } {
  const out: string[] = [];
  const para = (runs: string, style?: string, extra = "") => out.push(`<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>` : ""}${runs}</w:p>`);
  // A title that repeats the document's own first heading appears once.
  const plain = (value: string) => value.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const firstLine = markdown.replace(/\r\n?/g, "\n").split("\n").find((line) => line.trim()) || "";
  const firstHeading = /^#{1,3}\s+(.*)$/.exec(firstLine.trim())?.[1];
  if (title && !(firstHeading && plain(firstHeading) === plain(title))) para(inlineRuns(title), "Title");
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { para(inlineRuns(paragraph.join(" "))); paragraph = []; } };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flush(); para("", undefined, '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D2D2D7"/></w:pBdr>'); continue; }
    if (heading) { flush(); para(inlineRuns(heading[2]!), `Heading${heading[1]!.length}`); continue; }
    if (bullet) { flush(); para(inlineRuns(bullet[1]!), "ListParagraph", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'); continue; }
    if (numbered) { flush(); para(inlineRuns(numbered[1]!), "ListParagraph", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'); continue; }
    paragraph.push(line.trim());
  }
  flush();
  return { body: out.join(""), paragraphs: out.length };
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const doc = (inner: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${inner}`;

export function buildDocx(markdown: string, title?: string) {
  const { body, paragraphs } = markdownToBody(markdown, title);
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, content: string) => { files[name] = strToU8(doc(content)); };
  add("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
  add("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  add("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
  const font = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  const style = (id: string, name: string, pPr: string, rPr: string) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
  add("word/styles.xml", `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style("Title", "Title", '<w:spacing w:after="240"/>', '<w:b/><w:sz w:val="40"/>')}${style("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="32"/>')}${style("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="26"/>')}${style("Heading3", "heading 3", '<w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/>', '<w:b/><w:sz w:val="24"/>')}${style("ListParagraph", "List Paragraph", '<w:spacing w:after="80"/><w:ind w:left="720"/>', "")}</w:styles>`);
  const level = (format: string, text: string) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`;
  add("word/numbering.xml", `<w:numbering ${W}><w:abstractNum w:abstractNumId="0">${level("bullet", "•")}</w:abstractNum><w:abstractNum w:abstractNumId="1">${level("decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`);
  add("word/document.xml", `<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return { bytes: zipSync(files, { level: 6 }), paragraphs };
}

export function exportDocument(workspace: string, args: unknown) {
  const input = documentExportInput.parse(args);
  if (!lstatSync(workspace).isDirectory() || lstatSync(workspace).isSymbolicLink()) throw new Error("The teammate workspace is not available.");
  const root = realpathSync(workspace);
  const source = readWorkspaceText(root, input.sourcePath);
  if (!source.content.trim()) throw new Error("The source file is empty. Write the document text first.");
  const { bytes, paragraphs } = buildDocx(source.content, input.title);
  const target = path.join(root, input.filename);
  let fd: number;
  try { fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("That document already exists. Choose a new filename; existing files are never replaced.");
    throw error;
  }
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  catch (error) { closeSync(fd); unlinkSync(target); throw error; }
  closeSync(fd);
  return {
    saved: true, path: input.filename, bytes: bytes.length, sha256: hash(bytes), paragraphs, sourcePath: input.sourcePath, sourceSha256: source.sha256,
    instructions: "Link the .docx file in your final answer. It opens in Word, Pages and Google Docs. The source text file was kept.",
  };
}
