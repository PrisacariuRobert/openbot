// A transient version-probe failure must not wedge the host: only definitive
// verdicts stick, so the next task re-probes instead of failing forever.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpencodeVersion, opencodeCompatibility, runtimeMayExecute, VERIFIED_OPENCODE_VERSION } from "./runtime-compatibility.js";

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

test("a newer patch in the verified line runs; other versions still fail closed", () => {
  const [major, minor, patch] = VERIFIED_OPENCODE_VERSION.split(".").map(Number);
  assert.equal(classifyOpencodeVersion(`${major}.${minor}.${patch + 1}`), "compatible");
  assert.equal(classifyOpencodeVersion(`v${major}.${minor}.${patch + 7}`), "compatible");
  assert.equal(classifyOpencodeVersion(`${major}.${minor + 1}.0`), "unsupported");
  assert.equal(classifyOpencodeVersion(`${major + 1}.${minor}.${patch}`), "unsupported");
  if (patch > 0) assert.equal(classifyOpencodeVersion(`${major}.${minor}.${patch - 1}`), "unsupported");
  assert.equal(classifyOpencodeVersion(`${major}.${minor}.${patch + 1}-beta`), "unsupported");
  assert.equal(runtimeMayExecute("compatible"), true);
  assert.equal(runtimeMayExecute("unsupported"), false);
  assert.equal(runtimeMayExecute("unknown"), false);
});
