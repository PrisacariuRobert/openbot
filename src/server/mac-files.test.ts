import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MacFileAccess } from "./mac-files.js";

test("lists, reads, and safely organizes visible Mac files", () => {
  const home = mkdtempSync(path.join(tmpdir(), "openbot-mac-home-"));
  const outside = mkdtempSync(path.join(tmpdir(), "openbot-mac-outside-"));
  try {
    mkdirSync(path.join(home, "Desktop"));
    mkdirSync(path.join(home, "Library"));
    writeFileSync(path.join(home, "Desktop", "note.txt"), "hello", "utf8");
    writeFileSync(path.join(home, ".secret"), "hidden", "utf8");
    writeFileSync(path.join(outside, "private.txt"), "private", "utf8");
    symlinkSync(path.join(outside, "private.txt"), path.join(home, "Desktop", "shortcut.txt"));
    const access = new MacFileAccess(home);
    assert.deepEqual(access.list("Desktop").map((entry) => entry.name), ["note.txt"]);
    assert.equal(access.read("~/Desktop/note.txt").content, "hello");
    assert.throws(() => access.read("../private.txt"), /outside/);
    assert.throws(() => access.read(".secret"), /protected/);
    assert.throws(() => access.list("Library"), /protected/);
    assert.throws(() => access.read("Desktop/shortcut.txt"), /symbolic/);
    writeFileSync(path.join(home, "Desktop", "large.txt"), "x".repeat(500_001), "utf8");
    assert.throws(() => access.read("Desktop/large.txt"), /500 KB/);
    rmSync(path.join(home, "Desktop", "large.txt"));
    const result = access.organize([{ from: "Desktop/note.txt", to: "Desktop/Organized/Documents/note.txt" }]);
    assert.equal(result.count, 1);
    assert.equal(readFileSync(path.join(home, "Desktop", "Organized", "Documents", "note.txt"), "utf8"), "hello");
    writeFileSync(path.join(home, "Desktop", "other.txt"), "other", "utf8");
    assert.throws(() => access.organize([{ from: "Desktop/other.txt", to: "Desktop/Organized/Documents/note.txt" }]), /already exists/);
    assert.equal(readFileSync(path.join(home, "Desktop", "other.txt"), "utf8"), "other");
    assert.throws(() => access.organize([{ from: "Desktop/Organized", to: "Desktop/Other/Organized" }]), /regular files only/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
