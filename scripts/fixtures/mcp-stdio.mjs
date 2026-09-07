import readline from "node:readline";

// Tiny hand-written MCP-over-stdio server for transport tests. Speaks only the
// messages OpenBot's client needs: initialize, tools/list, tools/call.
const state = { calls: [], envSeen: {} };
const tools = [
  { name: "read_project", description: "Read the current project brief over stdio", inputSchema: { type: "object", properties: { project: { type: "string" } }, required: ["project"], additionalProperties: false } },
  { name: "echo_env", description: "Report one named environment value as untrusted data", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } },
];
const send = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method === "initialize") {
    send(message.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "OpenBot stdio fixture", version: "1" } });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "tools/list") { send(message.id, { tools }); return; }
  if (message.method === "tools/call") {
    const name = String((message.params || {}).name || "");
    state.calls.push(name);
    const args = (message.params || {}).arguments || {};
    if (name === "read_project") send(message.id, { content: [{ type: "text", text: `CEDAR-42 (stdio) ${JSON.stringify(args.project)}` }] });
    else if (name === "echo_env") {
      const key = String(args.key || "");
      state.envSeen[key] = process.env[key] || "";
      send(message.id, { content: [{ type: "text", text: state.envSeen[key] ? `seen:${key}` : "missing" }] });
    } else send(message.id, { content: [{ type: "text", text: "unknown tool" }], isError: true });
    return;
  }
  if (message.id !== undefined) send(message.id, {});
});
setInterval(() => process.stdout.write(""), 30_000).unref();
process.on("SIGTERM", () => process.exit(0));
