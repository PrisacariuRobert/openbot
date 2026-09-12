/** VS Code Seti-inspired file families: extension first, kind/mime fallback.
 * Each family gets its own quiet tint (light + dark in design-tokens), so a
 * CSV never looks like a PDF but nothing screams. */
export type FileFamily =
  | "text"
  | "code"
  | "data"
  | "sheet"
  | "slide"
  | "pdf"
  | "image"
  | "media"
  | "archive"
  | "file";

const EXT_FAMILY: Record<string, FileFamily> = {
  md: "text",
  markdown: "text",
  mdx: "text",
  txt: "text",
  rst: "text",
  log: "text",
  tex: "text",
  doc: "text",
  docx: "text",
  odt: "text",
  pages: "text",
  rtf: "text",
  ts: "code",
  tsx: "code",
  js: "code",
  jsx: "code",
  mjs: "code",
  cjs: "code",
  py: "code",
  rb: "code",
  go: "code",
  rs: "code",
  java: "code",
  kt: "code",
  swift: "code",
  c: "code",
  h: "code",
  cpp: "code",
  hpp: "code",
  cs: "code",
  php: "code",
  vue: "code",
  svelte: "code",
  html: "code",
  css: "code",
  scss: "code",
  less: "code",
  sh: "code",
  bash: "code",
  zsh: "code",
  sql: "code",
  r: "code",
  dart: "code",
  lua: "code",
  scala: "code",
  vim: "code",
  toml: "code",
  xml: "code",
  json: "data",
  jsonc: "data",
  yaml: "data",
  yml: "data",
  env: "data",
  xls: "sheet",
  xlsx: "sheet",
  csv: "sheet",
  tsv: "sheet",
  numbers: "sheet",
  ods: "sheet",
  ppt: "slide",
  pptx: "slide",
  key: "slide",
  odp: "slide",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  ico: "image",
  heic: "image",
  mp3: "media",
  wav: "media",
  ogg: "media",
  flac: "media",
  m4a: "media",
  mp4: "media",
  mov: "media",
  webm: "media",
  m4v: "media",
  zip: "archive",
  rar: "archive",
  tar: "archive",
  gz: "archive",
  "7z": "archive",
};

const KIND_FAMILY: Record<string, FileFamily> = {
  document: "text",
  spreadsheet: "sheet",
  presentation: "slide",
  image: "image",
  audio: "media",
  video: "media",
  archive: "archive",
  text: "text",
};

export function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase().slice(0, 4);
}

export function fileFamily(file: {
  name: string;
  mime?: string;
  kind?: string;
}): FileFamily {
  const ext = fileExt(file.name);
  if (ext && EXT_FAMILY[ext]) return EXT_FAMILY[ext];
  if (file.kind && KIND_FAMILY[file.kind]) return KIND_FAMILY[file.kind];
  const mime = file.mime || "";
  if (mime.includes("pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return "media";
  if (mime.includes("zip") || mime.includes("archive")) return "archive";
  return "file";
}

/** Tile label: the real extension, uppercased — never a generic word. */
export function fileLabel(file: { name: string; kind?: string }): string {
  const ext = fileExt(file.name);
  if (ext) return ext.toUpperCase();
  if (file.kind === "spreadsheet") return "XLS";
  if (file.kind === "presentation") return "PPT";
  if (file.kind === "image") return "IMG";
  if (file.kind === "audio") return "AUD";
  if (file.kind === "video") return "VID";
  if (file.kind === "archive") return "ZIP";
  return "DOC";
}

export function fileTileClass(file: {
  name: string;
  mime?: string;
  kind?: string;
}): string {
  return `file-thumb ft-${fileFamily(file)}`;
}

/** Inline sigla (VS Code explorer style): the extension in the family color,
 * no box — for the compact file cards. */
export function fileSiglaClass(file: {
  name: string;
  mime?: string;
  kind?: string;
}): string {
  return `file-sigla ft-${fileFamily(file)}`;
}
