import test from "node:test";
import assert from "node:assert/strict";
import { imageCapableInCatalog, modelCanReceiveBrowserImage } from "./browser-image-capability.js";

const capable = { id: "picture", providerID: "fixture", capabilities: { attachment: true, input: { image: true } } };
const textOnly = { id: "plain", providerID: "fixture", capabilities: { attachment: false, input: { image: false } } };
const catalog = `fixture/picture\n${JSON.stringify(capable, null, 2)}\nfixture/plain\n${JSON.stringify(textOnly, null, 2)}\n`;

test("image delivery uses exact runtime metadata and fails closed", async () => {
  assert.equal(imageCapableInCatalog(catalog, "fixture/picture"), true);
  assert.equal(imageCapableInCatalog(catalog, "fixture/plain"), false);
  assert.equal(imageCapableInCatalog(catalog, "fixture/missing"), false);
  assert.equal(imageCapableInCatalog(catalog.replace('"providerID": "fixture"', '"providerID": "other"'), "fixture/picture"), false);
  assert.equal(imageCapableInCatalog("fixture/picture\n{broken", "fixture/picture"), false);
  assert.equal(await modelCanReceiveBrowserImage("fixture/picture", "claude_code"), false);
});
