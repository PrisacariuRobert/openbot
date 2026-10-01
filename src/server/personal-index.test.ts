import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MacMail } from "./mac-mail-index.js";
import { ftsQuery, PersonalIndex, type IndexItem } from "./personal-index.js";
import { PersonalIndexer, walkFolder, type IndexerConfig } from "./personal-indexer.js";

const item = (over: Partial<IndexItem>): IndexItem => ({ source: "notes", key: "n1", title: "Note", at: "2026-09-01T10:00:00.000Z", body: "", ...over });

test("questions become forgiving searches: no filler words, accents ignored, prefixes match", () => {
  assert.equal(ftsQuery("What did Anna say about the Berlin trip?"), '"anna"* OR "berlin"* OR "trip"*');
  assert.equal(ftsQuery("Café Zürich"), '"cafe"* OR "zurich"*');
  assert.equal(ftsQuery("the of a"), null);
});

test("search ranks titles and names above passing mentions, across sources", () => {
  const index = new PersonalIndex(":memory:");
  index.upsert([
    item({ key: "a", title: "Berlin trip plan", body: "Flights on Friday, hotel near the station." }),
    item({ key: "b", title: "Groceries", body: "Milk, bread. Also mention of Berlin once." }),
    item({ source: "mail", key: "m1", title: "Re: dinner", author: "Anna Keller <anna@example.com>", at: "2026-09-10T08:00:00.000Z", body: "Can we move dinner to 8? Also Berlin tickets are booked." }),
  ]);
  const hits = index.search("what did Anna say about the Berlin trip");
  // Anna's email and the trip plan are both good answers; the passing mention is last.
  assert.deepEqual(hits.map((hit) => hit.key).sort(), ["a", "b", "m1"]);
  assert.equal(hits[2]!.key, "b");
  assert.match(hits.find((hit) => hit.key === "m1")!.snippet, /Berlin tickets/);
  assert.deepEqual(index.search("berlin", { sources: ["mail"] }).map((hit) => hit.key), ["m1"]);
  assert.deepEqual(index.search("berlin", { since: "2026-09-05T00:00:00.000Z" }).map((hit) => hit.key), ["m1"]);
  assert.equal(index.search("zzz-nothing").length, 0);
  assert.equal(index.search("BERLIN café".replace("café", "cafe")).length, 3);
});

test("updates replace, unchanged items are skipped, prune and clear remove", () => {
  const index = new PersonalIndex(":memory:");
  assert.equal(index.upsert([item({ key: "x", body: "alpha", stamp: "1" }), item({ key: "y", body: "beta", stamp: "1" })]), 2);
  assert.equal(index.upsert([item({ key: "x", body: "alpha", stamp: "1" })]), 0);
  assert.equal(index.upsert([item({ key: "x", body: "gamma", stamp: "2" })]), 1);
  assert.equal(index.search("alpha").length, 0);
  assert.equal(index.search("gamma").length, 1);
  assert.equal(index.prune("notes", new Set(["x"])), 1);
  assert.equal(index.search("beta").length, 0);
  assert.deepEqual(index.counts().notes.items, 1);
  index.clear("notes");
  assert.equal(index.counts().notes.items, 0);
  assert.equal(index.search("gamma").length, 0);
});

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "openbot-home-"));
  let saved: IndexerConfig | null = null;
  const index = new PersonalIndex(":memory:");
  return { home, index, options: { index, home, platform: "darwin" as const, load: () => saved, save: (config: IndexerConfig) => { saved = structuredClone(config); } }, saved: () => saved };
}

test("folders: only documents inside the home folder, hidden and app folders skipped, changes re-read", async () => {
  const { home, index, options } = setup();
  try {
    const docs = path.join(home, "Documents"); mkdirSync(path.join(docs, "Trips"), { recursive: true }); mkdirSync(path.join(docs, ".git"), { recursive: true }); mkdirSync(path.join(docs, "node_modules/x"), { recursive: true });
    writeFileSync(path.join(docs, "Trips/berlin.md"), "# Berlin\nHotel: Motel One. Check-in Friday.");
    writeFileSync(path.join(docs, "readme.txt"), "Plain notes about taxes.");
    writeFileSync(path.join(docs, ".git/config.txt"), "secret hidden");
    writeFileSync(path.join(docs, "node_modules/x/a.md"), "vendor text");
    writeFileSync(path.join(docs, "photo.png"), "not indexed");
    assert.deepEqual(walkFolder(docs).map((file) => path.relative(docs, file)).sort(), ["Trips/berlin.md", "readme.txt"]);

    const indexer = new PersonalIndexer(options);
    assert.throws(() => indexer.addFolder("/etc"), /inside your home folder/);
    assert.throws(() => indexer.addFolder(path.join(home, "Nope")), /doesn't exist/);
    mkdirSync(path.join(home, "Library/Mail"), { recursive: true });
    assert.throws(() => indexer.addFolder("Library/Mail"), /Library/);
    indexer.addFolder("Documents");
    await indexer.refresh("files");
    assert.deepEqual(index.search("motel").map((hit) => hit.title), ["berlin.md"]);
    assert.equal(index.search("secret hidden").length, 0);
    assert.equal(indexer.status().sources.find((source) => source.id === "files")!.items, 2);

    writeFileSync(path.join(docs, "readme.txt"), "Now about insurance.");
    utimesSync(path.join(docs, "readme.txt"), new Date(), new Date(Date.now() + 5_000));
    rmSync(path.join(docs, "Trips/berlin.md"));
    await indexer.refresh("files");
    assert.equal(index.search("taxes").length, 0);
    assert.equal(index.search("insurance").length, 1);
    assert.equal(index.search("motel").length, 0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("notes come from Notes through one bulk read; switching off forgets them", async () => {
  const { home, index, options } = setup();
  try {
    const indexer = new PersonalIndexer({ ...options, notes: async () => [item({ key: "note-1", title: "Trip to Antwerp", body: "Cathedral visit, then the mosque.", author: "Travel" })] });
    indexer.setEnabled("notes", true);
    await indexer.refresh("notes");
    assert.equal(index.search("cathedral")[0]!.title, "Trip to Antwerp");
    assert.ok(indexer.status().sources.find((source) => source.id === "notes")!.indexedAt);
    indexer.setEnabled("notes", false);
    assert.equal(index.search("cathedral").length, 0);
    assert.equal(indexer.status().sources.find((source) => source.id === "notes")!.enabled, false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("mail is indexed once per message; without Full Disk Access the owner is told what to switch on", async () => {
  const { home, index, options } = setup();
  try {
    const messages = path.join(home, "Library/Mail/V10/ACC/INBOX.mbox/U/Data/1/Messages"); mkdirSync(messages, { recursive: true });
    const raw = "From: Figma <billing@figma.com>\nSubject: Your Figma invoice\nDate: Tue, 29 Sep 2026 08:00:00 +0000\nContent-Type: text/plain\n\nAmount due 45 euro, pay by Friday.\n";
    const bytes = Buffer.from(raw.replace(/\n/g, "\r\n"));
    writeFileSync(path.join(messages, "77.emlx"), Buffer.concat([Buffer.from(`${bytes.length}\n`), bytes]));
    const indexer = new PersonalIndexer({ ...options, mail: new MacMail(home, "darwin") });
    indexer.setEnabled("mail", true);
    await indexer.refresh("mail");
    const hit = index.search("what do I owe figma")[0]!;
    assert.equal(hit.key, "77");
    assert.match(hit.snippet, /Amount due 45 euro/);
    await indexer.refresh("mail");
    assert.equal(indexer.status().sources.find((source) => source.id === "mail")!.items, 1);

    const locked = setup();
    const blocked = new PersonalIndexer({ ...locked.options, mail: new MacMail(locked.home, "darwin") });
    blocked.setEnabled("mail", true);
    await blocked.refresh("mail");
    const problem = blocked.status().sources.find((source) => source.id === "mail")!.problem!;
    assert.equal(problem.needsFullDiskAccess, true);
    assert.match(problem.message, /Full Disk Access/);
    rmSync(locked.home, { recursive: true, force: true });
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("forgetting everything empties the index and switches every source off", async () => {
  const { home, index, options } = setup();
  try {
    const indexer = new PersonalIndexer({ ...options, notes: async () => [item({ key: "k", title: "T", body: "remember the milk" })] });
    indexer.setEnabled("notes", true);
    await indexer.refresh("notes");
    indexer.forget();
    assert.equal(index.search("milk").length, 0);
    assert.equal(indexer.status().total, 0);
    assert.equal(indexer.anyEnabled(), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("the index file is readable by its owner only", async () => {
  const { statSync } = await import("node:fs");
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-index-"));
  try {
    const index = new PersonalIndex(path.join(dir, "personal-index.sqlite"));
    index.upsert([item({ key: "p", body: "private words" })]);
    for (const name of ["personal-index.sqlite", "personal-index.sqlite-wal"]) {
      try { assert.equal(statSync(path.join(dir, name)).mode & 0o077, 0, name); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    index.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("forgetting really removes the text from the file on disk", async () => {
  const { readFileSync, statSync } = await import("node:fs");
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-forget-"));
  const file = path.join(dir, "personal-index.sqlite");
  try {
    const index = new PersonalIndex(file);
    index.upsert(Array.from({ length: 40 }, (_, n) => item({ key: `k${n}`, title: `Note ${n}`, body: `zebra-secret-${n} ${"filler words ".repeat(2_000)}` })));
    const onDisk = () => ["", "-wal"].reduce((sum, suffix) => { try { return sum + statSync(file + suffix).size; } catch { return sum; } }, 0);
    assert.ok(onDisk() > 500_000);
    index.clear();
    assert.ok(onDisk() < 100_000, `still ${onDisk()} bytes`);
    for (const name of ["personal-index.sqlite", "personal-index.sqlite-wal"]) {
      try { assert.equal(readFileSync(path.join(dir, name)).includes("zebra-secret"), false, name); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    index.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
