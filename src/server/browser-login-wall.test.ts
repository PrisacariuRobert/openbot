// Unit tests for the host login-wall detector with a stub page: no browser needed.
// Covers the false-alarm fix — a loading or signed-in page must not read as gated.
import test from "node:test";
import assert from "node:assert/strict";
import { detectLoginWall } from "./runtime.js";

type Node = { getClientRects(): unknown[]; textContent: string | null };
const shown = (text = ""): Node => ({ getClientRects: () => [{}], textContent: text });
const hidden = (text = ""): Node => ({ getClientRects: () => [], textContent: text });
function stubPage(bySelector: Record<string, Node[]>) {
  return {
    locator: (_selector: string) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      evaluate: async <T>(fn: (body: any) => T): Promise<T> =>
        fn({ querySelectorAll: (selector: string) => bySelector[selector] || [] }),
    }),
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
  assert.match(evidence || "", /login heading "Sign in to continue"/);
});

test("login heading without any control is not evidence", async () => {
  const evidence = await withStyle(true, () => detectLoginWall(stubPage({ [PASSWORD]: [], [HEADING]: [shown("Sign in")], [CONTROLS]: [] })));
  assert.equal(evidence, null);
});
