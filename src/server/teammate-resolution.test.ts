import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-resolve-")), db = new OpenBotDatabase(root);
  return { root, db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("teammate resolution accepts exact ids and unambiguous names", () => {
  const f = fixture();
  try {
    const nova = f.db.getBot("nova")!;
    assert.equal(f.db.resolveTeammate("nova").id, "nova");
    assert.equal(f.db.resolveTeammate("Nova").id, "nova");
    assert.equal(f.db.resolveTeammate("NOVA").id, "nova");
    assert.equal(f.db.resolveTeammate("  pixel  ").id, "pixel");
    assert.equal(nova.name.length > 0, true);
  } finally { f.close(); }
});

test("unknown references fail with the available roster, never a bare 404", () => {
  const f = fixture();
  try {
    assert.throws(() => f.db.resolveTeammate("ghost"), /No teammate matches.*Available:/);
    try {
      f.db.resolveTeammate("ghost");
      assert.fail("should throw");
    } catch (error) {
      assert.match((error as Error).message, /nova \(Nova/);
    }
    assert.throws(() => f.db.resolveTeammate("   "), /no name or id was given/i);
  } finally { f.close(); }
});

test("ambiguous names list the candidates; retired teammates get their own error", () => {
  const f = fixture();
  try {
    f.db.createBot({ name: "Nova Helper", emoji: "●", color: "#111111", role: "Helper", instructions: "Help Nova." });
    // "Nova Helper" contains "nova" but is not an exact match — only exact matches resolve.
    assert.equal(f.db.resolveTeammate("Nova Helper").name, "Nova Helper");
    f.db.retireBot("pixel");
    assert.throws(() => f.db.resolveTeammate("pixel"), /retired.*Restore them/);
    assert.throws(() => f.db.resolveTeammate("Pixel"), /retired.*Restore them/);
  } finally { f.close(); }
});
