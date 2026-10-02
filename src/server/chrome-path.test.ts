import assert from "node:assert/strict";
import test from "node:test";
import { chromeCandidates, chromePath } from "./runtime.js";

test("on Windows the browser is found in Program Files, the user's folder, or as Microsoft Edge", () => {
  const env = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local" };
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  assert.equal(chromePath("win32", env, (file) => file === edge), edge, "Edge is always there as a fallback");
  const chrome = "C:\\Users\\Ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.equal(chromePath("win32", env, (file) => file === chrome || file === edge), chrome, "Chrome is preferred over Edge");
  assert.equal(chromePath("win32", env, () => false), undefined, "nothing found stays undefined");
  assert.ok(chromeCandidates("win32", env).every((file) => /^[A-Z]:\\/.test(file)), "only Windows-style paths");
});

test("OPENBOT_CHROME_PATH always wins, on every platform", () => {
  for (const platform of ["win32", "darwin", "linux"] as const) {
    const custom = platform === "win32" ? "D:\\Browsers\\chrome.exe" : "/opt/browsers/chrome";
    assert.equal(chromePath(platform, { OPENBOT_CHROME_PATH: custom }, () => true), custom);
  }
});

test("Mac and Linux keep finding the browsers they found before", () => {
  assert.equal(chromePath("darwin", {}, (file) => file === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.equal(chromePath("linux", {}, (file) => file === "/usr/bin/chromium"), "/usr/bin/chromium");
  assert.equal(chromePath("linux", {}, (file) => file === "/usr/bin/chromium-browser"), "/usr/bin/chromium-browser");
  assert.equal(chromePath("linux", {}, () => false), undefined);
});
