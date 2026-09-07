import { createServer, type ServerResponse } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import WebSocket, { WebSocketServer } from "ws";
import { relayRoute } from "./relay-address.js";
import { forwardedRequestHeaders, forwardedResponseHeaders, RELAY_BODY_LIMIT, RELAY_PENDING_LIMIT, relayResponse } from "./relay-protocol.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const matches = (a: string, b: string) => { const x = Buffer.from(hash(a)), y = Buffer.from(hash(b)); return timingSafeEqual(x, y); };

/** Operator-hosted transport. No chat/file data is persisted here. TLS terminates
 * at the operator's proxy; it is a trusted relay, NOT an end-to-end encrypted one. */
export function createRelayService(options: { enrollmentToken: string; database: string; maxStudios?: number }) {
  if (options.enrollmentToken.length < 32) throw new Error("Relay enrollment requires a strong operator secret.");
  const db = new DatabaseSync(options.database);
  if (options.database !== ":memory:") chmodSync(options.database, 0o600);
  db.exec("CREATE TABLE IF NOT EXISTS hosts (id TEXT PRIMARY KEY, secretHash TEXT NOT NULL)");
  type Connection = { socket: WebSocket; pending: Map<string, ServerResponse>; alive: boolean };
  const studios = new Map<string, Connection>();
  let bufferedUploads = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    // A shared hostname is not a browser isolation boundary. Native bearer API
    // only: no cookies, CORS, active HTML, OAuth callbacks or hosted web UI.
    const sandbox = "default-src 'none'; sandbox; frame-ancestors 'none'";
    res.setHeader("Content-Security-Policy", sandbox);
    // Node's fetch adds Sec-Fetch-Mode too, so use browser-only context fields.
    if (req.headers.origin || req.headers["sec-fetch-site"] || req.headers["sec-fetch-dest"]) { res.writeHead(403).end(); return; }
    if ((req.method === "GET" || req.method === "HEAD") && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}'); return;
    }
    const enroll = /^\/v1\/studios\/([a-f0-9]{24})$/.exec(req.url || "");
    if (req.method === "PUT" && enroll) {
      if (!matches(req.headers.authorization || "", `Bearer ${options.enrollmentToken}`)) { res.writeHead(401).end(); return; }
      let text = "";
      try {
        for await (const chunk of req) { text += chunk.toString(); if (text.length > 1024) { res.writeHead(413).end(); return; } }
        const body = JSON.parse(text) as { secret?: string };
        if (typeof body.secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.secret)) { res.writeHead(400).end(); return; }
        const existing = db.prepare("SELECT secretHash FROM hosts WHERE id = ?").get(enroll[1]!) as { secretHash: string } | undefined;
        if (existing && existing.secretHash !== hash(body.secret)) { res.writeHead(409).end(); return; }
        const count = db.prepare("SELECT count(*) AS n FROM hosts").get() as { n: number };
        if (!existing && count.n >= (options.maxStudios || 100)) { res.writeHead(503).end(); return; }
        db.prepare("INSERT OR IGNORE INTO hosts(id,secretHash) VALUES(?,?)").run(enroll[1]!, hash(body.secret));
        res.writeHead(204).end();
      } catch { if (!res.headersSent) res.writeHead(400).end(); }
      return;
    }
    const route = relayRoute(req.url || "");
    if (!route) { res.writeHead(404).end(); return; }
    const connection = studios.get(route.studio);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) { res.writeHead(503, { "Content-Type": "application/json" }).end('{"error":"Your studio is offline. Keep OpenBot running on your Mac."}'); return; }
    if (connection.pending.size >= RELAY_PENDING_LIMIT || bufferedUploads >= 4) { res.writeHead(429).end(); return; }
    if (!req.url?.startsWith("/") || req.url.startsWith("//") || req.url.length > 8192 || !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(req.method || "")) { res.writeHead(400).end(); return; }
    const requestId = randomUUID();
    connection.pending.set(requestId, res);
    const timeout = setTimeout(() => { res.destroy(); }, 90_000);
    timeout.unref();
    res.on("close", () => {
      clearTimeout(timeout);
      connection.pending.delete(requestId);
      if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(JSON.stringify({ type: "cancel", id: requestId }));
    });
    bufferedUploads++;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > RELAY_BODY_LIMIT) { res.writeHead(413).end(); return; }
        chunks.push(chunk as Buffer);
      }
      if (res.destroyed) return;
      if (connection.socket.readyState !== WebSocket.OPEN || connection.socket.bufferedAmount > 4 * 1024 * 1024) { res.writeHead(503).end(); return; }
      connection.socket.send(JSON.stringify({ type: "request", id: requestId, method: req.method, path: route.path, headers: forwardedRequestHeaders(req.headers), body: Buffer.concat(chunks).toString("base64") }));
    } catch { res.destroy(); } finally { bufferedUploads--; }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.maxHeadersCount = 64;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false });
  server.on("upgrade", (req, socket, head) => {
    const id = /^\/v1\/tunnel\/([a-f0-9]{24})$/.exec(req.url || "")?.[1];
    const record = id ? db.prepare("SELECT secretHash FROM hosts WHERE id = ?").get(id) as { secretHash: string } | undefined : undefined;
    const secret = req.headers.authorization?.replace(/^Bearer /, "") || "";
    if (!id || !record || !secret || !matches(record.secretHash, hash(secret))) { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    if (studios.has(id)) { socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const connection: Connection = { socket: ws, pending: new Map(), alive: true };
      studios.set(id, connection);
      ws.on("pong", () => { connection.alive = true; });
      ws.on("error", () => { /* never log traffic */ });
      ws.on("message", (raw) => {
        try {
          const frame = relayResponse.parse(JSON.parse(raw.toString()));
          const response = connection.pending.get(frame.id);
          if (!response || response.destroyed) return;
          if (frame.type === "head") {
            if (response.headersSent) throw new Error("Duplicate headers");
            response.writeHead(frame.status, { ...forwardedResponseHeaders(frame.headers), "content-security-policy": "default-src 'none'; sandbox; frame-ancestors 'none'", "x-content-type-options": "nosniff", "cache-control": "no-store" });
            response.flushHeaders();
          }
          if (frame.type === "chunk") {
            if (!response.headersSent || response.writableLength > 4 * 1024 * 1024) { response.destroy(); return; }
            response.write(Buffer.from(frame.body, "base64"));
          }
          if (frame.type === "end") response.end();
          if (frame.type === "error") { if (!response.headersSent) response.writeHead(502); response.end(); }
        } catch { ws.close(1008, "Invalid studio frame"); }
      });
      ws.on("close", () => { if (studios.get(id) === connection) studios.delete(id); for (const res of connection.pending.values()) { if (!res.headersSent) res.writeHead(503); res.end(); } });
    });
  });
  const heartbeat = setInterval(() => { for (const connection of studios.values()) { if (!connection.alive) connection.socket.terminate(); else { connection.alive = false; connection.socket.ping(); } } }, 25_000);
  heartbeat.unref();
  return { server, close: async () => {
    clearInterval(heartbeat);
    for (const connection of studios.values()) connection.socket.terminate();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  } };
}
