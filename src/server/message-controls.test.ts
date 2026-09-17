import test from "node:test";
import assert from "node:assert/strict";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

/** U02c: the reactions endpoint contract the message controls depend on.
 * Owned message id, one of five emoji, toggle semantics; anything else is
 * a 400/404 the row surfaces instead of pretending success. */

test("reactions toggle exactly and reject everything else", { timeout: 120_000 }, async () => {
  const f = await skillAuthoringFixture({
    runtime: `#!${process.execPath}\nconsole.log(JSON.stringify({type:'text',text:'No model work needed.'}));\n`,
    configure(db) {
      db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", body: "React to this." });
    },
  });
  try {
    const message = f.db.listMessages("bot-nova").find((entry) => entry.body === "React to this.")!;
    const react = (id: string, body: unknown) =>
      f.post(`/api/messages/${id}/reactions`, body ?? {});
    const first = await react(message.id, { emoji: "👍" });
    assert.equal(first.status, 200);
    assert.deepEqual(((await first.json()) as { reactions: Array<{ emoji: string; count: number; reactedByYou: boolean }> }).reactions, [
      { emoji: "👍", count: 1, reactedByYou: true },
    ]);
    const second = await react(message.id, { emoji: "👍" });
    assert.equal(second.status, 200);
    assert.deepEqual(((await second.json()) as { reactions: unknown }).reactions, [], "toggling twice removes it");
    assert.equal((await react(message.id, { emoji: "💥" })).status, 400, "only the five supported emoji");
    assert.equal((await react(message.id, {})).status, 400);
    assert.equal((await react("missing", { emoji: "👍" })).status, 404);
    assert.equal(f.db.getMessage(message.id)?.reactions.length, 0, "failed attempts change nothing");
  } finally {
    await f.close();
  }
});
