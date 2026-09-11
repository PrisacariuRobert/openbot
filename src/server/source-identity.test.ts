import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFrontendIdentity, resolveSourceIdentity } from "./source-identity.js";

/** Gate 1a provenance: the serving process must report which source and
 * build it actually is, derived from launch metadata or its own checkout —
 * never a hard-coded SHA. */

test("injected launch provenance wins and is validated", () => {
  assert.deepEqual(
    resolveSourceIdentity("/nonexistent", { OPENBOT_SOURCE_COMMIT: "C54A2AF5d4fecad3a30d00a51e01c6cc3cbea4b0", OPENBOT_SOURCE_DIRTY: "false" } as NodeJS.ProcessEnv),
    { commit: "c54a2af5d4fecad3a30d00a51e01c6cc3cbea4b0", dirty: false, method: "env" },
  );
  assert.deepEqual(
    resolveSourceIdentity("/nonexistent", { OPENBOT_SOURCE_COMMIT: "c54a2af", OPENBOT_SOURCE_DIRTY: "yes" } as NodeJS.ProcessEnv),
    { commit: "c54a2af", dirty: null, method: "env" },
  );
  assert.deepEqual(
    resolveSourceIdentity("/nonexistent", { OPENBOT_SOURCE_COMMIT: "not-a-sha" } as NodeJS.ProcessEnv).method,
    "unknown",
  );
});

test("a directory that is not a checkout reports unknown, never a guess", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-identity-"));
  try {
    assert.deepEqual(resolveSourceIdentity(root, {} as NodeJS.ProcessEnv), { commit: null, dirty: null, method: "unknown" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("frontend identity parses the main asset and hashes its bytes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-frontend-identity-"));
  try {
    const assets = path.join(root, "assets");
    mkdirSync(assets, { recursive: true });
    const js = "console.log('candidate');\n";
    writeFileSync(path.join(assets, "main-TEST1234.js"), js);
    writeFileSync(path.join(root, "index.html"), '<script src="/assets/main-TEST1234.js"></script>');
    assert.deepEqual(readFrontendIdentity(root, { OPENBOT_FRONTEND_BUILD_COMMIT: "c54a2af" } as NodeJS.ProcessEnv), {
      commit: "c54a2af",
      asset: "assets/main-TEST1234.js",
      assetSha256: createHash("sha256").update(js).digest("hex"),
    });
    assert.deepEqual(readFrontendIdentity(path.join(root, "missing"), {} as NodeJS.ProcessEnv), { commit: null, asset: null, assetSha256: null });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
