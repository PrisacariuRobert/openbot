// A transient version-probe failure must not wedge the host: only definitive
// verdicts stick, so the next task re-probes instead of failing forever.
import test from "node:test";
import assert from "node:assert/strict";
import { opencodeCompatibility, VERIFIED_OPENCODE_VERSION } from "./runtime-compatibility.js";

test("unknown probe results are not cached; later reads recover", () => {
  assert.deepEqual(opencodeCompatibility({ refresh: true, probe: () => { throw new Error("transient"); } }),
    { runtime: "opencode", detectedVersion: null, compatibility: "unknown" });
  assert.deepEqual(opencodeCompatibility({ probe: () => VERIFIED_OPENCODE_VERSION }),
    { runtime: "opencode", detectedVersion: VERIFIED_OPENCODE_VERSION, compatibility: "verified" });
});

test("verified and unsupported verdicts stick", () => {
  assert.equal(opencodeCompatibility({ refresh: true, probe: () => VERIFIED_OPENCODE_VERSION }).compatibility, "verified");
  assert.equal(opencodeCompatibility({ probe: () => { throw new Error("must not run while cached"); } }).compatibility, "verified");
  assert.equal(opencodeCompatibility({ refresh: true, probe: () => "0.0.0" }).compatibility, "unsupported");
});
