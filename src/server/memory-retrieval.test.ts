import test from "node:test";
import assert from "node:assert/strict";
import { nearDuplicateNote, rankMemories, rankTexts } from "./memory-retrieval.js";

test("rarity weighting lifts a distinctive shared term over filler", () => {
  const ranking = rankTexts(
    "quarterly board deck template",
    [
      { text: "the deck that we made for the team", weight: 1 },
      { text: "quarterly board deck notes", weight: 1 },
    ],
    5,
  );
  assert.equal(ranking[0].item.text, "quarterly board deck notes");
  assert.equal(ranking[1].item.text, "the deck that we made for the team");
});

test("a note missing one query word can still outrank a sparser exact match", () => {
  const others = Array.from({ length: 8 }, (_, index) => ({ key: `beach-${index}`, content: "beach picnic shade sun towel swim waves sand chairs" }));
  const ranking = rankMemories("beach lighthouse picnic photos", [
    ...others,
    { key: "lighthouse", content: "lighthouse picnic photos for the spring visit" },
    { key: "weather", content: "beach weather notes" },
  ]);
  assert.equal(ranking[0].key, "lighthouse");
});

test("irrelevant notes are dropped and ordering is deterministic", () => {
  const notes = [
    { key: "a", content: "alpha beach shade tone" },
    { key: "b", content: "alpha beach shade tone" },
    { key: "c", content: "completely different garden" },
  ];
  const ranking = rankMemories("alpha beach", notes, 5);
  assert.deepEqual(ranking.map((note) => note.key), ["a", "b"]);
  assert.equal(ranking[0].score, ranking[1].score);
  assert.deepEqual(rankMemories("alpha beach", [...notes].reverse(), 5).map((note) => note.key), ["b", "a"]);
});

test("empty queries return nothing and junk-only queries match nothing", () => {
  assert.deepEqual(rankMemories("", [{ key: "a", content: "anything" }]), []);
  assert.deepEqual(rankMemories("the and of", [{ key: "a", content: "alpha" }]), []);
  assert.deepEqual(rankMemories("the", [{ key: "a", content: "the" }]), []);
});

test("phrase matches score higher than scattered terms", () => {
  const ranking = rankMemories("expense reconciliation totals", [
    { key: "todo", content: "expense budgets, plans and reconciliation totals for later" },
    { key: "spread", content: "client spreadsheet: one expense, one reconciliation, totals pending" },
  ]);
  assert.equal(ranking[0].key, "todo");
});

test("near-duplicate detection proposes consolidation without merging anything", () => {
  const existing = { key: "brief-hours", content: "Morning brief is read at 07:15 Central on weekdays." };
  assert.equal(nearDuplicateNote("morning brief is read at 07:00 central on weekdays", [existing])?.key, "brief-hours");
  assert.equal(nearDuplicateNote("annual audit happens each october", [existing]), null);
  assert.equal(nearDuplicateNote("one two", [existing]), null);
  const ranking = rankTexts("", [], 3);
  assert.deepEqual(ranking, []);
});
