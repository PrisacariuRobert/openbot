import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { OpenBotDatabase } from "./testing/database.js";
import { prepareWorkspace } from "./workspace.js";

test("MCP bridge carries decoded image bytes as an image content block", { timeout: 10_000 }, async () => {
  const bytes = await sharp({ create: { width: 16, height: 9, channels: 3, background: "#3175b9" } }).jpeg().toBuffer();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/api/internal/tools");
    let body = "";
    for await (const chunk of request) body += String(chunk);
    assert.equal(JSON.parse(body).action, "browser_see");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ observationId: "obs_fixture", mimeType: "image/jpeg", width: 16, height: 9, sha256, imageBase64: bytes.toString("base64") }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");
    const child = spawn(process.execPath, [fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url))], {
      env: { ...process.env, OPENBOT_INTERNAL_URL: `http://127.0.0.1:${address.port}`, OPENBOT_INTERNAL_TOKEN: "fixture", OPENBOT_BOT_ID: "nova", OPENBOT_RUN_ID: "run_fixture", OPENBOT_TOOL_AVAILABILITY: JSON.stringify({ browser_see: true }) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_see", arguments: {} } })}\n`);
    const exit = await new Promise<number | null>((resolve) => child.on("close", resolve));
    assert.equal(exit, 0, stderr);
    const answer = JSON.parse(stdout.trim()) as { result: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> } };
    assert.equal(answer.result.content[0]?.type, "text");
    assert.equal(JSON.parse(answer.result.content[0]!.text!).sha256, sha256);
    assert.doesNotMatch(answer.result.content[0]!.text!, /imageBase64/);
    assert.equal(answer.result.content[1]?.type, "image");
    assert.equal(answer.result.content[1]?.mimeType, "image/jpeg");
    assert.deepEqual(Buffer.from(answer.result.content[1]!.data!, "base64"), bytes);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("generated OpenCode image tool returns a real file attachment, not base64 prose", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-image-adapter-"));
  const db = new OpenBotDatabase(root);
  try {
    db.updateBot("nova", { browserEnabled: true });
    db.updateStudioSettings({ semanticBrowserEnabled: true });
    const workspace = prepareWorkspace(db, db.getBot("nova")!);
    const source = readFileSync(path.join(workspace, ".opencode", "tools", "browser_see.ts"), "utf8");
    const runnable = source.replace(/^import \{ tool \} from "@opencode-ai\/plugin";\s*/, "").replace("export default tool({", "return tool({");
    assert.notEqual(runnable, source, "the generated adapter should be executable in the deterministic peer");
    const bytes = await sharp({ create: { width: 16, height: 9, channels: 3, background: "#3175b9" } }).jpeg().toBuffer();
    const tool = Object.assign((definition: unknown) => definition, { schema: { string: () => ({ optional: () => ({}) }) } });
    const calls: unknown[] = [];
    const peerFetch = async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ observationId: "obs_fixture", mimeType: "image/jpeg", width: 16, height: 9, imageBase64: bytes.toString("base64") }) };
    };
    const generated = new Function("tool", "fetch", "process", runnable)(tool, peerFetch, { env: { OPENBOT_INTERNAL_URL: "http://fixture", OPENBOT_INTERNAL_TOKEN: "token", OPENBOT_BOT_ID: "nova", OPENBOT_RUN_ID: "run_fixture" } }) as { execute(args: object): Promise<{ output: string; attachments: Array<{ type: string; mime: string; url: string }> }> };
    const result = await generated.execute({});
    assert.deepEqual((calls[0] as { action: string }).action, "browser_see");
    assert.doesNotMatch(result.output, /imageBase64/);
    assert.equal(result.attachments[0]?.type, "file");
    assert.equal(result.attachments[0]?.mime, "image/jpeg");
    assert.deepEqual(Buffer.from(result.attachments[0]!.url.split(",")[1]!, "base64"), bytes);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
