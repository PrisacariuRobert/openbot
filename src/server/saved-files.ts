import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SavedFile } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

export const SAVED_FILE_LIMIT = 20;
export const SAVED_FILE_BYTES_LIMIT = 100 * 1024 * 1024;

function publicFile(record: ReturnType<OpenBotDatabase["listBotSavedFileRecords"]>[number]): SavedFile {
  const { attachment, sha256, savedAt } = record;
  return { id: attachment.id, name: attachment.name, mime: attachment.mime, detectedMime: attachment.detectedMime, kind: attachment.kind, size: attachment.size, url: attachment.url, previewUrl: attachment.previewUrl, createdAt: attachment.createdAt, sha256, savedAt };
}

function stat(pathname: string) {
  try { return lstatSync(pathname); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class SavedFileLibrary {
  constructor(private readonly db: OpenBotDatabase) {}

  list(botId: string): SavedFile[] {
    return this.db.listBotSavedFileRecords(botId).map(publicFile);
  }

  verified(botId: string, id: string) {
    const record = this.db.listBotSavedFileRecords(botId).find((item) => item.attachment.id === id);
    if (!record) throw new Error("That saved file is no longer available to this teammate.");
    const buffer = this.originalBytes(record.storagePath);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (buffer.length !== record.attachment.size || sha256 !== record.sha256) throw new Error("The saved file no longer matches its saved original.");
    return { ...publicFile(record), buffer };
  }

  private managedRoot(botId: string, workspaceRoot: string, create: boolean): string | null {
    const expectedRoot = path.join(this.db.workspacesDir, botId);
    if (path.resolve(workspaceRoot) !== path.resolve(expectedRoot)) throw new Error("Saved-file workspace does not match this teammate.");
    const openbot = path.join(expectedRoot, ".openbot"), library = path.join(openbot, "saved-files");
    for (const ancestor of [this.db.workspacesDir, expectedRoot, openbot, library]) {
      const found = stat(ancestor);
      if (found?.isSymbolicLink()) throw new Error("The saved-file workspace path is unsafe.");
      if (found && !found.isDirectory()) throw new Error("The saved-file workspace path is unavailable.");
    }
    if (!create && !stat(library)) return null;
    if (create) mkdirSync(library, { recursive: true });
    return library;
  }

  private originalBytes(storagePath: string): Buffer {
    const rootInfo = stat(this.db.attachmentsDir), sourceInfo = stat(storagePath);
    if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink() || !sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) throw new Error("The original upload is unavailable.");
    const root = realpathSync(this.db.attachmentsDir), source = realpathSync(storagePath);
    if (!source.startsWith(root + path.sep)) throw new Error("The original upload path is unsafe.");
    return readFileSync(source);
  }

  add(botId: string, attachmentId: string): SavedFile {
    const bot = this.db.getBot(botId);
    if (!bot) throw new Error("Teammate not found.");
    const file = this.db.attachmentFile(attachmentId);
    if (!file || !stat(file.storagePath)) throw new Error("File not found.");
    if (file.attachment.threadId !== bot.threadId || file.attachment.source !== "upload") {
      throw new Error("Only an original upload from this teammate's direct conversation can be saved.");
    }
    if (file.attachment.name.length > 120 || path.basename(file.attachment.name) !== file.attachment.name || !file.attachment.name.trim()) {
      throw new Error("That upload does not have a safe saved-file name.");
    }
    const current = this.db.listBotSavedFileRecords(botId);
    const existing = current.find((entry) => entry.attachment.id === attachmentId);
    if (existing) return publicFile(existing);
    if (current.length >= SAVED_FILE_LIMIT) throw new Error(`A teammate can keep up to ${SAVED_FILE_LIMIT} saved files.`);
    if (current.reduce((total, entry) => total + entry.attachment.size, 0) + file.attachment.size > SAVED_FILE_BYTES_LIMIT) throw new Error("A teammate can keep up to 100 MB of saved files.");
    const bytes = this.originalBytes(file.storagePath);
    if (bytes.length !== file.attachment.size) throw new Error("The original upload no longer matches its saved size.");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    this.db.addBotSavedFile(botId, attachmentId, sha256);
    return this.list(botId).find((entry) => entry.id === attachmentId)!;
  }

  remove(botId: string, attachmentId: string): boolean {
    const removed = this.db.removeBotSavedFile(botId, attachmentId);
    if (removed && /^[a-f0-9]{32}$/.test(attachmentId)) {
      try {
        const managed = this.managedRoot(botId, path.join(this.db.workspacesDir, botId), false);
        if (managed) rmSync(path.join(managed, attachmentId), { recursive: true, force: true });
      } catch { /* Association is revoked; never follow an unsafe workspace path. */ }
    }
    return removed;
  }

  /** Refreshes disposable, bot-private working copies. Attachment originals are
   * never exposed as writable workspace paths. */
  prepareWorkspace(botId: string, workspaceRoot: string): string {
    const records = this.db.listBotSavedFileRecords(botId);
    const libraryRoot = this.managedRoot(botId, workspaceRoot, true)!;
    for (const entry of readdirSync(libraryRoot)) {
      if (/^[a-f0-9]{32}$/.test(entry)) rmSync(path.join(libraryRoot, entry), { recursive: true, force: true });
    }
    if (!records.length) return "- No files have been saved for this teammate.";
    const lines: string[] = [];
    for (const record of records) {
      let bytes: Buffer;
      try { bytes = this.originalBytes(record.storagePath); } catch { continue; }
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== record.sha256) continue;
      const directory = path.join(libraryRoot, record.attachment.id);
      if (stat(directory)?.isSymbolicLink()) throw new Error("The saved-file workspace path is unsafe.");
      mkdirSync(directory, { recursive: true });
      const originalDir = path.join(directory, "original"), metadataDir = path.join(directory, "metadata");
      mkdirSync(originalDir, { recursive: true });
      const relative = path.posix.join(".openbot", "saved-files", record.attachment.id, "original", record.attachment.name);
      // Write the already hash-verified buffer, rather than reopening the
      // source after verification and creating a check/use race.
      writeFileSync(path.join(originalDir, record.attachment.name), bytes, { flag: "wx", mode: 0o600 });
      if (record.attachment.previewText) { mkdirSync(metadataDir, { recursive: true }); writeFileSync(path.join(metadataDir, "extracted.txt"), record.attachment.previewText, "utf8"); }
      lines.push(`- ${JSON.stringify(record.attachment.name)} [savedFileId: ${record.attachment.id}]: ${relative} (${record.attachment.size} bytes; sha256 ${record.sha256})${record.attachment.previewText ? `; extracted text: ${path.posix.join(".openbot", "saved-files", record.attachment.id, "metadata", "extracted.txt")}` : ""}`);
    }
    return lines.length ? lines.join("\n") : "- Saved-file records exist, but their original bytes are unavailable. Ask the owner to upload them again.";
  }
}
