import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { parseFile as parseMediaFile } from "music-metadata";
import sharp from "sharp";
import type { Attachment, Bot, Message } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

const execFileAsync = promisify(execFile);
const MAX_EXTRACTED_CHARS = 100_000;
const MAX_PROMPT_CHARS = 8_000;
const MAX_ARTIFACTS = 6;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const previewMime = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

export type AttachmentMetadata = Record<string, string | number | boolean>;

export interface AttachmentAnalysis {
  detectedMime: string;
  kind: Attachment["kind"];
  processingStatus: Attachment["processingStatus"];
  summary: string | null;
  extractedText: string | null;
  metadata: AttachmentMetadata;
  previewable: boolean;
}

const extensionMime: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv", ".tsv": "text/tab-separated-values",
  ".json": "application/json", ".ipynb": "application/json", ".eml": "message/rfc822", ".html": "text/html", ".xml": "application/xml", ".yaml": "text/yaml", ".yml": "text/yaml",
  ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".zip": "application/zip",
};

const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".sql", ".sh", ".toml", ".ini", ".env"]);

function boundedText(value: string, limit = MAX_EXTRACTED_CHARS): string {
  const clean = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{5,}/g, "\n\n\n\n").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}\n\n[Preview shortened by OpenBot]` : clean;
}

function secondsLabel(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  const total = Math.round(value), minutes = Math.floor(total / 60), seconds = total % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
}

function xmlText(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function detectedMime(buffer: Buffer, name: string, suppliedMime: string): string {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 6).toString() === "GIF87a" || buffer.subarray(0, 6).toString() === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WAVE") return "audio/wav";
  if (buffer.subarray(0, 3).toString() === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  const extension = path.extname(name).toLowerCase();
  if (buffer.subarray(0, 4).toString() === "PK\u0003\u0004") return extensionMime[extension] || "application/zip";
  return extensionMime[extension] || (sourceExtensions.has(extension) ? "text/plain" : suppliedMime || "application/octet-stream");
}

function kindFor(mime: string, name: string): Attachment["kind"] {
  const extension = path.extname(name).toLowerCase();
  if (mime === "application/pdf" || extension === ".docx") return "document";
  if ([".xlsx", ".xlsm", ".csv", ".tsv"].includes(extension)) return "spreadsheet";
  if (extension === ".pptx") return "presentation";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/zip") return "archive";
  if (mime.startsWith("text/") || mime === "message/rfc822" || sourceExtensions.has(extension) || ["application/json", "application/xml"].includes(mime)) return "text";
  return "file";
}

async function extractPdf(filePath: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(filePath));
  const loadingTask = getDocument({ data, standardFontDataUrl: `${fileURLToPath(new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url))}${path.sep}` });
  const document = await loadingTask.promise;
  const totalPages = document.numPages, pageLimit = Math.min(totalPages, 60);
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageLimit && pages.join("\n").length < MAX_EXTRACTED_CHARS; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
      if (text) pages.push(`Page ${pageNumber}\n${text}`);
    }
  } finally { await loadingTask.destroy(); }
  const extractedText = boundedText(pages.join("\n\n"));
  return {
    summary: `${totalPages} page PDF${extractedText ? " · text ready" : " · visual pages ready"}`,
    extractedText: extractedText || null,
    metadata: { pages: totalPages, ...(pageLimit < totalPages ? { pagesRead: pageLimit } : {}) },
  };
}

async function extractDocx(filePath: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  let xmlBudget = 0, entries = 0;
  const archive = unzipSync(new Uint8Array(await readFile(filePath)), { filter: (entry) => {
    const relevant = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(entry.name);
    if (!relevant || entry.originalSize > 3_000_000 || entries >= 15 || xmlBudget + entry.originalSize > 15_000_000) return false;
    entries += 1; xmlBudget += entry.originalSize; return true;
  } });
  const sections = Object.entries(archive).map(([name, bytes]) => {
    const xml = strFromU8(bytes).replace(/<w:tab\/?\s*>/g, "\t").replace(/<w:br\/?\s*>/g, "\n");
    const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((paragraph) => [...((paragraph[1] || "").matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))].map((match) => xmlText(match[1] || "")).join("")).filter(Boolean);
    const text = paragraphs.length ? paragraphs.join("\n") : [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => xmlText(match[1] || "")).join("");
    return text.trim() ? `${name === "word/document.xml" ? "Document" : path.basename(name, ".xml")}\n${text}` : "";
  }).filter(Boolean);
  const extractedText = boundedText(sections.join("\n\n"));
  return { summary: extractedText ? "Word document · text ready" : "Word document · no readable text", extractedText: extractedText || null, metadata: { sections: sections.length } };
}

function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [], row: string[] = [];
  let cell = "", quoted = false;
  for (let index = 0; index < text.length && rows.length < 500; index += 1) {
    const character = text[index]!;
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") { cell += "\""; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) { row.push(cell); cell = ""; }
    else if (!quoted && character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push([...row]); row.length = 0; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function spreadsheetCell(xml: string, sharedStrings: string[]): string {
  const type = xml.match(/\bt="([^"]+)"/)?.[1], raw = xml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
  if (type === "s") return sharedStrings[Number(raw)] || "";
  if (type === "inlineStr") return xmlText([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1] || "").join(""));
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return xmlText(raw);
}

async function extractWorkbook(filePath: string, extension: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  if (extension === ".csv" || extension === ".tsv") {
    const rows = csvRows(await readFile(filePath, "utf8"), extension === ".tsv" ? "\t" : ",");
    const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    return { summary: `1 sheet · ${rows.length.toLocaleString()} rows`, extractedText: boundedText(`Sheet: ${path.basename(filePath)} (${rows.length} rows × ${width} columns)\n${rows.map((row) => row.slice(0, 30).join("\t")).join("\n")}`) || null, metadata: { sheets: 1, rows: rows.length, columns: width } };
  }
  let xmlBudget = 0, entries = 0;
  const archive = unzipSync(new Uint8Array(await readFile(filePath)), { filter: (entry) => {
    const relevant = entry.name === "xl/workbook.xml" || entry.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name);
    if (!relevant || entry.originalSize > 3_000_000 || entries >= 24 || xmlBudget + entry.originalSize > 24_000_000) return false;
    entries += 1; xmlBudget += entry.originalSize; return true;
  } });
  const workbookXml = archive["xl/workbook.xml"] ? strFromU8(archive["xl/workbook.xml"]!) : "";
  const sheetNames = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map((match) => xmlText(match[1] || "")).slice(0, 20);
  const sharedXml = archive["xl/sharedStrings.xml"] ? strFromU8(archive["xl/sharedStrings.xml"]!) : "";
  const sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => xmlText([...(match[1] || "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => text[1] || "").join("")));
  const sheets = Object.entries(archive).filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort(([left], [right]) => Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0));
  let totalRows = 0;
  const previews = sheets.slice(0, 20).map(([, bytes], index) => {
    const xml = strFromU8(bytes), rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];
    totalRows += rows.length;
    const lines = rows.slice(0, 500).map((row) => [...((row[1] || "").matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g))].slice(0, 30).map((cell) => spreadsheetCell(cell[0], sharedStrings)).join("\t"));
    const name = sheetNames[index] || `Sheet ${index + 1}`;
    return `Sheet: ${name} (${rows.length} rows)\n${lines.join("\n")}`;
  });
  return { summary: `${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · ${totalRows.toLocaleString()} rows`, extractedText: boundedText(previews.join("\n\n")) || null, metadata: { sheets: sheets.length, rows: totalRows, sheetNames: sheetNames.join(", ").slice(0, 500) } };
}

async function extractPptx(filePath: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  let xmlBudget = 0, entries = 0;
  const archive = unzipSync(new Uint8Array(await readFile(filePath)), {
    filter: (entry) => {
      const relevant = /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name);
      if (!relevant || entry.originalSize > 2_000_000 || entries >= 80 || xmlBudget + entry.originalSize > 20_000_000) return false;
      entries += 1; xmlBudget += entry.originalSize; return true;
    },
  });
  const slides = Object.entries(archive).sort(([left], [right]) => Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0));
  const text = slides.slice(0, 80).map(([, bytes], index) => {
    const pieces = [...strFromU8(bytes).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => xmlText(match[1] || "").trim()).filter(Boolean);
    return pieces.length ? `Slide ${index + 1}\n${pieces.join("\n")}` : `Slide ${index + 1}`;
  }).join("\n\n");
  return { summary: `${slides.length} slide presentation · text ready`, extractedText: boundedText(text) || null, metadata: { slides: slides.length } };
}

async function extractImage(filePath: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  const image = await sharp(filePath, { animated: true }).metadata();
  const dimensions = image.width && image.height ? `${image.width}×${image.height}` : "Image";
  const frames = image.pages && image.pages > 1 ? image.pages : 1;
  return {
    summary: `${dimensions}${frames > 1 ? ` · ${frames} frames` : ""} · ready for visual understanding`, extractedText: null,
    metadata: { ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}), ...(image.format ? { format: image.format.toUpperCase() } : {}), ...(frames > 1 ? { frames } : {}) },
  };
}

async function extractAudio(filePath: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  const media = await parseMediaFile(filePath, { duration: true, skipCovers: true });
  const duration = secondsLabel(media.format.duration);
  const codec = media.format.codec || media.format.container || "Audio";
  return {
    summary: `${duration ? `${duration} · ` : ""}${codec} · ready for audio understanding`, extractedText: null,
    metadata: {
      ...(duration ? { duration } : {}), ...(media.format.bitrate ? { bitrateKbps: Math.round(media.format.bitrate / 1000) } : {}),
      ...(media.format.sampleRate ? { sampleRateHz: media.format.sampleRate } : {}), ...(media.format.numberOfChannels ? { channels: media.format.numberOfChannels } : {}),
      ...(media.common.title ? { title: media.common.title } : {}), ...(media.common.artist ? { artist: media.common.artist } : {}),
    },
  };
}

async function extractVideo(filePath: string): Promise<Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">> {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration,format_name:stream=width,height,codec_name", "-of", "json", filePath], { timeout: 5_000, maxBuffer: 512_000 });
    const parsed = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string }; streams?: Array<{ width?: number; height?: number; codec_name?: string }> };
    const video = parsed.streams?.find((stream) => stream.width && stream.height), duration = secondsLabel(Number(parsed.format?.duration));
    const dimensions = video?.width && video.height ? `${video.width}×${video.height}` : "Video";
    return { summary: `${dimensions}${duration ? ` · ${duration}` : ""} · ready for visual understanding`, extractedText: null, metadata: { ...(video?.width ? { width: video.width } : {}), ...(video?.height ? { height: video.height } : {}), ...(duration ? { duration } : {}), ...(video?.codec_name ? { codec: video.codec_name } : {}) } };
  } catch {
    return { summary: "Video · ready for visual understanding", extractedText: null, metadata: {} };
  }
}

export async function inspectAttachment(filePath: string, name: string, suppliedMime: string): Promise<AttachmentAnalysis> {
  const buffer = await readFile(filePath);
  const mime = detectedMime(buffer, name, suppliedMime), kind = kindFor(mime, name), extension = path.extname(name).toLowerCase();
  const base = { detectedMime: mime, kind, processingStatus: "ready" as const, previewable: previewMime.has(mime) };
  try {
    let content: Pick<AttachmentAnalysis, "summary" | "extractedText" | "metadata">;
    if (mime === "application/pdf") content = await extractPdf(filePath);
    else if (extension === ".docx") content = await extractDocx(filePath);
    else if ([".xlsx", ".xlsm", ".csv", ".tsv"].includes(extension)) content = await extractWorkbook(filePath, extension);
    else if (extension === ".pptx") content = await extractPptx(filePath);
    else if (kind === "image") content = await extractImage(filePath);
    else if (kind === "audio") content = await extractAudio(filePath);
    else if (kind === "video") content = await extractVideo(filePath);
    else if (kind === "archive") return { ...base, processingStatus: "unsupported", summary: "Archive saved safely · unpack it before asking about its contents", extractedText: null, metadata: {} };
    else if (kind === "text") {
      if (buffer.includes(0)) throw new Error("This does not appear to be a text file.");
      const extractedText = boundedText(buffer.toString("utf8"));
      content = { summary: `${extractedText.split("\n").length} lines · text ready`, extractedText: extractedText || null, metadata: { lines: extractedText ? extractedText.split("\n").length : 0 } };
    } else return { ...base, processingStatus: "unsupported", summary: "Saved safely · this file type has no local preview yet", extractedText: null, metadata: {} };
    return { ...base, ...content };
  } catch {
    return { ...base, processingStatus: "partial", summary: kind === "image" || kind === "audio" || kind === "video" ? `${kind[0]!.toUpperCase()}${kind.slice(1)} saved · the selected AI may still understand it` : "Saved safely · preview could not be prepared", extractedText: null, metadata: {} };
  }
}

export function attachmentPromptBlock(attachment: Attachment, fullText: string | null): string {
  const details = [`${attachment.name} (${attachment.kind}, ${attachment.summary || attachment.detectedMime}, ${attachment.size} bytes)`, `Workspace copy: {{WORKSPACE_PATH}}`];
  if (fullText) details.push(`OPENBOT_UNTRUSTED_FILE_CONTENT_START\n${boundedText(fullText, MAX_PROMPT_CHARS)}\nOPENBOT_UNTRUSTED_FILE_CONTENT_END`);
  else if (["image", "audio", "video"].includes(attachment.kind)) details.push("The original media is attached to the model when the selected provider supports it.");
  return details.join("\n");
}

export function modelAttachmentFiles(db: OpenBotDatabase, run: Pick<import("../shared/types.js").Run, "attachmentIds">): string[] {
  return run.attachmentIds.flatMap((id) => {
    const file = db.attachmentFile(id);
    return file && (file.attachment.kind === "image" || file.attachment.kind === "audio" || file.attachment.kind === "video" || file.attachment.detectedMime === "application/pdf") ? [file.storagePath] : [];
  });
}

function pathCandidates(summary: string): string[] {
  const results: string[] = [];
  for (const match of summary.matchAll(/`([^`\n]+)`|\[[^\]]+\]\(([^)\n]+)\)/g)) {
    let candidate = (match[1] || match[2] || "").trim().replace(/^<|>$/g, "").replace(/#L\d+(?:-L?\d+)?$/i, "").replace(/:\d+(?::\d+)?$/, "");
    try { candidate = decodeURIComponent(candidate); } catch { /* use the literal path */ }
    if (candidate && !/^[a-z]+:\/\//i.test(candidate) && /\.[a-z0-9]{1,8}$/i.test(candidate)) results.push(candidate);
  }
  return [...new Set(results)].slice(0, MAX_ARTIFACTS * 3);
}

export class AttachmentService {
  constructor(private readonly db: OpenBotDatabase) {}

  async saveUpload(input: { id: string; threadId: string; name: string; mime: string; body: Buffer }): Promise<Attachment> {
    const directory = path.join(this.db.attachmentsDir, input.id), storagePath = path.join(directory, input.name);
    await mkdir(directory, { recursive: true });
    await writeFile(storagePath, input.body, { flag: "wx", mode: 0o600 });
    const analysis = await inspectAttachment(storagePath, input.name, input.mime);
    return this.db.createAttachment({ threadId: input.threadId, name: input.name, mime: input.mime, size: input.body.length, storagePath, analysis, source: "upload" });
  }

  async captureArtifacts(bot: Bot, message: Message, summary: string): Promise<Attachment[]> {
    const workspace = await realpath(path.join(this.db.workspacesDir, bot.id));
    const captured: Attachment[] = [], seenSources = new Set<string>();
    for (const candidate of pathCandidates(summary)) {
      if (captured.length >= MAX_ARTIFACTS) break;
      const relative = candidate.startsWith("/workspace/") ? candidate.slice("/workspace/".length) : candidate;
      const proposed = path.isAbsolute(relative) ? relative : path.resolve(workspace, relative);
      let source: string;
      try { source = await realpath(proposed); } catch { continue; }
      if (seenSources.has(source) || !(source === workspace || source.startsWith(`${workspace}${path.sep}`)) || source.includes(`${path.sep}inbox${path.sep}`)) continue;
      seenSources.add(source);
      const info = await stat(source);
      if (!info.isFile() || info.size <= 0 || info.size > MAX_FILE_BYTES) continue;
      const name = path.basename(source), id = randomBytes(16).toString("hex"), directory = path.join(this.db.attachmentsDir, id), destination = path.join(directory, name);
      await mkdir(directory, { recursive: true });
      await copyFile(source, destination);
      const analysis = await inspectAttachment(destination, name, extensionMime[path.extname(name).toLowerCase()] || "application/octet-stream");
      const artifactKey = `${bot.id}:${path.relative(workspace, source)}`, previous = this.db.latestArtifact(message.threadId, artifactKey);
      captured.push(this.db.createAttachment({ threadId: message.threadId, messageId: message.id, name, mime: analysis.detectedMime, size: info.size, storagePath: destination, analysis, source: "artifact", artifactKey, revision: (previous?.revision || 0) + 1, replacesAttachmentId: previous?.id || null }));
    }
    return captured;
  }
}
