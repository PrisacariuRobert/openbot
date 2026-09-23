import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";

test("detached launcher reuses only the matching studio and refuses an occupied foreign port", async () => {
  const identity = randomUUID();
  let acknowledge = false;
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/api/healthz");
    assert.equal(request.headers["x-openbot-desktop-identity"], identity);
    if (acknowledge) response.setHeader("X-OpenBot-Desktop-Match", "1");
    response.writeHead(200).end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const launch = async () => {
    const child = spawn(process.execPath, [path.resolve(import.meta.dirname, "../scripts/background-runner.mjs")], {
      env: { ...process.env, OPENBOT_PORT: String(port), OPENBOT_DESKTOP_INSTANCE_ID: identity },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    const [code] = await once(child, "exit");
    return { code, stderr };
  };
  try {
    const wrong = await launch();
    assert.equal(wrong.code, 2);
    assert.match(wrong.stderr, /Another studio or service/);
    acknowledge = true;
    const own = await launch();
    assert.equal(own.code, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
