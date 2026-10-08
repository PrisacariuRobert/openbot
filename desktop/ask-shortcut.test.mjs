import assert from "node:assert/strict";
import test from "node:test";
import { ASK_SHORTCUTS, askWindowToggle, registerAskShortcut } from "./ask-shortcut.mjs";

test("the ask shortcut takes Option+Space, or the fallback when another app owns it", () => {
  const taken = new Set(["Alt+Space"]), registered = [];
  const globalShortcut = { register: (accelerator, open) => { if (taken.has(accelerator)) return false; registered.push([accelerator, open]); return true; } };
  const open = () => {};
  assert.equal(registerAskShortcut(globalShortcut, open), "Control+Alt+Space");
  assert.deepEqual(registered, [["Control+Alt+Space", open]]);
  assert.equal(registerAskShortcut({ register: () => { throw new Error("busy"); } }, open), null);
  assert.deepEqual(ASK_SHORTCUTS, ["Alt+Space", "Control+Alt+Space"]);
});

test("the shortcut opens one sandboxed ask window at /ask, and a second press hides it", () => {
  const made = [];
  const createWindow = (options) => {
    const handlers = {}, window = {
      options, url: null, visible: false, focused: false, destroyed: false,
      on: (event, handler) => { handlers[event] = handler; }, once: (event, handler) => { handlers[event] = handler; },
      loadURL: (url) => { window.url = url; handlers["ready-to-show"]?.(); return Promise.resolve(); },
      show: () => { window.visible = true; }, hide: () => { window.visible = false; window.focused = false; }, focus: () => { window.focused = true; },
      isVisible: () => window.visible, isFocused: () => window.focused, isDestroyed: () => window.destroyed, handlers,
    };
    made.push(window); return window;
  };
  const toggle = askWindowToggle(createWindow, "http://127.0.0.1:4311");
  const window = toggle();
  assert.equal(window.url, "http://127.0.0.1:4311/ask");
  assert.deepEqual(window.options.webPreferences, { contextIsolation: true, nodeIntegration: false, sandbox: true });
  assert.equal(window.visible, true);
  toggle();
  assert.equal(window.visible, false, "a second press hides it");
  toggle();
  assert.equal(window.visible, true);
  window.handlers.blur();
  assert.equal(window.visible, false, "clicking elsewhere hides it");
  assert.equal(made.length, 1, "one window, reused");
});
