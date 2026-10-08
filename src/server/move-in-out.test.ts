import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { OpenBotDatabase } from "./database.js";
import { CommunitySkills, inspectCommunitySkill } from "./community-skills.js";
import { decideMemory, pendingMemories } from "./memory-review.js";
import { moveIn, readUpload, selfFacts, teammateFiles, teammateZip } from "./move-in-out.js";

// A synthetic ChatGPT export: conversations.json with the "mapping" tree it uses.
const chatgpt = [{
  title: "Trip planning", create_time: 1_759_000_000,
  mapping: {
    a: { message: { author: { role: "system" }, content: { parts: ["You are ChatGPT."] } } },
    b: { message: { author: { role: "user" }, content: { parts: ["I live in Vienna and I work as a product designer at Acme. Can you plan a weekend in Graz?"] }, create_time: 1_759_000_100 } },
    c: { message: { author: { role: "assistant" }, content: { parts: ["I am an AI. I prefer to suggest trains."] } } },
    d: { message: { author: { role: "user" }, content: { parts: ["My daughter is 7 and I prefer trains over cars.\nWhat's the weather like?"] }, create_time: 1_759_000_200 } },
  },
}, {
  title: "Recipes", create_time: 1_759_100_000,
  mapping: { e: { message: { author: { role: "user" }, content: { parts: ["I'm allergic to peanuts. Suggest a quick dinner.", { image: "ignored" }] } } } },
}];
// A synthetic Claude export: conversations.json with "chat_messages".
const claude = [{ uuid: "c1", name: "Work", created_at: "2026-09-01T10:00:00Z", chat_messages: [
  { sender: "human", text: "My manager is Lena Hofer. I usually start work at 8:30.", created_at: "2026-09-01T10:00:00Z" },
  { sender: "assistant", text: "My name is Claude.", created_at: "2026-09-01T10:00:05Z" },
] }];

const zipOf = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));

function studio() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-move-"));
  const db = new OpenBotDatabase(root);
  return { db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("only sentences where you described yourself become memory suggestions", () => {
  assert.deepEqual(selfFacts("I live in Vienna and I work as a product designer at Acme. Can you plan a weekend in Graz?"), ["I live in Vienna and I work as a product designer at Acme."]);
  assert.deepEqual(selfFacts("What's my name? Tell me a joke. I think so."), []);
  assert.deepEqual(selfFacts("My API key is sk-abcdefghijklmnopqrstuvwx and I like tea."), [], "nothing with a key in it");
});

test("a ChatGPT or Claude export brings facts into the review queue, never straight into memory", () => {
  const s = studio();
  try {
    const nova = s.db.createBot({ name: "Nova", emoji: "●", color: "#6757d9", role: "Chief of staff", instructions: "Keep the week calm.", computerEnabled: false, browserEnabled: false });
    s.db.remember(nova.id, "I live in Vienna and I", "Already known.", { source: "owner" });
    const fromChatGPT = moveIn(s.db, readUpload(zipOf({ "conversations.json": JSON.stringify(chatgpt), "user.json": "{}" }), "export.zip"), { botId: nova.id });
    assert.deepEqual({ kind: fromChatGPT.kind, queued: fromChatGPT.queued, created: fromChatGPT.created }, { kind: "chatgpt", queued: 3, created: false });
    assert.equal(s.db.memoryEntries(nova.id).length, 1, "nothing is used before review");
    const waiting = pendingMemories(s.db, nova.id);
    assert.deepEqual(waiting.map((item) => item.content), ["I live in Vienna and I work as a product designer at Acme.", "My daughter is 7 and I prefer trains over cars.", "I'm allergic to peanuts."]);
    assert.equal(waiting[0]!.key, "I live in Vienna and I (2)", "a name already used gets a number, so keeping it overwrites nothing");
    assert.ok(waiting.every((item) => item.from === "your ChatGPT export" && item.origin === "file"));
    assert.equal(moveIn(s.db, readUpload(strToU8(JSON.stringify(chatgpt)), "conversations.json"), { botId: nova.id }).queued, 0, "the same facts aren't queued twice");

    const fromClaude = moveIn(s.db, readUpload(zipOf({ "data/conversations.json": JSON.stringify(claude), "data/memories.json": JSON.stringify([{ content: "Prefers short answers." }]) }), "claude.zip"), { botId: nova.id });
    assert.equal(fromClaude.kind, "claude");
    assert.deepEqual(pendingMemories(s.db, nova.id).slice(3).map((item) => item.content), ["Prefers short answers.", "My manager is Lena Hofer.", "I usually start work at 8:30."]);

    assert.throws(() => moveIn(s.db, readUpload(strToU8("[{\"hello\":1}]"), "x.json"), { botId: nova.id }), /isn't a ChatGPT or Claude data export/);
    assert.throws(() => moveIn(s.db, readUpload(strToU8(JSON.stringify(chatgpt)), "c.json"), {}), /Choose which teammate/);
    assert.throws(() => readUpload(strToU8("not json"), "x.json") && moveIn(s.db, { "x.json": "not json" }, { botId: nova.id }), /isn't JSON/);
  } finally { s.close(); }
});

test("round trip: import an export, take the teammate out as files, and bring it back unchanged in another studio", () => {
  const home = studio(), elsewhere = studio();
  try {
    const nova = home.db.createBot({ name: "Nova", emoji: "●", mascot: "nova", color: "#6757d9", role: "Chief of staff", instructions: "Keep the week calm. Ask before booking.", computerEnabled: false, browserEnabled: false });
    home.db.createRoutine({ name: "Morning brief", botId: nova.id, threadId: nova.threadId, prompt: "Summarise today's calendar and mail.", intervalMinutes: 1_440, enabled: true });
    const skill = { files: { "SKILL.md": "---\nname: tidy-invoices\ndescription: Tidy invoices into a table.\nlicense: MIT\n---\nRun `scripts/totals.py` to add up amounts.\n", "scripts/totals.py": "print(1)\n" }, source: "https://raw.githubusercontent.com/example/skills/main/tidy-invoices/SKILL.md" };
    new CommunitySkills(home.db).install(skill, inspectCommunitySkill(skill).digest, [nova.id]);
    moveIn(home.db, readUpload(zipOf({ "conversations.json": JSON.stringify(chatgpt) }), "export.zip"), { botId: nova.id });
    for (const item of pendingMemories(home.db, nova.id)) decideMemory(home.db, item.id, "keep");

    const { files, folder } = teammateFiles(home.db, nova.id);
    assert.equal(folder, "nova");
    for (const name of ["nova/AGENTS.md", "nova/README.md", "nova/memory.md", "nova/teammate.json", "nova/skills/tidy-invoices/SKILL.md", "nova/skills/tidy-invoices/scripts/totals.py"]) assert.ok(files[name], name);
    assert.match(files["nova/AGENTS.md"]!, /# Nova\n\nChief of staff\.\n\n## Instructions\n\nKeep the week calm\. Ask before booking\./);
    assert.match(files["nova/AGENTS.md"]!, /- \*\*I'm allergic to peanuts:\*\* I'm allergic to peanuts\./);
    assert.match(files["nova/memory.md"]!, /## My daughter is 7 and I/);
    assert.doesNotMatch(JSON.stringify(files), /sk-|BEGIN .*PRIVATE KEY/);

    const { bytes } = teammateZip(home.db, nova.id);
    const back = moveIn(elsewhere.db, readUpload(bytes, "nova.sidemates.zip"), {});
    assert.equal(back.kind, "sidemates");
    assert.equal(back.created, true);
    assert.equal(back.queued, 3, "its memories wait for review here too");
    for (const item of pendingMemories(elsewhere.db, back.botId)) decideMemory(elsewhere.db, item.id, "keep");

    const original = home.db.getBot(nova.id)!, copy = elsewhere.db.getBot(back.botId)!;
    const persona = (bot: typeof original) => ({ name: bot.name, emoji: bot.emoji, mascot: bot.mascot, color: bot.color, role: bot.role, instructions: bot.instructions });
    assert.deepEqual(persona(copy), persona(original));
    const memories = (db: OpenBotDatabase, botId: string) => db.memoryEntries(botId).map((entry) => [entry.key, entry.content]).sort();
    assert.deepEqual(memories(elsewhere.db, back.botId), memories(home.db, nova.id));
    const routines = (db: OpenBotDatabase, botId: string) => db.listRoutines().filter((routine) => routine.botId === botId).map((routine) => [routine.name, routine.prompt, routine.intervalMinutes]);
    assert.deepEqual(routines(elsewhere.db, back.botId), routines(home.db, nova.id));
    assert.equal(elsewhere.db.listRoutines().find((routine) => routine.botId === back.botId)!.enabled, false, "routines arrive paused");
    const skillsOf = (db: OpenBotDatabase, botId: string) => new CommunitySkills(db).list().filter((entry) => entry.botIds.includes(botId)).map((entry) => [entry.name, entry.digest]).sort();
    assert.deepEqual(skillsOf(elsewhere.db, back.botId), skillsOf(home.db, nova.id));
    assert.equal(new CommunitySkills(elsewhere.db).list().find((entry) => entry.name === "tidy-invoices")!.scriptsEnabled, false, "scripts come back off");

    // Taken out again, the files are the same.
    assert.deepEqual(teammateFiles(elsewhere.db, back.botId).files, files);
  } finally { home.close(); elsewhere.close(); }
});
