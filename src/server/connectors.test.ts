import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTOR_MANIFESTS, connectorManifest, friendlyConnectorError, manifestCatalogEntry, validateConnectorManifests } from "./connectors.js";

test("registers one valid, approval-safe manifest for every live connector", () => {
  assert.deepEqual(validateConnectorManifests(), []);
  assert.equal(new Set(CONNECTOR_MANIFESTS.map((item) => item.service)).size, CONNECTOR_MANIFESTS.length);
  assert.ok(CONNECTOR_MANIFESTS.every((item) => !item.writeCapability || item.writeRequiresApproval));
  assert.equal(connectorManifest("slack").connectorId, "slack");
  assert.equal(connectorManifest("notion").dataBoundary.includes("page picker"), true);
  assert.equal(connectorManifest("todoist").writeRequiresApproval, true);
  assert.equal(connectorManifest("dropbox").writeCapability, null);
  assert.equal(connectorManifest("slack").eventAuth, "provider_hmac");
  assert.match(connectorManifest("notion").eventCapability || "", /page/);
});

test("turns connector failures into short recovery guidance", () => {
  assert.equal(friendlyConnectorError("slack", "Slack could not complete that request (missing_scope)."), "Slack needs one more permission for that action. Update the app permissions, then reconnect Slack.");
  assert.equal(friendlyConnectorError("notion", "Slow down. Try again in 3 seconds."), "Notion is temporarily busy. Try again in 3 seconds.");
  assert.doesNotMatch(friendlyConnectorError("slack", "invalid_auth"), /invalid_auth/);
  assert.match(friendlyConnectorError("dropbox", "path/not_found"), /supported text file/);
});

test("builds the public app catalog from the connector contract", () => {
  const slack = manifestCatalogEntry("slack", true, "Connected");
  assert.equal(slack.availability, "live");
  assert.equal(slack.connected, true);
  assert.equal(slack.writeRequiresApproval, true);
  assert.deepEqual(slack.capabilities, ["Search messages and read conversation context", "Post a message or thread reply"]);
});
