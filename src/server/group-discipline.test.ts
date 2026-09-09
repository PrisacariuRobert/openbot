import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { botReplyMentions, replyEscalatesToOwner } from "../shared/routing.js";
import { GROUP_ROUND_LIMIT, GROUP_TURN_MESSAGE_LIMIT, routeBotReply } from "./group-routing.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-group-discipline-")), db = new OpenBotDatabase(root);
  return { root, db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("bot replies only pull in named members, never the whole roster", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Launch", ["nova", "pixel", "scout"]);
    const members = f.db.getThreadBots(group.id);
    assert.deepEqual(botReplyMentions("Ask @Pixel to check the copy", members), ["pixel"]);
    assert.deepEqual(botReplyMentions("@pixel @pixel @pixel", members), ["pixel"]);
    assert.deepEqual(botReplyMentions("@everyone @team look at this", members), []);
    assert.deepEqual(botReplyMentions("@user should we ship this?", members), []);
    assert.deepEqual(botReplyMentions("ping me at nova@example.com", members), []);
    assert.equal(replyEscalatesToOwner("@user the budget needs your call"), true);
    assert.equal(replyEscalatesToOwner("@Owner your say, please"), true);
    assert.equal(replyEscalatesToOwner("write to bob@usernet.example"), false);
  } finally { f.close(); }
});

test("a teammate reply @naming a member starts one queued follow-up with the trigger linked", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Launch", ["nova", "pixel"]);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "Draft the launch note" });
    const novaRun = f.db.createRun({ threadId: group.id, botId: "nova", prompt: "Draft the launch note", status: "queued" });
    const reply = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "nova", body: "Draft is up. @Pixel can you pressure-test the claims?", runId: novaRun.id });
    const routed = routeBotReply(f.db, f.db.getRun(novaRun.id)!, reply);
    assert.deepEqual(routed.routed, ["pixel"]);
    const followUp = f.db.listRuns(group.id).find((run) => run.id !== novaRun.id && run.botId === "pixel");
    assert.ok(followUp);
    assert.equal(followUp.status, "queued");
    assert.equal(followUp.triggerMessageId, reply.id);
    assert.match(followUp.prompt, /Nova brought you into the group chat/);
    assert.match(followUp.prompt, /pressure-test/);
  } finally { f.close(); }
});

test("round cap: three teammate rounds answer, the fourth is refused once, with one visible note", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Deep dive", ["nova", "pixel"]);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "Walk the plan" });
    // Round 1: owner-triggered reply mentions the next teammate.
    const run1 = f.db.createRun({ threadId: group.id, botId: "nova", prompt: "Walk the plan", status: "queued" });
    const reply1 = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "nova", body: "Step one is research. @Pixel take the numbers?", runId: run1.id });
    assert.deepEqual(routeBotReply(f.db, f.db.getRun(run1.id)!, reply1).routed, ["pixel"]);
    // Round 2: pixel's follow-up reply (threaded) mentions nova.
    const run2 = f.db.listRuns(group.id).find((run) => run.botId === "pixel" && run.status === "queued")!;
    const reply2 = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "pixel", body: "Numbers hold. @Nova close it out.", runId: run2.id, replyToId: reply1.id });
    assert.equal(f.db.replyChainDepth(reply2.id), 1);
    assert.deepEqual(routeBotReply(f.db, f.db.getRun(run2.id)!, reply2).routed, ["nova"]);
    // Round 3: nova's second follow-up mentions pixel once more — still inside the cap.
    const run3 = f.db.listRuns(group.id).filter((run) => run.botId === "nova" && run.status === "queued").at(-1)!;
    const reply3 = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "nova", body: "Closed. @Pixel file the summary.", runId: run3.id, replyToId: reply2.id });
    assert.equal(f.db.replyChainDepth(reply3.id), 2);
    assert.deepEqual(routeBotReply(f.db, f.db.getRun(run3.id)!, reply3).routed, ["pixel"]);
    // Round 4: pixel's third follow-up is one round too deep.
    const run4 = f.db.listRuns(group.id).filter((run) => run.botId === "pixel" && run.status === "queued").at(-1)!;
    const reply4 = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "pixel", body: "Filed. @Nova again for luck.", runId: run4.id, replyToId: reply3.id });
    assert.equal(f.db.replyChainDepth(reply4.id), 3);
    const refused = routeBotReply(f.db, f.db.getRun(run4.id)!, reply4);
    assert.deepEqual(refused.routed, []);
    assert.equal(refused.refusal, "round");
    const again = routeBotReply(f.db, f.db.getRun(run4.id)!, reply4);
    assert.equal(again.refusal, "round");
    assert.equal(f.db.listMessages(group.id).filter((message) => message.eventType === "group-cap").length, 1);
    assert.equal(f.db.listRuns(group.id).length, 4);
    assert.equal(GROUP_ROUND_LIMIT, 3);
  } finally { f.close(); }
});

test("reply cap: ten teammate replies per turn, then the room waits for the owner", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Busy room", ["nova", "pixel"]);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "Everyone report" });
    for (let index = 0; index < GROUP_TURN_MESSAGE_LIMIT; index++) {
      const run = f.db.createRun({ threadId: group.id, botId: index % 2 ? "pixel" : "nova", prompt: "Report", status: "queued" });
      f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: index % 2 ? "pixel" : "nova", body: `Point ${index}: done.`, runId: run.id });
    }
    const run = f.db.createRun({ threadId: group.id, botId: "nova", prompt: "Report", status: "queued" });
    const reply = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "nova", body: "All points covered. @Pixel one more?", runId: run.id });
    const routed = routeBotReply(f.db, f.db.getRun(run.id)!, reply);
    assert.deepEqual(routed.routed, []);
    assert.equal(routed.refusal, "messages");
    const notes = f.db.listMessages(group.id).filter((message) => message.eventType === "group-cap");
    assert.equal(notes.length, 1);
    assert.match(notes[0]!.body, /reply limit/);
  } finally { f.close(); }
});

test("a reply that names nobody settles the turn; an owner message starts it again", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Calm room", ["nova", "pixel"]);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "Status, please" });
    const run = f.db.createRun({ threadId: group.id, botId: "nova", prompt: "Status", status: "queued" });
    const reply = f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "nova", body: "Everything is on track.", runId: run.id });
    const routed = routeBotReply(f.db, f.db.getRun(run.id)!, reply);
    assert.deepEqual(routed.routed, []);
    assert.equal(routed.refusal, null);
    assert.equal(f.db.listRuns(group.id).length, 1);
    assert.equal(f.db.groupTurnState(group.id).botMessages, 1);
    assert.equal(f.db.listThreads().find((thread) => thread.id === group.id)?.needsYou, false);
  } finally { f.close(); }
});

test("@user escalates to a needs-you badge that the owner's next message clears", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Judgment call", ["nova"]);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "Can we ship the rebrand?" });
    const run = f.db.createRun({ threadId: group.id, botId: "nova", prompt: "Can we ship the rebrand?", status: "queued" });
    f.db.addMessage({ threadId: group.id, senderType: "bot", senderId: "nova", body: "Two options. @user your call on the timeline.", runId: run.id });
    assert.equal(f.db.groupTurnState(group.id).escalates, true);
    assert.equal(f.db.listThreads().find((thread) => thread.id === group.id)?.needsYou, true);
    // Escalation never starts work on its own.
    assert.equal(routeBotReply(f.db, f.db.getRun(run.id)!, f.db.listMessages(group.id).at(-1)!).routed.length, 0);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "Ship Friday." });
    assert.equal(f.db.groupTurnState(group.id).escalates, false);
    assert.equal(f.db.listThreads().find((thread) => thread.id === group.id)?.needsYou, false);
  } finally { f.close(); }
});

test("an open approval keeps the badge on until the owner decides", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("Approval room", ["nova"]);
    const run = f.db.createRun({ threadId: group.id, botId: "nova", prompt: "Post the thread", status: "awaiting_approval", approvalReason: "Confirm the post before it goes out." });
    assert.equal(f.db.listThreads().find((thread) => thread.id === group.id)?.needsYou, true);
    f.db.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    assert.equal(f.db.listThreads().find((thread) => thread.id === group.id)?.needsYou, false);
  } finally { f.close(); }
});

test("group discipline never applies to direct chats", () => {
  const f = fixture();
  try {
    const nova = f.db.getBot("nova")!;
    f.db.addMessage({ threadId: nova.threadId, senderType: "user", senderId: null, body: "What about Pixel's plan?" });
    const run = f.db.createRun({ threadId: nova.threadId, botId: "nova", prompt: "What about Pixel's plan?", status: "queued" });
    const reply = f.db.addMessage({ threadId: nova.threadId, senderType: "bot", senderId: "nova", body: "Pixel's plan is solid. @Pixel could confirm.", runId: run.id });
    const routed = routeBotReply(f.db, f.db.getRun(run.id)!, reply);
    assert.deepEqual(routed.routed, []);
    assert.equal(routed.refusal, null);
    assert.equal(f.db.listRuns(nova.threadId).length, 1);
  } finally { f.close(); }
});
