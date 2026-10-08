import assert from "node:assert/strict";
import test from "node:test";
import { forwardedBrowserEnvironment } from "./testing/skill-authoring-fixture.js";

test("the fixture host gets the developer's custom Chrome and Playwright browser paths", () => {
  assert.deepEqual(
    forwardedBrowserEnvironment({ OPENBOT_CHROME_PATH: "/opt/chromium/chrome", PLAYWRIGHT_BROWSERS_PATH: "/opt/ms-playwright", HOME: "/home/dev", OPENAI_API_KEY: "not-forwarded" }),
    { OPENBOT_CHROME_PATH: "/opt/chromium/chrome", PLAYWRIGHT_BROWSERS_PATH: "/opt/ms-playwright" },
  );
  assert.deepEqual(forwardedBrowserEnvironment({ OPENBOT_CHROME_PATH: "", HOME: "/home/dev" }), {});
});
