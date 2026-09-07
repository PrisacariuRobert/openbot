import assert from "node:assert/strict";
import test from "node:test";
import { AwayAccess, securePublicOrigin } from "./away-access.js";

test("readiness needs the right studio AND denied unauthenticated access", async () => {
  for (const [identity, guard, ready] of [["ours", 401, true], ["other", 401, false], ["ours", 200, false]] as const) {
    const network = (async (input: string | URL | Request) => String(input).endsWith("probe") ? Response.json({ studio: identity }) : new Response("", { status: guard })) as typeof fetch;
    const access = new AwayAccess(() => "https://studio.example.com", "ours", false, network);
    assert.equal((await access.status()).ready, ready);
  }
  const missing = await new AwayAccess(() => "http://100.64.0.1:4311", "ours").status();
  assert.equal(missing.ready, false);
  for (const address of ["https://127.0.0.1", "https://studio.local", "https://studio.example/path", "https://studio.example?token=x"]) assert.equal(securePublicOrigin(address), null);
});

test("readiness probes the exact studio path on a hosting-provider address", async () => {
  const base = `https://pilot.onrender.com/s/${"a".repeat(24)}`;
  const paths: string[] = [];
  const network = (async (input: string | URL | Request) => {
    paths.push(String(input));
    return String(input).endsWith("probe") ? Response.json({ studio: "ours" }) : new Response(null, { status: 401 });
  }) as typeof fetch;
  const status = await new AwayAccess(() => base + "/", "ours", true, network).status();
  assert.equal(status.ready, true);
  assert.equal(status.url, base);
  assert.deepEqual(paths.sort(), [base + "/api/auth/pairing-guard", base + "/api/auth/pairing-probe"]);
});
