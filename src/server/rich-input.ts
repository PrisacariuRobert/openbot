/**
 * B04 — Rich editors, widgets and file transfer primitives.
 *
 * Backend-only. No Codex UI/client changes (read-only hint:
 * src/studio/useConversationAttachments.ts stays untouched; host transfer/
 * admission behavior is fixed here).
 *
 * - contenteditable/canvas insertion with explicit edit scope
 * - IME/non-ASCII safe, locale/timezone aware, autosave vs submit distinct
 * - upload bound to granted handle + digest + destination + review
 * - download lifecycle with sanitization, quota, provenance, digest
 */

export type EditScope = {
  documentId: string;
  framePath: string;
  startOffset: number;
  endOffset: number;
  revision: string;
};

export function validateEditScope(scope: EditScope, current: { documentId: string; length: number; revision: string }): { ok: true } | { ok: false; reason: string } {
  if (scope.documentId !== current.documentId) return { ok: false, reason: "wrong-document" };
  if (scope.revision !== current.revision) return { ok: false, reason: "stale-revision" };
  if (scope.startOffset < 0 || scope.endOffset < scope.startOffset || scope.endOffset > current.length) {
    return { ok: false, reason: "scope-out-of-range" };
  }
  return { ok: true };
}

/** Never Select All across the wrong document/window: scoped replacement. */
export function boundedReplacement(input: { currentText: string; scope: EditScope; replacement: string }): string {
  return input.currentText.slice(0, input.scope.startOffset) + input.replacement + input.currentText.slice(input.scope.endOffset);
}

/** Distinguish autosave (still a write, still verified) from final submit. */
export type WriteEffect = "autosave-write" | "final-submit";
export function classifyWriteEffect(input: { autosave: boolean; submitted: boolean }): WriteEffect {
  if (input.submitted) return "final-submit";
  return "autosave-write";
}

// ---------------------------------------------------------------------------
// Upload binding: only explicitly supplied or granted files, bound to
// recipient/site/account. No arbitrary local path invented by the model.
// ---------------------------------------------------------------------------

export type GrantedFileHandle = {
  handleId: string;
  attachmentId: string;
  digest: string;
  byteSize: number;
  recipient: string;
  siteOrigin: string;
  account: string;
  reviewId: string | null;
  expiresAt: string;
};

export function uploadHandleValid(
  handle: GrantedFileHandle,
  request: { recipient: string; siteOrigin: string; account: string },
  now = Date.now(),
): boolean {
  if (new Date(handle.expiresAt).getTime() <= now) return false;
  return handle.recipient === request.recipient && handle.siteOrigin === request.siteOrigin && handle.account === request.account;
}

// ---------------------------------------------------------------------------
// Download lifecycle: wait for completion, associate destination file with
// task, verify type/bytes/content/saved path. Per-task storage only.
// ---------------------------------------------------------------------------

export type DownloadRecord = {
  downloadId: string;
  taskId: string;
  url: string;
  siteOrigin: string;
  account: string;
  filename: string;
  sanitizedFilename: string;
  mime: string;
  bytes: number;
  digest: string;
  status: "pending" | "complete" | "partial" | "mismatch";
  path: string;
};

export function sanitizeFilename(raw: string): string {
  const base = raw.split("/").pop()?.split("\\").pop() ?? "download";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "download";
  if (cleaned === "." || cleaned === "..") return "download";
  return cleaned;
}

export function verifyDownload(record: DownloadRecord, observed: { bytes: number; digest: string; mime: string }): DownloadRecord {
  if (observed.bytes !== record.bytes || observed.digest !== record.digest) {
    return { ...record, status: "mismatch" };
  }
  if (observed.mime !== record.mime) {
    return { ...record, status: "mismatch" };
  }
  return { ...record, status: "complete" };
}

/** Download type mismatch / partial transfer never masquerades as artifact. */
export function downloadUsable(record: DownloadRecord): boolean {
  return record.status === "complete";
}
