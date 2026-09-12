import test from "node:test";
import assert from "node:assert/strict";
import { createTeammatePayload } from "./create-teammate-payload.js";

const base = { name: "Scout", role: "Plan my week", instructions: "", color: "#6757d9", mascot: "nova", providerInstanceId: "provider-1", model: "model-1" };
test("create payload falls back to the job and keeps access off", () => {
  const payload = createTeammatePayload(base);
  assert.equal(payload.instructions, "Plan my week");
  assert.equal(payload.browserEnabled, false);
  assert.equal(payload.computerEnabled, false);
  assert.equal(payload.model, "model-1");
});
test("create payload preserves explicit instructions and never chooses a model", () => {
  const payload = createTeammatePayload({ ...base, instructions: "Ask before changing anything.", model: "" });
  assert.equal(payload.instructions, "Ask before changing anything.");
  assert.equal(payload.model, "");
});
