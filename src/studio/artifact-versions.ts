import type { Attachment } from "../shared/types";

/** Follow explicit revision ancestry only. Matching names are not identity. */
export function newerDeliveredVersion(file: Attachment, visibleFiles: Attachment[]): Attachment | null {
  if (file.source !== "artifact") return null;
  let current = file;
  const visited = new Set([file.id]);
  for (;;) {
    const next = visibleFiles.find((candidate) => candidate.source === "artifact"
      && candidate.threadId === file.threadId && candidate.replacesAttachmentId === current.id
      && candidate.revision > current.revision && !visited.has(candidate.id));
    if (!next) return current.id === file.id ? null : current;
    visited.add(next.id);
    current = next;
  }
}

/** The text draft a document was exported from is a working file: when the
 * finished document (same name, .docx) is delivered alongside, show that. */
export function deliveredFiles(files: Attachment[]): Attachment[] {
  const stem = (name: string) => name.replace(/\.[^.]+$/, "").toLowerCase();
  const documents = new Set(files.filter((file) => /\.docx$/i.test(file.name)).map((file) => stem(file.name)));
  return files.filter((file) => !(/\.(?:md|markdown|txt)$/i.test(file.name) && documents.has(stem(file.name))));
}
