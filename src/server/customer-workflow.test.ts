import assert from "node:assert/strict";
import test from "node:test";
import { customerWorkflowFixture } from "./testing/customer-workflow-fixture.js";

for (const [customer, lostResponses] of [["Cedar", false], ["Harbor", true]] as const) {
  test(`${customer}: actual host runs customer mail → reviewed meeting → reviewed threaded reply${lostResponses ? " with both responses lost" : ""}`, { timeout: 45_000 }, async () => {
    const f = await customerWorkflowFixture(customer, lostResponses);
    try {
      const meeting = await f.pending("google_calendar_create");
      assert.equal(f.writes.length, 0, "Nothing external changes before approval");
      assert.equal((await f.approve(meeting.id)).status, 200);
      assert.equal(f.db.getApprovedAction(meeting.id)?.status, "completed");
      const reply = await f.pending("gmail_reply"), review = await f.preview(reply.id);
      assert.equal(f.writes.length, 1, "Creating the meeting never implies consent to send the reply");
      assert.equal(review.fields.find((field: { label: string }) => field.label === "Reply to")?.value, customer.toLowerCase() + "-team@example.com");
      assert.match(review.fields.find((field: { label: string }) => field.label === "Your reply").value, new RegExp("eid=" + customer.toLowerCase()));
      assert.equal((await f.approve(reply.id)).status, 200);
      assert.equal(f.db.getApprovedAction(reply.id)?.status, "completed");
      assert.equal(f.writes.length, 2, "Exactly one calendar insert and one email send, even with lost responses");
      assert.equal(f.sent()?.threadId, "thread001");
      assert.equal(f.sent()?.payload?.headers?.find(header => header.name === "In-Reply-To")?.value, `<${customer.toLowerCase()}@example.com>`);
      const receipt = f.db.getApprovedAction(reply.id)!;
      assert.match(receipt.resultSummary || "", /not recipient delivery or reading/);
      if (lostResponses) assert.match(receipt.resultSummary || "", /without another send request/);
      await f.until(() => f.db.getRun(f.runId)?.status === "completed");
      const workReceipt = f.db.buildRunReceipt(f.runId)!;
      assert.equal(workReceipt.externalActions.length, 2);
      assert.ok(workReceipt.externalActions.every(action => action.status === "completed"));
      assert.match(f.db.getRun(f.runId)?.summary || "", /meeting is created and the reply is checked/);
      assert.deepEqual(f.failures, []);
    } finally { await f.close(); }
  });
}

test("an intervening customer message invalidates only the reply; the completed meeting is preserved", { timeout: 45_000 }, async () => {
  const f = await customerWorkflowFixture();
  try {
    const meeting = await f.pending("google_calendar_create"); await f.approve(meeting.id);
    const reply = await f.pending("gmail_reply"); f.injectIncoming();
    await f.approve(reply.id);
    assert.equal(f.db.getApprovedAction(reply.id)?.status, "failed");
    assert.equal(f.db.getApprovedAction(meeting.id)?.status, "completed");
    assert.equal(f.writes.length, 1, "The stale reply is never sent and the existing meeting is not recreated");
    assert.match(f.db.getRun(f.runId)?.prompt || "", /latest received/);
    assert.deepEqual(f.failures, []);
  } finally { await f.close(); }
});

for (const mode of ["denied", "read-revoked", "send-revoked"] as const) {
  test(`${mode}: no reply is dispatched and the existing meeting remains`, { timeout: 45_000 }, async () => {
    const f = await customerWorkflowFixture();
    try {
      const meeting = await f.pending("google_calendar_create"); await f.approve(meeting.id);
      const reply = await f.pending("gmail_reply"), original = await f.preview(reply.id);
      if (mode === "denied") {
        assert.equal((await f.post(`/api/approvals/${reply.id}/decide`, { decision: "denied" })).status, 200);
        assert.equal(f.db.getApproval(reply.id)?.status, "denied");
      } else {
        f.db.setBotConnectorAccess("nova", { canRead: mode !== "read-revoked", canSend: mode !== "send-revoked" });
        const stale = await f.post(`/api/approvals/${reply.id}/decide`, { decision: "approved", reviewFingerprint: original.reviewFingerprint });
        assert.equal(stale.status, 409);
        const changed = await f.preview(reply.id);
        assert.equal(changed.canApprove, false);
        assert.equal(changed.reviewFingerprint, null);
        assert.match(changed.limitation, /read and send access/);
      }
      assert.equal(f.db.getApprovedAction(meeting.id)?.status, "completed");
      assert.equal(f.db.getApprovedAction(reply.id), null);
      assert.equal(f.writes.length, 1);
      assert.deepEqual(f.failures, []);
    } finally { await f.close(); }
  });
}
