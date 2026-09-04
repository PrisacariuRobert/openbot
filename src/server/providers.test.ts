import test from "node:test";
import assert from "node:assert/strict";
import {
  oauthMethodIndex,
  ProviderConnectionManager,
  createProviderStatusReader,
} from "./providers.js";
import type { OpenBotDatabase } from "./database.js";
import type { ProviderInstance, ProviderStatus } from "../shared/types.js";

test("coalesces repeated status polling and refreshes when a key or login state changes", async () => {
  let calls = 0;
  const entries: ProviderInstance[] = [];
  const db = { listProviders: () => entries } as unknown as OpenBotDatabase;
  const read = createProviderStatusReader(async () => {
    calls += 1;
    return { version: String(calls) } as ProviderStatus;
  });
  await Promise.all([read(db), read(db), read(db)]);
  assert.equal(calls, 1);
  await read(db);
  assert.equal(calls, 1);
  entries.push({
    id: "saved-key",
    authMode: "api_key",
    updatedAt: "now",
  } as ProviderInstance);
  await read(db);
  assert.equal(calls, 2);
  await read(db, [
    {
      id: "login",
      providerId: "openai",
      status: "connected",
      url: null,
      callbackMode: null,
      instructions: "",
      error: null,
    },
  ]);
  assert.equal(calls, 3);
});

test("a failed status probe can be retried instead of staying cached", async () => {
  let calls = 0;
  const db = { listProviders: () => [] } as unknown as OpenBotDatabase;
  const read = createProviderStatusReader(async () => {
    if (++calls === 1) throw new Error("temporary failure");
    return {} as ProviderStatus;
  });
  await assert.rejects(read(db), /temporary/);
  await read(db);
  assert.equal(calls, 2);
});

test("selects an advertised OAuth method instead of assuming method zero", () => {
  assert.equal(
    oauthMethodIndex([{ type: "api" }, { type: "oauth", label: "Account" }]),
    1,
  );
  assert.throws(() => oauthMethodIndex([{ type: "api" }]), /API key/);
  assert.throws(() => oauthMethodIndex(undefined), /API key/);
});

test("automatic login finishes its callback and updates the attempt", async () => {
  let complete!: () => void;
  const calls: unknown[] = [];
  const bridge = {
    authorize: async () => ({
      url: "https://example.com/login",
      method: "auto" as const,
      instructions: "Sign in",
      methodIndex: 2,
    }),
    callback: async (...args: unknown[]) => {
      calls.push(args);
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    },
    stop() {},
  };
  const manager = new ProviderConnectionManager(() => {}, bridge);
  const attempt = await manager.connect("openai");
  assert.equal(attempt.status, "waiting");
  assert.equal((await manager.connect("openai")).id, attempt.id);
  assert.deepEqual(calls, [["openai", 2]]);
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.listAttempts()[0]?.status, "connected");
});

test("manual codes keep the selected method and unsupported login returns a visible failure", async () => {
  const calls: unknown[] = [];
  const manager = new ProviderConnectionManager(() => {}, {
    authorize: async (id) => {
      if (id === "xai") throw new Error("Use an API key instead.");
      return {
        url: "https://example.com/login",
        method: "code",
        instructions: "Paste code",
        methodIndex: 1,
      };
    },
    callback: async (...args) => {
      calls.push(args);
    },
    stop() {},
  });
  const attempt = await manager.connect("openai");
  await manager.finish(attempt.id, "fixture-code");
  assert.deepEqual(calls, [["openai", 1, "fixture-code"]]);
  const unsupported = await manager.connect("xai");
  assert.equal(unsupported.status, "failed");
  assert.equal(unsupported.error, "Use an API key instead.");
});
