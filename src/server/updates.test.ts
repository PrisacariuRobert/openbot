import test from "node:test";
import assert from "node:assert/strict";
import { newerVersion, UpdateChecker } from "./updates.js";

test("versions compare the way releases are numbered", () => {
  assert.equal(newerVersion("0.38.0-beta.1", "0.37.0-beta.1"), true);
  assert.equal(newerVersion("0.37.0-beta.2", "0.37.0-beta.1"), true);
  assert.equal(newerVersion("0.37.0", "0.37.0-beta.9"), true, "a release beats its betas");
  assert.equal(newerVersion("v0.37.0-beta.1", "0.37.0-beta.1"), false);
  assert.equal(newerVersion("0.36.9", "0.37.0-beta.1"), false);
  assert.equal(newerVersion("0.37.0-beta.1", "0.37.0"), false);
});

test("an installed copy can update in one tap; a source checkout is only told", async () => {
  const release = (tag: string) => (async () => new Response(JSON.stringify({ tag_name: tag, html_url: `https://github.com/x/releases/${tag}` }), { status: 200 })) as unknown as typeof fetch;
  const installed = new UpdateChecker({ current: "0.37.0-beta.1", fetchImpl: release("v0.38.0-beta.1"), installed: () => true });
  const status = await installed.check();
  assert.equal(status.available, true);
  assert.equal(status.canInstall, true);
  let command = "";
  const spawned = installed.install(((_file: string, args: string[]) => { command = args[1]!; return { on() {}, unref() {} }; }) as never);
  assert.equal(spawned.installing, true);
  assert.match(command, /sidemates\.app\/install\.sh \| sh$/);

  const source = new UpdateChecker({ current: "0.37.0-beta.1", fetchImpl: release("v0.38.0-beta.1"), installed: () => false });
  assert.equal((await source.check()).canInstall, false);
  assert.throws(() => source.install(), /git pull/);

  const offline = new UpdateChecker({ current: "0.37.0-beta.1", fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  assert.equal((await offline.check()).available, false, "offline means no banner, not an error");
});
