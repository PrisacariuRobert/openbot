import test from "node:test";
import assert from "node:assert/strict";
import { run, SUBPROCESS_STREAM_LIMIT } from "./runtime.js";

test("normal small output passes through byte-identical (JSON stays intact)", async () => {
  const result = await run(process.execPath, ["-e", 'console.log(JSON.stringify({ ok: true, items: [1, 2, 3] }))']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '{"ok":true,"items":[1,2,3]}\n');
});

test("a 60 MiB flood stays inside the memory limit and reports the truncation", async () => {
  const started = Date.now();
  const result = await run(process.execPath, ["-e", "for (let i = 0; i < 300000; i++) console.log('x'.repeat(200));"], 60_000);
  assert.ok(Date.now() - started < 55_000, "must finish well inside the test budget");
  assert.equal(result.code, 0);
  assert.ok(result.stdout.length <= SUBPROCESS_STREAM_LIMIT + 1_024, `stdout escaped the limit at ${result.stdout.length} bytes`);
  assert.match(result.stderr, /truncated stdout at 4 MiB/);
});

test("a SIGTERM-ignoring process is terminated, not merely unwatched", async () => {
  const started = Date.now();
  const result = await run(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 50);"], 500);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 15_000, `took ${elapsed}ms — the process was not killed`);
  assert.notEqual(result.code, 0);
});
