// Unit tests for the host login-wall detector with a stub page: no browser needed.
// Covers the false-alarm fix — a loading or signed-in page must not read as gated.
import test from "node:test";
import assert from "node:assert/strict";
import { detectLoginWall } from "./runtime.js";

type Node = { getClientRects(): unknown[]; textContent: string | null; querySelectorAll?(s: string): Node[] };
const shown = (text = ""): Node => ({ getClientRects: () => [{}], textContent: text });
const hidden = (text = ""): Node => ({ getClientRects: () => [], textContent: text });
const rows = (n: number): Node[] => Array.from({ length: n }, () => shown());
function stubPage(bySelector: Record<string, Node[]>) {
  return {
    locator: (_selector: string) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      evaluate: async <T>(fn: (body: any) => T): Promise<T> =>
        fn({ querySelectorAll: (selector: string) => bySelector[selector] || [] }),
    }),
  };
}
/** A Gmail-like inbox: the phishing subject matches login text but lives in a
 * 6-row table, so it must never count as a gate. Object identity matters: the
 * same heading node appears under both the table and the body, like real DOM. */
function inboxStub(subject: Node): Record<string, Node[]> {
  const table: Node = {
    getClientRects: () => [{}], textContent: null,
    querySelectorAll: (selector: string) =>
      /tr|\[role="row"\]|li|\[role="article"\]|article/.test(selector) ? rows(6) : [subject],
  };
  return {
    ['table,[role="table"],[role="grid"],[role="list"],ul,ol,[role="feed"],[role="rowgroup"]']: [table],
    ['h1,h2,[role="heading"]']: [subject],
    ['input[type="password"], input[autocomplete="one-time-code"]']: [],
    ['input,button,[role="button"]']: [shown("Search mail"), shown("Compose")],
  };
}
function withStyle<T>(visible: boolean, run: () => Promise<T>): Promise<T> {
  const previous = (globalThis as Record<string, unknown>).getComputedStyle;
  (globalThis as Record<string, unknown>).getComputedStyle = () => ({ visibility: visible ? "visible" : "hidden" });
  return run().finally(() => { (globalThis as Record<string, unknown>).getComputedStyle = previous; });
}
const PASSWORD = 'input[type="password"], input[autocomplete="one-time-code"]';
const HEADING = 'h1,h2,[role="heading"]';
const CONTROLS = 'input,button,[role="button"]';

test("signed-in inbox with no gate reads as clear", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({
    [PASSWORD]: [], [HEADING]: [shown("Inbox (6,796)")], [CONTROLS]: [shown("Compose")],
  })));
  assert.equal(evidence, null);
});

test("blank loading page reads as clear, never as signed-out", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({ [PASSWORD]: [], [HEADING]: [], [CONTROLS]: [] })));
  assert.equal(evidence, null);
});

test("visible password field is evidence", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({ [PASSWORD]: [shown()], [HEADING]: [], [CONTROLS]: [] })));
  assert.equal(evidence, "visible credential field");
});

test("hidden password field is not evidence", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({ [PASSWORD]: [hidden()], [HEADING]: [], [CONTROLS]: [] })));
  assert.equal(evidence, null);
});

test("login heading plus a button is evidence with the quoted heading", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({
    [PASSWORD]: [], [HEADING]: [shown("Sign in to continue")], [CONTROLS]: [shown("Next")],
  })));
  assert.match(evidence || "", /login heading "Sign in to continue/);
});

test("login heading without any control is not evidence", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({ [PASSWORD]: [], [HEADING]: [shown("Sign in")], [CONTROLS]: [] })));
  assert.equal(evidence, null);
});

test("phishing subject inside a 6-row inbox is content, not a gate", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage(inboxStub(shown("Action required: Pay your past due invoice — Sign in to review")))));
  assert.equal(evidence, null, "An inbox must never cry wolf on message text");
});

test("real login heading outside any list still counts", async () => {
  const subject = shown("Sign in to continue");
  const buried = await withStyle(true, () => detectLoginWall(stubPage(inboxStub(subject))));
  assert.equal(buried, null, "Same node buried in the list stays suppressed");
  const clear = await withStyle(true, () => detectLoginWall(stubPage({ [PASSWORD]: [], [HEADING]: [subject], [CONTROLS]: [shown("Next")] })));
  assert.match(clear || "", /login heading/);
});
