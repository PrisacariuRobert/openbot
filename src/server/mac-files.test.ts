import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MacFileAccess, MacOrganizationIncompleteError } from "./mac-files.js";

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
    assert.equal(result.complete, true);
    assert.deepEqual(result.remaining, []);
    assert.deepEqual(result.copies, []);
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

function moveFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mac-move-test-"));
  mkdirSync(path.join(root, "Desktop"));
  for (const name of ["first", "second"]) writeFileSync(path.join(root, "Desktop", `${name}.txt`), `${name} original bytes`);
  const moves = ["first", "second"].map((name) => ({ from: `Desktop/${name}.txt`, to: `Documents/${name}.txt` }));
  return { root, moves, read: (relative: string) => readFileSync(path.join(root, relative), "utf8"), close: () => rmSync(root, { recursive: true, force: true }) };
}

test("Mac organization cannot overwrite a destination created after preflight", () => {
  const f = moveFixture();
  try {
    const access = new MacFileAccess(f.root, { claimDestination: (source, destination) => { writeFileSync(destination, "Someone else's new file"); linkSync(source, destination); }, removeSource: unlinkSync });
    const result = access.organize(f.moves);
    assert.equal(result.complete, false);
    assert.equal(result.count, 0);
    assert.deepEqual(result.remaining, f.moves);
    assert.match(result.error!, /not overwritten/);
    assert.equal(f.read(f.moves[0].to), "Someone else's new file");
    assert.equal(f.read(f.moves[0].from), "first original bytes");
    assert.equal(f.read(f.moves[1].from), "second original bytes");
  } finally { f.close(); }
});

test("Mac organization reports partial success without replaying or undoing completed moves", () => {
  const f = moveFixture(); let claims = 0;
  try {
    const access = new MacFileAccess(f.root, { claimDestination: (source, destination) => { if (++claims === 2) writeFileSync(destination, "New destination claimed by someone else"); linkSync(source, destination); }, removeSource: unlinkSync });
    const result = access.organize(f.moves);
    assert.equal(result.complete, false);
    assert.equal(result.count, 1);
    assert.equal(claims, 2);
    assert.deepEqual(result.moved, [f.moves[0]]);
    assert.deepEqual(result.remaining, [f.moves[1]]);
    assert.equal(existsSync(path.join(f.root, f.moves[0].from)), false);
    assert.equal(f.read(f.moves[0].to), "first original bytes");
    assert.equal(f.read(f.moves[1].from), "second original bytes");
    assert.equal(f.read(f.moves[1].to), "New destination claimed by someone else");
    const error = new MacOrganizationIncompleteError(result);
    assert.match(error.message, /Moved:.*first\.txt/);
    assert.match(error.message, /Unfinished moves:.*second\.txt/);
    assert.match(error.message, /Do not repeat completed moves/);
    assert.equal(error.result, result);
  } finally { f.close(); }
});

test("Mac organization retains both copies and stops if removing the source fails", () => {
  const f = moveFixture(); let claims = 0;
  try {
    const access = new MacFileAccess(f.root, { claimDestination: (source, destination) => { claims++; linkSync(source, destination); }, removeSource: () => { throw Object.assign(new Error("Synthetic access failure"), { code: "EACCES" }); } });
    const result = access.organize(f.moves);
    assert.equal(result.complete, false);
    assert.equal(result.count, 0);
    assert.equal(claims, 1);
    assert.deepEqual(result.copies, [f.moves[0]]);
    assert.deepEqual(result.remaining, f.moves);
    assert.equal(f.read(f.moves[0].from), "first original bytes");
    assert.equal(f.read(f.moves[0].to), "first original bytes");
    assert.equal(f.read(f.moves[1].from), "second original bytes");
    assert.match(new MacOrganizationIncompleteError(result).message, /Destination copies retained/);
  } finally { f.close(); }
});

test("Mac organization detects a replaced source before removing it", () => {
  const f = moveFixture(); let removals = 0;
  try {
    const access = new MacFileAccess(f.root, { claimDestination: (source, destination) => { linkSync(source, destination); unlinkSync(source); writeFileSync(source, "Replacement file from another process"); }, removeSource: (source) => { removals++; unlinkSync(source); } });
    const result = access.organize(f.moves);
    assert.equal(result.complete, false);
    assert.equal(removals, 0);
    assert.deepEqual(result.copies, [f.moves[0]]);
    assert.equal(f.read(f.moves[0].from), "Replacement file from another process");
    assert.equal(f.read(f.moves[0].to), "first original bytes");
  } finally { f.close(); }
});

test("Mac organization refuses cross-filesystem fallback and preserves every source", () => {
  const f = moveFixture(); let removals = 0;
  try {
    const access = new MacFileAccess(f.root, { claimDestination: () => { throw Object.assign(new Error("Synthetic other filesystem"), { code: "EXDEV" }); }, removeSource: (source) => { removals++; unlinkSync(source); } });
    const result = access.organize(f.moves);
    assert.equal(result.complete, false);
    assert.equal(result.count, 0);
    assert.equal(removals, 0);
    assert.match(result.error!, /crosses filesystems/);
    for (const move of f.moves) assert.equal(existsSync(path.join(f.root, move.from)), true);
  } finally { f.close(); }
});
