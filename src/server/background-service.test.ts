import test from "node:test";
import assert from "node:assert/strict";
import { backgroundServicePlist, BACKGROUND_SERVICE_LABEL } from "./background-service.js";

test("builds a bounded macOS background service without shell interpolation", () => {
  const plist = backgroundServicePlist({
    rootDir: "/Users/Test Person/OpenBot & Friends",
    dataDir: "/Users/Test Person/OpenBot & Friends/.openbot",
    nodePath: "/opt/local/bin/node",
    port: 4311,
  });
  assert.match(plist, new RegExp(`<string>${BACKGROUND_SERVICE_LABEL}</string>`));
  assert.match(plist, /background-runner\.mjs/);
  assert.match(plist, /OPENBOT_BACKGROUND_SERVICE/);
  assert.match(plist, /OPENBOT_PORT/);
  assert.match(plist, /<string>4311<\/string>/);
  assert.match(plist, /OpenBot &amp; Friends/);
  assert.doesNotMatch(plist, /<string>\/bin\/(?:zsh|bash|sh)<\/string>/);
});
