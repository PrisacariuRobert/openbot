import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AttachmentService } from "./attachments.js";
import { SavedFileLibrary } from "./saved-files.js";
import { OpenBotDatabase } from "./testing/database.js";

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-saved-files-"));
  const db = new OpenBotDatabase(root);
  const attachments = new AttachmentService(db), library = new SavedFileLibrary(db);
  return { root, db, attachments, library, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("saved files retain immutable upload identity and are private to the direct bot", async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from("Robert CV exact bytes\n");
    const beforeFingerprint = f.db.botSessionFingerprint("nova");
    const upload = await f.attachments.saveUpload({ id: "a".repeat(32), threadId: "bot-nova", name: "extracted.txt", mime: "text/plain", body: bytes });
    const saved = f.library.add("nova", upload.id);
    assert.notEqual(f.db.botSessionFingerprint("nova"), beforeFingerprint);
    assert.equal(saved.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(saved.url, `/api/attachments/${upload.id}`);
    assert.throws(() => f.library.add("pixel", upload.id), /direct conversation/);
    assert.deepEqual(f.library.list("pixel"), []);
    assert.throws(() => f.library.verified("pixel", upload.id), /no longer available/);
    assert.deepEqual(f.library.verified("nova", upload.id).buffer, bytes);

    const workspace = path.join(f.db.workspacesDir, "nova");
    const profile = f.library.prepareWorkspace("nova", workspace);
    const copy = path.join(workspace, ".openbot", "saved-files", upload.id, "original", upload.name);
    assert.deepEqual(readFileSync(copy), bytes);
    assert.equal(readFileSync(path.join(workspace, ".openbot", "saved-files", upload.id, "metadata", "extracted.txt"), "utf8"), "Robert CV exact bytes");
    assert.match(profile, /extracted\.txt/);

    assert.equal(f.library.remove("nova", upload.id), true);
    assert.throws(() => f.library.verified("nova", upload.id), /no longer available/);
    f.library.prepareWorkspace("nova", workspace);
    assert.equal(f.library.list("nova").length, 0);
    assert.equal(f.db.getAttachment(upload.id)?.id, upload.id, "removal retains chat/upload evidence");
  } finally { f.close(); }
});

test("workspace refresh refuses tampered originals and every managed-root symlink ancestor", async () => {
  const f = await fixture();
  try {
    const upload = await f.attachments.saveUpload({ id: "b".repeat(32), threadId: "bot-nova", name: "cv.txt", mime: "text/plain", body: Buffer.from("original") });
    f.library.add("nova", upload.id);
    const source = f.db.attachmentFile(upload.id)!;
    writeFileSync(source.storagePath, "tampered");
    const outside = mkdtempSync(path.join(tmpdir(), "openbot-saved-outside-"));
    const marker = path.join(outside, "keep.txt"); writeFileSync(marker, "keep");
    const managed = path.join(f.db.workspacesDir, "nova", ".openbot", "saved-files");
    mkdirSync(path.dirname(managed), { recursive: true });
    symlinkSync(outside, managed, "dir");
    assert.throws(() => f.library.prepareWorkspace("nova", path.join(f.db.workspacesDir, "nova")), /unsafe/);
    assert.equal(f.library.remove("nova", upload.id), true, "association revocation still succeeds");
    assert.equal(readFileSync(marker, "utf8"), "keep");
    assert.equal(lstatSync(managed).isSymbolicLink(), true);
    rmSync(outside, { recursive: true, force: true });
  } finally { f.close(); }
});

test("saved-file sources must be regular files inside attachment storage", async () => {
  const f = await fixture();
  try {
    const upload = await f.attachments.saveUpload({ id: "c".repeat(32), threadId: "bot-nova", name: "cv.txt", mime: "text/plain", body: Buffer.from("original") });
    const source = f.db.attachmentFile(upload.id)!;
    const outside = path.join(f.root, "outside.txt"); writeFileSync(outside, "outside");
    rmSync(source.storagePath); symlinkSync(outside, source.storagePath);
    assert.throws(() => f.library.add("nova", upload.id), /original upload/);
    assert.equal(readFileSync(outside, "utf8"), "outside");
  } finally { f.close(); }
});

test("ancestor symlinks cannot redirect working-copy creation or revocation", async () => {
  for (const segment of ["", ".openbot", ".openbot/saved-files"]) {
    const f = await fixture();
    try {
      const id = "d".repeat(32);
      const upload = await f.attachments.saveUpload({ id, threadId: "bot-nova", name: "cv.txt", mime: "text/plain", body: Buffer.from("original") });
      f.library.add("nova", upload.id);
      const outside = path.join(f.root, "outside");
      mkdirSync(path.join(outside, id), { recursive: true });
      const marker = path.join(outside, id, "keep.txt");
      writeFileSync(marker, "keep");
      const workspace = path.join(f.db.workspacesDir, "nova");
      const target = path.join(workspace, segment);
      mkdirSync(path.dirname(target), { recursive: true });
      rmSync(target, { recursive: true, force: true });
      symlinkSync(outside, target, "dir");
      assert.throws(() => f.library.prepareWorkspace("nova", workspace), /unsafe/);
      assert.equal(f.library.remove("nova", id), true);
      assert.equal(readFileSync(marker, "utf8"), "keep");
    } finally { f.close(); }
  }
});

test("saved versions persist, preserve same-name originals, and reject changed source bytes", async () => {
  const f = await fixture();
  try {
    const ids = ["e".repeat(32), "f".repeat(32)];
    for (const [index, id] of ids.entries()) {
      await f.attachments.saveUpload({ id, threadId: "bot-nova", name: "cv.txt", mime: "text/plain", body: Buffer.from(`version ${index}`) });
      f.library.add("nova", id);
    }
    const reopened = new OpenBotDatabase(f.root);
    try { assert.equal(new SavedFileLibrary(reopened).list("nova").length, 2); }
    finally { reopened.close(); }
    const workspace = path.join(f.db.workspacesDir, "nova");
    f.library.prepareWorkspace("nova", workspace);
    for (const [index, id] of ids.entries()) {
      assert.equal(readFileSync(path.join(workspace, ".openbot", "saved-files", id, "original", "cv.txt"), "utf8"), `version ${index}`);
    }
    writeFileSync(f.db.attachmentFile(ids[0])!.storagePath, "tampered!");
    assert.throws(() => f.library.verified("nova", ids[0]), /no longer matches/);
    const manifest = f.library.prepareWorkspace("nova", workspace);
    assert.equal(manifest.includes(ids[0]), false);
    assert.equal(manifest.includes(ids[1]), true);
    assert.throws(() => readFileSync(path.join(workspace, ".openbot", "saved-files", ids[0], "original", "cv.txt")), /ENOENT/);
  } finally { f.close(); }
});
