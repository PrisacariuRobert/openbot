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
