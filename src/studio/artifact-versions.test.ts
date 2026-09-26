import assert from "node:assert/strict";
import test from "node:test";
import type { Attachment } from "../shared/types";
import { deliveredFiles, newerDeliveredVersion } from "./artifact-versions";

const file = (id: string, revision: number, replacesAttachmentId: string | null = null, patch: Partial<Attachment> = {}) => ({ id, revision, replacesAttachmentId, source: "artifact", threadId: "conversation", name: "choice.md", ...patch } as Attachment);
test("old result offers the latest known descendant without changing its own link", () => {
  const first = file("one", 1, null, { url: "/api/attachments/one" });
  const second = file("two", 2, "one"), third = file("three", 3, "two");
  assert.equal(newerDeliveredVersion(first, [third, first, second])?.id, "three");
  assert.equal(first.url, "/api/attachments/one");
  assert.equal(newerDeliveredVersion(third, [first, second, third]), null);
});
test("same names, other conversations, uploads and invalid ancestry do not count as a correction", () => {
  const first = file("one", 1);
  assert.equal(newerDeliveredVersion(first, [file("unrelated", 2), file("other-thread", 2, "one", {threadId:"elsewhere"}), file("upload", 2, "one", {source:"upload"}), file("invalid", 1, "one")]), null);
  assert.equal(newerDeliveredVersion(file("upload", 1, null, {source:"upload"}), [file("two", 2, "upload")]), null);
});

test("a Word document hides the text draft it was exported from", () => {
  const names = (list: Attachment[]) => deliveredFiles(list).map((item) => item.name);
  assert.deepEqual(names([file("a", 1, null, { name: "welcome-guide.docx" }), file("b", 1, null, { name: "welcome-guide.md" })]), ["welcome-guide.docx"]);
  assert.deepEqual(names([file("b", 1, null, { name: "notes.md" }), file("a", 1, null, { name: "welcome-guide.docx" })]), ["notes.md", "welcome-guide.docx"]);
  assert.deepEqual(names([file("b", 1, null, { name: "plan.md" })]), ["plan.md"]);
  assert.deepEqual(names([file("a", 1, null, { name: "handy-preise.xlsx" }), file("b", 1, null, { name: "preise_at.csv" })]), ["handy-preise.xlsx"]);
  assert.deepEqual(names([file("b", 1, null, { name: "export.csv" })]), ["export.csv"], "a CSV on its own is the delivery");
});
