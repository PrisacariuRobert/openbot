import test from "node:test";
import assert from "node:assert/strict";
import { installNavigationGuards, navigationTarget } from "./navigation.mjs";

const base = "http://127.0.0.1:4311";
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("desktop trust compares the full origin, not just hostname and port", () => {
  assert.equal(navigationTarget(`${base}/studio.html?thread=1`, base), "internal");
  for (const url of ["https://127.0.0.1:4311/", "http://127.0.0.1:4310/", "http://127.0.0.1.example/", "https://example.com/"]) {
    assert.equal(navigationTarget(url, base), "external");
  }
});

test("desktop refuses unsafe schemes, credentials and malformed URLs", () => {
  for (const url of ["javascript:alert(1)", "file:///tmp/app", "data:text/html,hello", "openbot://host", "ms-msdt:/id", "mailto:a@example.com", "blob:http://127.0.0.1:4311/id", "https://user:secret@example.com", "invalid"]) {
    assert.equal(navigationTarget(url, base), "blocked");
  }
});

function harness(open = async () => {}) {
  const events = new Map();
  const loads = [];
  const failures = [];
  let popup;
  const contents = {
    setWindowOpenHandler: (handler) => { popup = handler; },
    on: (name, handler) => events.set(name, handler),
    loadURL: async (url) => { loads.push(url); },
  };
  installNavigationGuards(contents, base, open, (error) => failures.push(error));
  return { events, loads, failures, popup: (url) => popup({ url }) };
}

test("popup, navigation and redirect guards never dispatch custom schemes", async () => {
  const opened = [];
  const h = harness(async (url) => { opened.push(url); });
  for (const url of ["file:///tmp/app", "ms-msdt:/id", "javascript:alert(1)"]) {
    assert.deepEqual(h.popup(url), { action: "deny" });
    for (const eventName of ["will-navigate", "will-redirect"]) {
      let prevented = false;
      h.events.get(eventName)({ preventDefault: () => { prevented = true; } }, url);
      assert.equal(prevented, true);
    }
  }
  await flush();
  assert.deepEqual(opened, []);
  assert.deepEqual(h.loads, []);
});

test("same-origin popups use their own window; external web links use the system browser", async () => {
  const opened = [];
  const h = harness(async (url) => { opened.push(url); });
  h.popup(`${base}/settings`);
  h.popup("https://example.com/help");
  h.events.get("will-navigate")({ preventDefault: () => assert.fail("internal navigation must work") }, `${base}/conversation`);
  await flush();
  assert.deepEqual(h.loads, [`${base}/settings`]);
  assert.deepEqual(opened, ["https://example.com/help"]);
});

test("OS-handler failures are caught instead of becoming unhandled rejections", async () => {
  for (const open of [() => { throw new Error("no handler"); }, async () => { throw new Error("rejected"); }]) {
    const h = harness(open);
    h.popup("https://example.com/help");
    await flush();
    assert.equal(h.failures.length, 1);
  }
});
