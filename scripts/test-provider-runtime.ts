// A real OpenCode process against a disposable, deterministic model endpoint.
// No production model accounts, user conversations, or external writes are used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { apiRuntimeEnvironment } from "../src/shared/provider-config.js";
import { safeHostEnvironment } from "../src/server/runtime.js";
import { ModelOutput } from "../src/server/model-output.js";
import type { ProviderInstance } from "../src/shared/types.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-runtime-contract-"));
const requests: { model: unknown; authorization: string | undefined }[] = [];
const server = createServer(async (request, response) => {
  if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  let input = "";
  for await (const chunk of request) {
    input += String(chunk);
    if (input.length > 1_000_000) {
      response.writeHead(413).end();
      return;
    }
  }
  const body = JSON.parse(input);
  requests.push({
    model: body.model,
    authorization: request.headers.authorization,
  });
  const completion = {
    id: "fixture-completion",
    object: "chat.completion",
    created: 1,
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "OPENBOT_RUNTIME_OK" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
  };
  if (!body.stream) {
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(completion));
    return;
  }
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const chunk of [
    {
      ...completion,
      object: "chat.completion.chunk",
      usage: undefined,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "OPENBOT_RUNTIME_OK" },
          finish_reason: null,
        },
      ],
    },
    {
      ...completion,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ])
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.end("data: [DONE]\n\n");
});

try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const connection: ProviderInstance = {
    id: "runtime-test",
    ownerId: "fixture",
    provider: "custom",
    name: "Test endpoint",
    authMode: "api_key",
    runtime: "opencode",
    envName: null,
    hasSecret: true,
    createdAt: "",
    updatedAt: "",
    apiConfig: {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      protocol: "openai-compatible",
      modelIds: ["fixture-model:latest"],
    },
  };
  const environment = apiRuntimeEnvironment(connection, "fixture-only-key");
  const config = JSON.parse(environment.OPENCODE_CONFIG_CONTENT!);
  config.model = "openbot-runtime-test/fixture-model:latest";
  config.small_model = config.model;
  config.share = "disabled";
  config.permission = "deny";
  config.autoupdate = false;
  const workspace = path.join(root, "workspace");
  mkdirSync(workspace);
  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      "opencode",
      [
        "run",
        "--format",
        "json",
        "--model",
        config.model,
        "--dir",
        workspace,
        "Reply with OPENBOT_RUNTIME_OK. Do not call any tools.",
      ],
      {
        cwd: workspace,
        stdio: ["ignore", "pipe", "pipe"],
        env: safeHostEnvironment({
          ...environment,
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
          HOME: root,
          XDG_CONFIG_HOME: path.join(root, "config"),
          XDG_DATA_HOME: path.join(root, "data"),
          XDG_CACHE_HOME: path.join(root, "cache"),
          OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
          OPENCODE_DISABLE_SHARE: "true",
        }),
      },
    );
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + String(chunk)).slice(-100_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-20_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
  assert.equal(
    result.code,
    0,
    `OpenCode did not finish: ${result.stderr}\n${result.stdout}`,
  );
  assert.ok(
    requests.length > 0,
    `The custom endpoint received no requests: ${result.stderr}\n${result.stdout}`,
  );
  assert.ok(
    requests.every(
      (request) =>
        request.model === "fixture-model:latest" &&
        request.authorization === "Bearer fixture-only-key",
    ),
  );
  assert.match(result.stdout, /OPENBOT_RUNTIME_OK/);
  const output = new ModelOutput("opencode");
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    try { output.add(JSON.parse(line)); } catch { /* CLI diagnostics are not output events. */ }
  }
  assert.equal(output.finalText, "OPENBOT_RUNTIME_OK", "The actual installed CLI must produce a final answer with the same parser used by tasks.");
  assert.deepEqual(output.drainProgress(), []);
  console.log(
    `PASS: real OpenCode -> configured endpoint -> streamed reply (${requests.length} request(s)); model ID and scoped key verified.`,
  );
  console.log(
    "This is a deterministic transport test, not a live-model productivity benchmark.",
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
}
