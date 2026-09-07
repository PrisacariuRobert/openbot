import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { mentionedBotIds } from "../shared/routing.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-group-")), db = new OpenBotDatabase(root);
  return { root, db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("owner-created groups keep their own membership, title and history", () => {
  const f = fixture();
  try {
    const nova = f.db.getBot("nova")!;
    const pixel = f.db.getBot("pixel")!;
    const group = f.db.createGroupThread("Launch  week", ["nova", "pixel", "nova"]);
    assert.equal(group.kind, "room");
    assert.equal(group.title, "Launch week");
    assert.deepEqual(group.botIds, ["nova", "pixel"]);
    assert.match(String((f.db.listThreads().find((thread) => thread.id === group.id) || {}).botIds), /pixel|nova/);
    assert.deepEqual(f.db.getThreadBots(group.id).map((bot) => bot.id), ["nova", "pixel"]);
    const members = f.db.getThreadBots(group.id).map((bot) => bot.name);
    assert.equal(members.includes(nova.name) && members.includes(pixel.name), true);
    assert.ok(f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "First post" }));
  } finally { f.close(); }
});

test("group validation refuses unknown members, empty rooms and oversized lists", () => {
  const f = fixture();
  try {
    assert.throws(() => f.db.createGroupThread("", ["nova"]), /short name/);
    assert.throws(() => f.db.createGroupThread("Empty", []), /at least one/);
    assert.throws(() => f.db.createGroupThread("Ghosts", ["nova", "ghost"]), /existing teammates/);
    assert.throws(() => f.db.createGroupThread("Too many", ["nova", "pixel", "scout", "a", "b", "c", "d"]), /minimal| teammates| six/);
  } finally { f.close(); }
});

test("membership changes and renames are explained in the thread without touching the all-hands room", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Watchers", ["nova"]);
    const renamed = f.db.renameGroupThread(group.id, "  Watch   list ");
    assert.equal(renamed?.title, "Watch list");
    const changed = f.db.setGroupMembers(group.id, ["pixel", "scout"]);
    assert.deepEqual(changed?.botIds, ["pixel", "scout"]);
    const notes = f.db.listMessages(group.id).map((message) => message.body);
    assert.equal(notes.some((body) => /Nova left|Pixel joined|Reading/.test(body) || /joined.*left|left.*joined/.test(body)), true);
    assert.throws(() => f.db.setGroupMembers(group.id, []), /at least one/);
    assert.throws(() => f.db.setGroupMembers(group.id, ["ghost"]), /existing teammates/);
    assert.equal(f.db.setGroupMembers("team-room", ["nova"]), null);
    assert.equal(f.db.renameGroupThread("team-room", "Rename attempt"), null);
  } finally { f.close(); }
});

test("group threads route messages through the same mention and candidate rules", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Research room", ["nova", "pixel"]);
    const candidates = f.db.getThreadBots(group.id);
    assert.deepEqual(mentionedBotIds("@Pixel start", candidates), ["pixel"]);
    assert.deepEqual(mentionedBotIds("@everyone plan", candidates), ["nova", "pixel"]);
    f.db.setGroupMembers(group.id, ["nova"]);
    assert.deepEqual(f.db.getThreadBots(group.id).map((bot) => bot.id), ["nova"]);
    assert.deepEqual(mentionedBotIds("@Pixel", f.db.getThreadBots(group.id)), []);
  } finally { f.close(); }
});

test("pin, section and hide now group threads like direct conversations", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Pinned work", ["nova"]);
    const updated = f.db.updateThread(group.id, { pinned: true, section: "Projects", hidden: false });
    assert.equal((f.db.listThreads().find((thread) => thread.id === group.id) || {}).pinned, true);
    assert.equal((f.db.listThreads().find((thread) => thread.id === group.id) || {}).section, "Projects");
    assert.equal(f.db.updateThread("team-room", { hidden: true }), null);
    assert.ok(updated);
  } finally { f.close(); }
});
