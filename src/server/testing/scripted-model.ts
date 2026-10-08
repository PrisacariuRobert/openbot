import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { HeroFixture, HeroJobId } from "../hero-jobs.js";

/** A scripted, OpenAI-compatible model for the hero jobs in CI (task J2). It calls
 * the real tools in a fixed order, looks again before acting, and writes its answer
 * only from what the tools returned. So when the plumbing breaks (the fixture Mac,
 * the tools, what arrives mid-task, the recording of drafts), the checks fail. It
 * tests Sidemates, not a model: live runs use real models. */

type Call = { name: string; args: Record<string, unknown>; result: unknown };
type Step = { tool: string; args: Record<string, unknown> } | { answer: string };

const parse = (text: unknown): unknown => { try { return JSON.parse(String(text)); } catch { return { error: String(text) }; } };
const name = (from: string) => from.replace(/\s*<[^>]+>\s*$/, "").trim();
const address = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from;
const hhmm = (iso: string) => iso.slice(11, 16);
const localDay = (iso: string) => iso.slice(0, 10);
const automatic = (from: string) => /noreply|no-reply|news@|notifications@|digest/i.test(from);

function history(messages: Array<Record<string, unknown>>): Call[] {
  const calls: Call[] = [];
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) {
        calls.push({ name: call.function.name, args: parse(call.function.arguments) as Record<string, unknown>, result: undefined });
        const result = messages.find((entry) => entry.role === "tool" && entry.tool_call_id === call.id);
        calls.at(-1)!.result = result ? parse(Array.isArray(result.content) ? (result.content as Array<{ text?: string }>).map((part) => part.text ?? "").join("") : result.content) : undefined;
      }
    }
  }
  return calls;
}

const lastResult = (calls: Call[], tool: string) => [...calls].reverse().find((call) => call.name === tool)?.result as Record<string, unknown> | undefined;

function morningBrief(fixture: HeroFixture, calls: Call[]): Step {
  if (!calls.some((call) => call.name === "mac_calendar_events")) return { tool: "mac_calendar_events", args: { days: 2 } };
  if (!calls.some((call) => call.name === "mac_mail_unread")) return { tool: "mac_mail_unread", args: { days: 2, limit: 20 } };
  if (!calls.some((call) => call.name === "mac_reminders")) return { tool: "mac_reminders", args: {} };
  const today = localDay(fixture.now), tomorrow = localDay(new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString());
  const events = (lastResult(calls, "mac_calendar_events")?.events ?? []) as Array<{ title: string; start: string; allDay: boolean; location: string }>;
  const schedule = events.filter((event) => !event.allDay && localDay(event.start) === today).map((event) => `- ${hhmm(event.start)} ${event.title}${event.location ? `, ${event.location}` : ""}`);
  const allDay = events.filter((event) => event.allDay && localDay(event.start) === today).map((event) => `- All day: ${event.title}`);
  const early = events.filter((event) => !event.allDay && localDay(event.start) === tomorrow && Number(hhmm(event.start).slice(0, 2)) < 10).map((event) => `${hhmm(event.start)} ${event.title}`);
  const mail = ((lastResult(calls, "mac_mail_unread")?.messages ?? []) as Array<{ from: string; subject: string }>).filter((message) => !automatic(message.from)).slice(0, 5).map((message) => `- ${name(message.from)}: ${message.subject}`);
  const endOfToday = Date.parse(`${today}T23:59:59${fixture.now.slice(19)}`);
  const reminders = ((lastResult(calls, "mac_reminders")?.reminders ?? []) as Array<{ title: string; due: string | null; completed: boolean }>)
    .filter((item) => !item.completed && item.due && Date.parse(item.due) <= endOfToday)
    .map((item) => `- ${Date.parse(item.due!) < Date.parse(fixture.now) ? "Overdue" : "Today"}: ${item.title}`);
  return { answer: [
    "**Today** (Calendar)", ...schedule, ...allDay, ...(early.length ? [`Early tomorrow: ${early.join(", ")}.`] : []), "",
    "**Mail that needs you** (Mail)", ...(mail.length ? mail : ["- Nothing that needs you."]), "",
    "**Reminders** (Reminders)", ...(reminders.length ? reminders : ["- Nothing due."]),
  ].join("\n") };
}

function waitingOnMe(_fixture: HeroFixture, calls: Call[]): Step {
  // Every fixture address is on an .example domain, so this search lists the week's mail.
  if (!calls.some((call) => call.name === "mac_mail_search")) return { tool: "mac_mail_search", args: { query: "example", days: 7, limit: 10 } };
  if (!calls.some((call) => call.name === "search_my_mac")) return { tool: "search_my_mac", args: { query: "messages", sources: ["messages"], days: 7 } };
  const listed = ((calls.find((call) => call.name === "mac_mail_search")?.result as { messages?: Array<{ id: string; from: string; subject: string }> })?.messages ?? [])
    .filter((message) => !automatic(message.from) && !/^thanks\b/i.test(message.subject));
  for (const message of listed) {
    const read = calls.find((call) => call.name === "mac_mail_read" && call.args.id === message.id);
    // Look again just before acting: read the thread now, not from the list.
    if (!read) return { tool: "mac_mail_read", args: { id: message.id } };
    const text = String((read.result as { text?: string })?.text ?? "");
    const settled = /never mind|no need to reply|works after all/i.test(text);
    const answeredByOwner = /\nme \(/.test(text) && text.trim().split("\n").at(-1)!.startsWith("me (");
    if (!settled && !answeredByOwner && !calls.some((call) => call.name === "mac_mail_draft" && (call.args.to as string[])?.includes(address(message.from)))) {
      return { tool: "mac_mail_draft", args: { to: [address(message.from)], subject: `Re: ${message.subject}`, body: "Thanks! I'll get back to you on this today." } };
    }
  }
  const drafted = calls.filter((call) => call.name === "mac_mail_draft").map((call) => (call.args.to as string[])[0]!);
  const waitingMail = listed.filter((message) => drafted.includes(address(message.from))).map((message) => `- ${name(message.from)} (Mail): ${message.subject}. I saved a draft reply in Mail for you to check.`);
  const settled = listed.filter((message) => /never mind|no need to reply|works after all/i.test(String((calls.find((call) => call.name === "mac_mail_read" && call.args.id === message.id)?.result as { text?: string })?.text ?? ""))).map((message) => name(message.from));
  const conversations = ((lastResult(calls, "search_my_mac")?.results ?? []) as Array<{ title: string; from: string; snippet: string }>)
    .filter((item) => item.from !== "me" && !/^[\s\p{Extended_Pictographic}]+$/u.test(item.snippet.split(" · ").at(-1)!.split(": ").slice(1).join(": ")))
    .map((item) => `- ${item.from} (Messages): "${item.snippet.split(" · ").at(-1)!.split(": ").slice(1).join(": ")}" Suggested reply: "Yes, see you then!"`);
  return { answer: [
    "Waiting on you:", ...waitingMail, ...conversations,
    ...(settled.length ? [`${settled.join(" and ")} wrote again: no answer needed any more, so nothing was drafted for that.`] : []),
    "Nothing has been sent.",
  ].join("\n") };
}

function meetingPrep(fixture: HeroFixture, calls: Call[]): Step {
  const calendarReads = calls.filter((call) => call.name === "mac_calendar_events");
  if (!calendarReads.length) return { tool: "mac_calendar_events", args: { days: 2 } };
  const upcoming = (result: unknown) => ((result as { events?: Array<{ title: string; start: string; end: string; location: string; allDay: boolean }> })?.events ?? [])
    .filter((event) => !event.allDay && Date.parse(event.start) > Date.parse(fixture.now)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const meeting = upcoming(calendarReads[0]!.result);
  if (!meeting) return { answer: "You have no meetings coming up in the next two days (Calendar)." };
  const topic = meeting.title.split(/\s+/).at(-1)!;
  if (!calls.some((call) => call.name === "mac_mail_search")) return { tool: "mac_mail_search", args: { query: topic, days: 30, limit: 10 } };
  const found = ((calls.find((call) => call.name === "mac_mail_search")?.result as { messages?: Array<{ id: string; from: string }> })?.messages ?? []);
  for (const message of found) if (!calls.some((call) => call.name === "mac_mail_read" && call.args.id === message.id)) return { tool: "mac_mail_read", args: { id: message.id } };
  if (!calls.some((call) => call.name === "mac_notes_search")) return { tool: "mac_notes_search", args: { query: topic } };
  const notes = ((calls.find((call) => call.name === "mac_notes_search")?.result as { notes?: Array<{ id: string; title: string }> })?.notes ?? []);
  for (const note of notes) if (!calls.some((call) => call.name === "mac_note_read" && call.args.id === note.id)) return { tool: "mac_note_read", args: { id: note.id } };
  // Check the time again just before writing the page.
  if (calendarReads.length < 2) return { tool: "mac_calendar_events", args: { days: 2 } };
  const current = upcoming(calendarReads.at(-1)!.result) ?? meeting;
  const moved = current.start !== meeting.start ? ` It moved from ${hhmm(meeting.start)}, according to your calendar.` : " (Calendar)";
  const mails = calls.filter((call) => call.name === "mac_mail_read").map((call) => call.result as { from: string; text: string });
  const noteTexts = calls.filter((call) => call.name === "mac_note_read").map((call) => call.result as { title: string; text: string });
  return { answer: [
    `**${current.title}**, today ${hhmm(current.start)} to ${hhmm(current.end)} (${current.location}).${moved}`,
    `Coming: ${[...new Set(mails.map((mail) => name(mail.from)))].join(" and ")}.`, "",
    "What they wrote (mail):", ...mails.map((mail) => `- ${name(mail.from).split(" ")[0]}: ${mail.text}`), "",
    ...noteTexts.map((note) => `Your note "${note.title}": ${note.text}`), "",
    "Suggestion: start with the open questions they raised.",
  ].join("\n") };
}

const POLICIES: Record<HeroJobId, (fixture: HeroFixture, calls: Call[]) => Step> = { "morning-brief": morningBrief, "waiting-on-me": waitingOnMe, "meeting-prep": meetingPrep };

export async function startScriptedModel(fixture: HeroFixture): Promise<{ url: string; requests: number; close: () => Promise<void> }> {
  let id = 0;
  const state = { requests: 0 };
  const server: Server = createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) { response.writeHead(404).end(); return; }
    let input = "";
    for await (const chunk of request) input += String(chunk);
    const body = JSON.parse(input) as { model: string; messages: Array<Record<string, unknown>>; tools?: Array<{ function: { name: string } }>; stream?: boolean };
    state.requests += 1;
    // Requests without tools (a title for the conversation) get plain text.
    const step: Step = body.tools?.length ? POLICIES[fixture.job](fixture, history(body.messages)) : { answer: "Hero job" };
    if ("tool" in step && !body.tools!.some((tool) => tool.function.name === step.tool)) Object.assign(step, { answer: `I can't do this here: the ${step.tool} tool isn't available to me.` });
    const usage = { prompt_tokens: Math.round(input.length / 4.37), completion_tokens: 40, total_tokens: Math.round(input.length / 4.37) + 40 };
    const callId = `call_${++id}`;
    const message = "answer" in step
      ? { role: "assistant", content: step.answer }
      : { role: "assistant", content: null, tool_calls: [{ id: callId, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.args) } }] };
    const finish = "answer" in step ? "stop" : "tool_calls";
    const completion = { id: `fixture-${id}`, object: "chat.completion", created: 1, model: body.model };
    if (!body.stream) { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ...completion, choices: [{ index: 0, message, finish_reason: finish }], usage })); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    const delta = "answer" in step ? { role: "assistant", content: step.answer } : { role: "assistant", tool_calls: [{ index: 0, ...message.tool_calls![0] }] };
    response.write(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: finish }], usage })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    get requests() { return state.requests; },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
