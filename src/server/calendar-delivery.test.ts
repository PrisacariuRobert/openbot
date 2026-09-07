import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { GoogleWorkspaceConnector, GOOGLE_SCOPES } from "./google-workspace.js";
import { ApprovedConnectorDispatch, ApprovedConnectorOutcomeUncertainError, ApprovalReviewChangedError } from "./approval-review-binding.js";
import { calendarDeliveryBody, calendarDeliveryMatches, type CalendarDeliveryEvent } from "./calendar-delivery.js";

const input = { title: "Project review", start: "2026-09-08T09:00:00+02:00", end: "2026-09-08T09:30:00+02:00", description: "Review only the approved project", attendees: ["friend@example.com"] };
const body = calendarDeliveryBody({ summary: input.title, description: input.description, start: { dateTime: input.start }, end: { dateTime: input.end }, attendees: [{ email: "friend@example.com" }] }, "approval-one");

test("calendar identity is stable per approval, valid base32hex, and never shared between approvals", () => {
  assert.match(body.id, /^[0-9a-v]{5,1024}$/);
  const { id: _, extendedProperties: __, ...content } = body;
  assert.equal(calendarDeliveryBody(content, "approval-one").id, body.id);
  assert.notEqual(calendarDeliveryBody(content, "approval-two").id, body.id);
  assert.notEqual(calendarDeliveryBody({ ...content, summary: "Changed" }, "approval-one").extendedProperties.private.openbotDelivery, body.extendedProperties.private.openbotDelivery);
  assert.throws(() => calendarDeliveryBody(content, ""));
});

test("calendar proof requires the full unchanged event, not an ID or matching title alone", () => {
  const event: CalendarDeliveryEvent = { ...body, status: "confirmed", start: { dateTime: "2026-09-08T07:00:00Z" } };
  assert.equal(calendarDeliveryMatches(body, event), true);
  assert.equal(calendarDeliveryMatches(body, null), false);
  assert.equal(calendarDeliveryMatches(body, { ...event, attendees: [null] } as unknown as CalendarDeliveryEvent), false);
  assert.equal(calendarDeliveryMatches(body, { ...event, attendees: {} } as unknown as CalendarDeliveryEvent), false);
  const invalid: Partial<CalendarDeliveryEvent>[] = [
    { id: "other" }, { status: "cancelled" }, { status: undefined }, { extendedProperties: undefined },
    { description: "Altered" }, { location: "Unexpected" }, { start: { date: "2026-09-08" } },
    { end: { dateTime: "2026-09-08T10:00:00Z" } }, { attendees: [] }, { attendees: [{ email: "stranger@example.com" }] },
    { attendeesOmitted: true }, { recurrence: ["RRULE:FREQ=DAILY"] }, { recurringEventId: "series" }, { eventType: "outOfOffice" },
  ];
  for (const changed of invalid) assert.equal(calendarDeliveryMatches(body, { ...event, ...changed }), false, JSON.stringify(changed));
});

async function fixture(work: (connector: GoogleWorkspaceConnector, requests: Array<{ method: string; url: string; body: any }>, db: OpenBotDatabase) => Promise<void>, respond: (method: string, body: any, db: OpenBotDatabase) => Response | Promise<Response>) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-calendar-delivery-")), db = new OpenBotDatabase(root);
  try {
    db.configureGoogleConnector({ clientId: "fixture-client" });
    db.completeGoogleConnector({ accessToken: "fixture-token", refreshToken: "fixture-refresh", expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    const requests: Array<{ method: string; url: string; body: any }> = [];
    let posted: any;
    const transport: typeof fetch = async (url, init) => {
      const method = init?.method || "GET";
      if (method === "POST") posted = JSON.parse(String(init?.body));
      requests.push({ method, url: String(url), body: posted });
      return respond(method, posted, db);
    };
    const dispatch = new ApprovedConnectorDispatch(transport);
    const connector = new GoogleWorkspaceConnector(db, "http://127.0.0.1/callback", dispatch.fetch);
    await dispatch.run(() => true, () => work(connector, requests, db));
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
}

test("lost create response is recovered by exact event readback with only one insert", async () => {
  await fixture(async (connector, requests) => {
    const result = await connector.createCalendarEvent(input, "approval-one");
    assert.equal(result.recovered, true);
    assert.deepEqual(requests.map(r => r.method), ["POST", "GET"]);
    assert.equal(new URL(requests[1]!.url).pathname.split("/").pop(), result.id);
    assert.match(requests[0]!.url, /sendUpdates=all/);
  }, (method, posted) => {
    if (method === "POST") throw new Error("Socket closed after Google accepted the event");
    return Response.json({ ...posted, status: "confirmed", htmlLink: "https://calendar.google.com/calendar/event?eid=fixture" });
  });
});

test("complete insert response verifies without an extra read or write", async () => {
  await fixture(async (connector, requests) => {
    const result = await connector.createCalendarEvent(input, "approval-one");
    assert.equal(result.recovered, false);
    assert.deepEqual(requests.map(r => r.method), ["POST"]);
  }, (_method, posted) => Response.json({ ...posted, status: "confirmed" }));
});

for (const scenario of ["not-found", "changed", "cancelled", "truncated", "null", "offline", "conflict"] as const) {
  test(`ambiguous calendar ${scenario} never authorizes another insert or a false completion`, async () => {
    await fixture(async (connector, requests) => {
      await assert.rejects(connector.createCalendarEvent(input, "approval-one"), ApprovedConnectorOutcomeUncertainError);
      assert.deepEqual(requests.map(r => r.method), ["POST", "GET"]);
    }, (method, posted) => {
      if (method === "POST") {
        if (scenario === "conflict") return Response.json({ error: { message: "Conflict" } }, { status: 409 });
        return new Response("{truncated", { status: 200 });
      }
      if (scenario === "not-found") return Response.json({ error: { message: "Not found" } }, { status: 404 });
      if (scenario === "offline") throw new Error("Still offline");
      if (scenario === "truncated") return Response.json({ id: posted.id, status: "confirmed" });
      if (scenario === "null") return Response.json(null);
      return Response.json({ ...posted, status: scenario === "cancelled" ? "cancelled" : "confirmed", summary: "A different event" });
    });
  });
}

test("account replacement stops readback before it can inspect the replacement account", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.createCalendarEvent(input, "approval-one"), ApprovalReviewChangedError);
    assert.deepEqual(requests.map(r => r.method), ["POST"]);
  }, (_method, _posted, db) => {
    db.disconnectGoogleConnector();
    throw new Error("Connection changed while write was in flight");
  });
});

test("pending Meet creation is explicit and retains the original conference request identity", async () => {
  await fixture(async (connector, requests) => {
    const result = await connector.createCalendarEvent({ ...input, addGoogleMeet: true }, "approval-one");
    assert.equal(result.meetingPending, true);
    assert.equal(requests[0]!.body.conferenceData.createRequest.requestId, result.id);
  }, (_method, posted) => Response.json({ ...posted, status: "confirmed" }));
});
