import test from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceFile } from "../shared/types.js";
import { prefixCrumbs, visibleWorkspaceFiles } from "./file-navigation.js";

const file = (path: string, kind: "file" | "directory" = "file"): WorkspaceFile => ({
  path,
  size: 10,
  modifiedAt: "2026-09-17T00:00:00.000Z",
  kind,
});

const listing = [
  file("notes.md"),
  file("plans"),
  file("plans/launch.md"),
  file("plans/2026"),
  file("plans/2026/summary.md"),
];

test("folder drill-down shows exactly one level", () => {
  assert.deepEqual(
    visibleWorkspaceFiles(listing, "").map((entry) => entry.path),
    ["notes.md", "plans"],
    "root shows top-level files and folders, not the flattened tree",
  );
  assert.deepEqual(
    visibleWorkspaceFiles(listing, "plans/").map((entry) => entry.path),
    ["plans/launch.md", "plans/2026"],
  );
  assert.deepEqual(
    visibleWorkspaceFiles(listing, "plans").map((entry) => entry.path),
    ["plans/launch.md", "plans/2026"],
    "missing trailing slash is normalized",
  );
  assert.deepEqual(
    visibleWorkspaceFiles(listing, "plans/2026/").map((entry) => entry.path),
    ["plans/2026/summary.md"],
  );
  assert.deepEqual(visibleWorkspaceFiles(listing, "elsewhere/"), [], "unknown prefix is empty, not an error");
  assert.deepEqual(visibleWorkspaceFiles([], ""), []);
});

test("breadcrumbs split prefixes", () => {
  assert.deepEqual(prefixCrumbs(""), []);
  assert.deepEqual(prefixCrumbs("plans/"), ["plans"]);
  assert.deepEqual(prefixCrumbs("plans/2026/"), ["plans", "2026"]);
});
