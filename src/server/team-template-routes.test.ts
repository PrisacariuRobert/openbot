import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { BLOCKED_FREE_TIER_MESSAGE } from "../shared/provider-config.js";
import type { Bot } from "../shared/types.js";
import { OpenBotDatabase } from "./database.js";
import { registerTeamTemplateRoutes } from "./team-template-routes.js";

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-team-templates-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
  let broadcasts = 0;
  const app = express();
  app.use(express.json());
  registerTeamTemplateRoutes(app, db, () => { broadcasts++; });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const install = async (id: string, body?: unknown) => {
    const response = await fetch(`${base}/api/team-templates/${id}/install`, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? "{}" : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as { error?: string; bots?: Bot[] } };
  };
  return { db, install, broadcasts: () => broadcasts, close: () => { server.close(); db.close(); rmSync(root, { recursive: true, force: true }); } };
}

const CHOSEN = { providerInstanceId: "local-opencode", model: "opencode-go/deepseek-v4.1-flash" };

test("with no body, a template still arrives as before: no model, no browser, and the starting-template note", async () => {
  const f = await fixture();
  try {
    const result = await f.install("research-team");
    assert.equal(result.status, 201);
    assert.equal(result.body.bots!.length, 3);
    for (const bot of result.body.bots!) {
      assert.equal(bot.providerInstanceId, null);
      assert.equal(bot.model, "");
      assert.equal(bot.browserEnabled, false);
      assert.equal(bot.computerEnabled, false);
      assert.match(bot.instructions, /You are a starting template/);
    }
    assert.equal(f.broadcasts(), 1);
  } finally { f.close(); }
});

test("the first run adds one teammate on the chosen AI, with the web only when asked", async () => {
  const f = await fixture();
  try {
    const first = await f.install("starter-team", { ...CHOSEN, members: [{ key: "chief", browserEnabled: true }], onlyIfEmpty: true });
    assert.equal(first.status, 201);
    const [scout] = first.body.bots!;
    assert.equal(first.body.bots!.length, 1);
    assert.equal(scout!.name, "Scout");
    assert.equal(scout!.role, "Chief of staff");
    assert.equal(scout!.providerInstanceId, "local-opencode");
    assert.equal(scout!.model, "opencode-go/deepseek-v4.1-flash");
    assert.equal(scout!.browserEnabled, true);
    assert.equal(scout!.computerEnabled, false);
    assert.doesNotMatch(scout!.instructions, /starting template/, "a teammate with a model isn't told it has none");

    // A second tab finishing the first run gets the existing team instead of a duplicate.
    const again = await f.install("starter-team", { ...CHOSEN, members: [{ key: "chief" }], onlyIfEmpty: true });
    assert.equal(again.status, 409);
    assert.deepEqual(again.body.bots!.map((bot) => bot.id), [scout!.id]);

    // A specialist added later: same AI, browser off unless asked.
    const writer = await f.install("starter-team", { ...CHOSEN, members: [{ key: "writer" }] });
    assert.equal(writer.status, 201);
    assert.equal(writer.body.bots![0]!.name, "Pixel");
    assert.equal(writer.body.bots![0]!.browserEnabled, false);
    assert.equal(f.db.listBots().length, 2);
  } finally { f.close(); }
});

test("a bad request creates nobody", async () => {
  const f = await fixture();
  try {
    const refusals: Array<[unknown, number, RegExp]> = [
      [{ ...CHOSEN, members: [{ key: "pilot" }] }, 400, /Choose teammates from this template/],
      [{ ...CHOSEN, members: [{ key: "chief" }, { key: "chief" }] }, 400, /each once/],
      [{ providerInstanceId: "local-opencode", members: [{ key: "chief" }] }, 400, /both an AI connection and a model/],
      [{ providerInstanceId: "missing", model: "x/y", members: [{ key: "chief" }] }, 400, /valid AI connection/],
      [{ providerInstanceId: "local-opencode", model: "openbot-other/model", members: [{ key: "chief" }] }, 400, /from the selected connection/],
      [{ providerInstanceId: "local-opencode", model: "opencode/ling-3.1-flash-free", members: [{ key: "chief" }] }, 400, new RegExp(BLOCKED_FREE_TIER_MESSAGE.replace(/[.']/g, "."))],
      [{ ...CHOSEN, members: [{ key: "chief" }], grantEverything: true }, 400, /isn't valid/],
    ];
    for (const [body, status, message] of refusals) {
      const result = await f.install("starter-team", body);
      assert.equal(result.status, status, JSON.stringify(body));
      assert.match(result.body.error!, message);
    }
    assert.equal((await f.install("no-such-team")).status, 404);
    assert.equal(f.db.listBots().length, 0);
    assert.equal(f.broadcasts(), 0);
  } finally { f.close(); }
});

test("at the teammate limit, nobody is created", async () => {
  const f = await fixture();
  try {
    f.db.updateStudioSettings({ maxTeammates: 2 });
    const result = await f.install("research-team", CHOSEN);
    assert.equal(result.status, 409);
    assert.match(result.body.error!, /room for 2 more teammates/);
    assert.equal(f.db.listBots().length, 0, "no half-installed team");
    assert.equal((await f.install("starter-team", { ...CHOSEN, members: [{ key: "chief" }, { key: "writer" }] })).status, 201);
  } finally { f.close(); }
});
