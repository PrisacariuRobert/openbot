import { createHash } from "node:crypto";

type TimedEvent = { dateTime?: string; date?: string };
export interface CalendarDeliveryBody {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: TimedEvent;
  end: TimedEvent;
  attendees?: Array<{ email: string }>;
  conferenceData?: { createRequest: { requestId: string; conferenceSolutionKey: { type: string } } };
  extendedProperties: { private: { openbotDelivery: string } };
}
export interface CalendarDeliveryEvent {
  id?: string; status?: string; summary?: string; description?: string; location?: string;
  start?: TimedEvent; end?: TimedEvent; attendees?: Array<{ email?: string }>;
  attendeesOmitted?: boolean; recurrence?: string[]; recurringEventId?: string; eventType?: string;
  htmlLink?: string; hangoutLink?: string;
  conferenceData?: { createRequest?: { requestId?: string; status?: { statusCode?: string } } };
  extendedProperties?: { private?: Record<string, string> };
}

/** Host-owned approval identity, never an ID supplied by the model. Google
 * accepts base32hex IDs; the hex digest is a valid subset. Different approvals
 * remain different actions even when their visible content is identical. */
export function calendarDeliveryBody(body: Omit<CalendarDeliveryBody, "id" | "extendedProperties">, approvalID: string): CalendarDeliveryBody {
  if (!approvalID || approvalID.length > 200) throw new Error("A calendar delivery needs its saved approval identity.");
  const id = `ob${createHash("sha256").update(`openbot-calendar-v1:${approvalID}`).digest("hex")}`;
  const content = { ...body, id, ...(body.conferenceData ? { conferenceData: { createRequest: { ...body.conferenceData.createRequest, requestId: id } } } : {}) };
  const fingerprint = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return { ...content, extendedProperties: { private: { openbotDelivery: fingerprint } } };
}

/** Only a full matching readback is proof. A matching title, an HTTP 200, or
 * absence from a list is insufficient. Missing/changed/cancelled events leave
 * the action uncertain; this helper never authorizes a second write. */
export function calendarDeliveryMatches(body: CalendarDeliveryBody, event: CalendarDeliveryEvent | null | undefined): boolean {
  if (!event || typeof event !== "object") return false;
  if (event.attendees !== undefined && (!Array.isArray(event.attendees)
    || event.attendees.some(entry => !entry || typeof entry.email !== "string"))) return false;
  const sameTime = (expected: TimedEvent, actual?: TimedEvent) => !!actual?.dateTime && !actual.date
    && Number.isFinite(Date.parse(actual.dateTime)) && Date.parse(expected.dateTime || "") === Date.parse(actual.dateTime);
  const emails = (entries: Array<{ email?: string }> = []) => entries.map(entry => entry.email?.trim().toLowerCase() ?? "").sort();
  return event.id === body.id && event.status === "confirmed"
    && event.extendedProperties?.private?.openbotDelivery === body.extendedProperties.private.openbotDelivery
    && event.summary === body.summary && (event.description || "") === (body.description || "")
    && (event.location || "") === (body.location || "")
    && sameTime(body.start, event.start) && sameTime(body.end, event.end)
    && event.attendeesOmitted !== true && !event.recurringEventId && !event.recurrence?.length
    && (!event.eventType || event.eventType === "default")
    && JSON.stringify(emails(body.attendees)) === JSON.stringify(emails(event.attendees))
    && (!body.conferenceData || event.conferenceData?.createRequest?.requestId === body.conferenceData.createRequest.requestId);
}
