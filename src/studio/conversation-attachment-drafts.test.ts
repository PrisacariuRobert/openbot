import assert from "node:assert/strict";
import test from "node:test";
import type { Attachment } from "../shared/types";
import { ConversationAttachmentDrafts } from "./conversation-attachment-drafts";

const attachment = (id: string, threadId = "nova"): Attachment => ({
  id,
  threadId,
  messageId: null,
  name: `${id}.txt`,
  mime: "text/plain",
  detectedMime: "text/plain",
  kind: "text",
  processingStatus: "ready",
  summary: null,
  previewText: "Hello",
  metadata: {},
  previewUrl: null,
  source: "upload",
  revision: 1,
  replacesAttachmentId: null,
  size: 5,
  url: `/api/attachments/${id}`,
  createdAt: "2026-09-06T12:00:00Z",
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const file = () => new File(["Hello"], "note.txt", { type: "text/plain" });

test("request functions are called without binding the controller as their receiver", async () => {
  const drafts = new ConversationAttachmentDrafts(async function (this: unknown) {
    assert.equal(this, undefined, "Browser fetch rejects a non-Window receiver");
    return response([]);
  });
  await drafts.load("nova");
  assert.equal(drafts.get("nova").ready, true);
  assert.equal(drafts.get("nova").error, "");
});

test("initial restore blocks sending; cancelled stale loads never replace restored selections", async () => {
  let resolveOld!: (value: Response) => void;
  let requests = 0;
  const drafts = new ConversationAttachmentDrafts(async () => {
    if (++requests === 1)
      return new Promise<Response>((resolve) => {
        resolveOld = resolve;
      });
    return response([attachment("new")]);
  });
  const old = drafts.load("nova");
  assert.equal(drafts.get("nova").ready, false);
  drafts.cancelLoad("nova");
  await drafts.load("nova");
  resolveOld(response([attachment("old")]));
  await old;
  assert.equal(drafts.get("nova").ready, true);
  assert.deepEqual(
    drafts.get("nova").files.map((item) => item.id),
    ["new"],
  );
});

test("restore failure is visible, blocks send and is retryable", async () => {
  let fail = true;
  const drafts = new ConversationAttachmentDrafts(async () =>
    fail
      ? response({ error: "Host disconnected" }, 503)
      : response([attachment("saved")]),
  );
  await drafts.load("nova");
  assert.equal(drafts.get("nova").ready, false);
  assert.equal(drafts.get("nova").retryable, true);
  assert.match(drafts.get("nova").error, /Host disconnected/);
  fail = false;
  await drafts.retry("nova");
  assert.equal(drafts.get("nova").ready, true);
  assert.equal(drafts.get("nova").files.length, 1);
});

test("uncertain bind response retries same uploaded ID without uploading again or touching draft text", async () => {
  let uploads = 0,
    bindings = 0;
  const saved = attachment("uploaded");
  const drafts = new ConversationAttachmentDrafts(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/attachments?")) {
      uploads++;
      return response(saved);
    }
    if (init?.method === "POST") {
      assert.deepEqual(JSON.parse(String(init.body)), { id: saved.id });
      assert.ok(url.endsWith("/attachments"));
      if (++bindings === 1) throw new Error("Connection lost after saving");
      return response([saved]);
    }
    return response([]);
  });
  await drafts.load("nova");
  await drafts.add("nova", [file()]);
  assert.equal(drafts.get("nova").ready, false);
  assert.equal(drafts.get("nova").retryable, true);
  await drafts.retry("nova");
  assert.equal(uploads, 1);
  assert.equal(bindings, 2);
  assert.equal(drafts.get("nova").ready, true);
  assert.deepEqual(drafts.get("nova").files, [saved]);
});

test("failed remove leaves the file visible and blocks send until idempotent retry", async () => {
  let fail = true;
  const drafts = new ConversationAttachmentDrafts(async (_input, init) => {
    if (init?.method === "DELETE") {
      if (fail) return response({ error: "Try removing again" }, 503);
      return response([]);
    }
    return response([attachment("saved")]);
  });
  await drafts.load("nova");
  await drafts.remove("nova", "saved");
  assert.equal(drafts.get("nova").files.length, 1);
  assert.equal(drafts.get("nova").ready, false);
  fail = false;
  await drafts.retry("nova");
  assert.equal(drafts.get("nova").files.length, 0);
  assert.equal(drafts.get("nova").ready, true);
});

test("an upload completing after thread change updates only its originating thread", async () => {
  let finishUpload!: (value: Response) => void;
  const drafts = new ConversationAttachmentDrafts(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/attachments?"))
      return new Promise<Response>((resolve) => {
        finishUpload = resolve;
      });
    if (init?.method === "POST") return response([attachment("uploaded")]);
    return response(
      url.includes("pixel") ? [attachment("pixel-file", "pixel")] : [],
    );
  });
  await drafts.load("nova");
  const uploading = drafts.add("nova", [file()]);
  assert.equal(drafts.get("nova").uploading, true);
  drafts.cancelLoad("nova");
  await drafts.load("pixel");
  finishUpload(response(attachment("uploaded")));
  await uploading;
  assert.deepEqual(
    drafts.get("pixel").files.map((item) => item.id),
    ["pixel-file"],
  );
  assert.deepEqual(
    drafts.get("nova").files.map((item) => item.id),
    ["uploaded"],
  );
  drafts.clear("nova", ["uploaded"]);
  assert.equal(drafts.get("pixel").files.length, 1);
  assert.equal(drafts.get("nova").files.length, 0);
});

test("six-file limit matches message API and invalid batches upload nothing", async () => {
  let requests = 0;
  const drafts = new ConversationAttachmentDrafts(async () => {
    requests++;
    return response([]);
  });
  await drafts.load("nova");
  await drafts.add("nova", Array.from({ length: 7 }, file));
  assert.match(drafts.get("nova").error, /six files/);
  await drafts.add("nova", [file(), new File([], "empty.txt")]);
  assert.match(drafts.get("nova").error, /non-empty/);
  assert.equal(requests, 1);
  assert.equal(
    drafts.get("nova").ready,
    true,
    "Validation does not make existing confirmed attachments uncertain",
  );
});
