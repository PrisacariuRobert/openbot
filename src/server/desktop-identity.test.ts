import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("packaged host health acknowledges only the desktop identity passed by its launcher", async () => {
  const identity = randomUUID();
  const fixture = await skillAuthoringFixture({ environment: { OPENBOT_DESKTOP_INSTANCE_ID: identity } });
  try {
    const health = async (candidate?: string) => fetch(`${fixture.base}/api/healthz`, { headers: candidate ? { "x-openbot-desktop-identity": candidate } : {} });
    assert.equal((await health()).headers.get("x-openbot-desktop-match"), null);
    assert.equal((await health(randomUUID())).headers.get("x-openbot-desktop-match"), null);
    const matching = await health(identity);
    assert.equal(matching.status, 200);
    assert.equal(matching.headers.get("x-openbot-desktop-match"), "1");
    assert.equal((await matching.json() as { ok: boolean }).ok, true);
  } finally { await fixture.close(); }
});
