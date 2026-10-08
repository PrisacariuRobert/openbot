import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { AppleApps } from "./mac-apple-apps.js";
import { probeFullDiskAccess, registerMacPermissionRoutes, type MacPermissionDeps } from "./mac-permissions.js";

test("asking for Calendar or Reminders reports granted, turned off, no answer yet, or not a Mac", async () => {
  const fail = (message: string, killed = false) => Object.assign(new Error(message), { killed });
  const runs: string[][] = [];
  const answers = [
    async () => "{\"ok\":true}",
    async () => { throw fail("execution error: Not authorized to send Apple events to Calendar. (-1743)"); },
    async () => { throw fail("Command failed", true); },
    async () => { throw fail("something else"); },
  ];
  let next = 0;
  const apps = new AppleApps(async (command, args) => { runs.push([command, ...args]); return answers[next++]!(); }, "darwin");
  assert.equal(await apps.requestAccess("Calendar"), "granted");
  assert.equal(await apps.requestAccess("Calendar"), "denied");
  assert.equal(await apps.requestAccess("Reminders"), "waiting");
  assert.equal(await apps.requestAccess("Reminders"), "error");
  assert.match(runs[0]!.join(" "), /osascript -l JavaScript -e Application\('Calendar'\)\.calendars\.length/, "a count, not the data");
  assert.match(runs[2]!.join(" "), /Application\('Reminders'\)\.lists\.length/);
  assert.equal(await new AppleApps(async () => { throw new Error("must not run"); }, "linux").requestAccess("Calendar"), "unavailable");
});

test("Full Disk Access is checked without reading anything", () => {
  const home = mkdtempSync(path.join(tmpdir(), "sidemates-fda-"));
  try {
    assert.equal(probeFullDiskAccess(home), "unknown", "no Mail or Messages data on this machine");
    mkdirSync(path.join(home, "Library/Mail"), { recursive: true });
    assert.equal(probeFullDiskAccess(home), "granted");
    mkdirSync(path.join(home, "Library/Messages"), { recursive: true });
    writeFileSync(path.join(home, "Library/Messages/chat.db"), "synthetic");
    assert.equal(probeFullDiskAccess(home), "granted");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

async function app(deps: Partial<MacPermissionDeps> & { local?: boolean }) {
  const opened: string[] = [], asked: string[] = [];
  const server = express().use(express.json());
  registerMacPermissionRoutes(server, {
    available: deps.available ?? true,
    requestAccess: deps.requestAccess ?? (async (target) => { asked.push(target); return "granted"; }),
    fullDiskAccess: deps.fullDiskAccess ?? (() => "missing"),
    openPane: (pane) => { opened.push(pane); },
    isLocal: () => deps.local ?? true,
  });
  const listener = server.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const base = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  const send = async (route: string, body?: unknown) => {
    const response = await fetch(base + route, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { send, opened, asked, close: () => listener.close() };
}

test("on the Mac itself, the routes ask, report and open the right System Settings page", async () => {
  const mac = await app({});
  try {
    assert.deepEqual((await mac.send("/api/mac/permissions")).body, { available: true, automation: { Calendar: null, Reminders: null }, fullDiskAccess: "missing" });
    assert.deepEqual((await mac.send("/api/mac/permissions/request", { app: "Calendar" })).body, { app: "Calendar", state: "granted" });
    assert.equal(((await mac.send("/api/mac/permissions")).body.automation as Record<string, string>).Calendar, "granted");
    assert.equal((await mac.send("/api/mac/permissions/request", { app: "Mail" })).status, 400, "Mail is never launched during setup");
    assert.equal((await mac.send("/api/mac/permissions/open", { pane: "full-disk-access" })).status, 200);
    assert.equal((await mac.send("/api/mac/permissions/open", { pane: "internet-accounts" })).status, 200, "where a Google account is added for Mail and Calendar");
    assert.equal((await mac.send("/api/mac/permissions/open", { pane: "accessibility" })).status, 200, "the fix when reading an app needs Accessibility (J6)");
    assert.equal((await mac.send("/api/mac/permissions/open", { pane: "camera" })).status, 400, "only the pages Sidemates needs");
    assert.deepEqual(mac.asked, ["Calendar"]);
    assert.deepEqual(mac.opened, ["full-disk-access", "internet-accounts", "accessibility"]);
  } finally { mac.close(); }
});

test("off a Mac, or from another device, nothing is asked or opened", async () => {
  for (const options of [{ available: false }, { local: false }]) {
    const other = await app(options);
    try {
      assert.deepEqual((await other.send("/api/mac/permissions")).body, { available: false });
      assert.equal((await other.send("/api/mac/permissions/request", { app: "Calendar" })).status, 409);
      assert.equal((await other.send("/api/mac/permissions/open", { pane: "automation" })).status, 409);
      assert.deepEqual(other.asked, []);
      assert.deepEqual(other.opened, []);
    } finally { other.close(); }
  }
});
