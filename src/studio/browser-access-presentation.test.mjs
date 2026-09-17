import test from "node:test";
import assert from "node:assert/strict";
import {
  browserAccessMatchesRequest,
  browserServiceLabel,
} from "./browser-access-presentation.mjs";

const service = {
  service: "github", label: "GitHub", connectorState: "missing",
  browserState: "unverified", preferred: "browser",
};
const access = {
  botId: "pixel", browserEnabled: true, runtimeAvailable: true,
  services: [service],
};

test("access is accepted only for the requested teammate", () => {
  assert.equal(browserAccessMatchesRequest(access, "pixel"), true);
  assert.equal(browserAccessMatchesRequest(access, "scout"), false);
});
test("missing and malformed service payloads are rejected", () => {
  for (const payload of [null, {}, {...access, services: null},
      {...access, services: [null]}, {...access, browserEnabled: "true"}]) {
    assert.equal(browserAccessMatchesRequest(payload, "pixel"), false);
  }
});
test("a denied read cannot be relabeled as a browser option", () => {
  assert.equal(browserServiceLabel({...service, connectorState: "read-denied"}, access),
    "Reading turned off");
});
test("a connector remains usable independently of browser permission", () => {
  assert.equal(browserServiceLabel({...service, preferred: "connector"},
    {...access, browserEnabled: false}), "Connection available");
});
test("disabled browser permission wins over a suggested browser route", () => {
  assert.equal(browserServiceLabel(service, {...access, browserEnabled: false}),
    "Browser off");
});
test("missing runtime is reported instead of promising a working browser", () => {
  assert.equal(browserServiceLabel(service, {...access, runtimeAvailable: false}),
    "Browser needs setup");
});
test("available browser route never claims a verified website sign-in", () => {
  assert.equal(browserServiceLabel(service, access), "Browser option");
});
test("unknown routes remain an explicit setup state", () => {
  assert.equal(browserServiceLabel({...service, preferred: "none"}, access),
    "Needs setup");
});
