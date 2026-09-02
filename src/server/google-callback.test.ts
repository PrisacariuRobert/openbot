import test from "node:test";
import assert from "node:assert/strict";
import { friendlyGoogleError, googleApiRecovery, googleCallbackPage, googleCloudProjectFromClientId, googleReturnUrl } from "./google-callback.js";

const disabledGmail = "Gmail API has not been used in project 319075443789 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=319075443789 then retry.";

test("recognizes a disabled Google API and builds the exact enable link", () => {
  assert.deepEqual(googleApiRecovery(disabledGmail), {
    service: "gmail",
    serviceName: "Gmail",
    projectId: "319075443789",
    enableUrl: "https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=319075443789",
  });
  assert.equal(friendlyGoogleError(disabledGmail), "Gmail is turned off in Google Cloud. Turn it on, wait a minute, then connect again.");
});

test("extracts a Google Cloud project number from a desktop client ID", () => {
  assert.equal(googleCloudProjectFromClientId("319075443789-desktopclient.apps.googleusercontent.com"), "319075443789");
  assert.equal(googleCloudProjectFromClientId("not-a-google-client"), null);
});

test("returns to OpenBot with the connectors panel open", () => {
  assert.equal(googleReturnUrl("http://127.0.0.1:4310/", "connected"), "http://127.0.0.1:4310/?panel=connectors&google=connected");
});

test("renders a bounded, friendly callback page without leaking unsafe markup", () => {
  const page = googleCallbackPage(false, `${disabledGmail}<script>alert(1)</script>`);
  assert.match(page, /Turn on Gmail to finish/);
  assert.match(page, /Open Google Cloud/);
  assert.match(page, /Press <strong>Enable<\/strong>/);
  assert.doesNotMatch(page, /<script>alert/);
  assert.doesNotMatch(page, /alert\(1\)/);
});

test("keeps unfamiliar errors behind optional technical details", () => {
  const page = googleCallbackPage(false, "Unexpected upstream failure");
  assert.match(page, /Google needs another try/);
  assert.match(page, /Show technical details/);
  assert.match(page, /Unexpected upstream failure/);
});
