import { randomBytes } from "node:crypto";
import { existsSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest, type ClientRequest } from "node:http";
import WebSocket from "ws";
import { forwardedRequestHeaders, forwardedResponseHeaders, RELAY_BODY_LIMIT, RELAY_PENDING_LIMIT, relayRequest } from "./relay-protocol.js";

type Identity = { id: string; secret: string };
export class BuiltinRelayClient {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private generation = 0;
  private backoff = 1_000;
  private readonly active = new Map<string, ClientRequest>();
  private readonly identity: Identity;
  readonly studioURL: string;
  get connected() { return this.socket?.readyState === WebSocket.OPEN; }

  constructor(private readonly options: { relayUrl: string; localPort: number; identityFile: string; enrollmentToken?: string; testOnlyPlaintext?: boolean }) {
    const url = new URL(options.relayUrl);
    if ((!options.testOnlyPlaintext || url.hostname !== "127.0.0.1") && url.protocol !== "https:") throw new Error("The built-in relay requires HTTPS.");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Use the relay's HTTPS root address.");
    if (existsSync(options.identityFile)) this.identity = JSON.parse(readFileSync(options.identityFile, "utf8")) as Identity;
    else {
      this.identity = { id: randomBytes(12).toString("hex"), secret: randomBytes(32).toString("base64url") };
      writeFileSync(options.identityFile, JSON.stringify(this.identity), { mode: 0o600, flag: "wx" });
    }
    chmodSync(options.identityFile, 0o600);
    if (!/^[a-f0-9]{24}$/.test(this.identity.id) || !/^[A-Za-z0-9_-]{43}$/.test(this.identity.secret)) throw new Error("The studio's relay identity needs repair.");
    this.studioURL = `${url.origin}/s/${this.identity.id}`;
  }
  start() { if (!this.stopped) return; this.stopped = false; void this.connect(++this.generation); }
  stop() {
    this.stopped = true;
    this.generation++;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.socket?.terminate();
    this.socket = null;
    for (const request of this.active.values()) request.destroy();
    this.active.clear();
  }
  private async connect(generation: number) {
    if (this.stopped || generation !== this.generation) return;
    try {
      if (this.options.enrollmentToken) {
        const result = await fetch(new URL(`/v1/studios/${this.identity.id}`, this.options.relayUrl), {
          method: "PUT", headers: { Authorization: `Bearer ${this.options.enrollmentToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ secret: this.identity.secret }), redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        await result.body?.cancel();
        if (!result.ok) throw new Error("Relay enrollment is unavailable.");
      }
      if (this.stopped || generation !== this.generation) return;
      const url = new URL(`/v1/tunnel/${this.identity.id}`, this.options.relayUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${this.identity.secret}` }, followRedirects: false, handshakeTimeout: 10_000, maxPayload: 36 * 1024 * 1024, perMessageDeflate: false });
      this.socket = socket;
      let alive = true;
      const heartbeat = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (!alive) socket.terminate();
        else { alive = false; socket.ping(); }
      }, 25_000);
      heartbeat.unref();
      socket.on("pong", () => { alive = true; });
      socket.on("open", () => { this.backoff = 1_000; });
      socket.on("error", () => { /* No URLs, tokens, bodies or auth headers in logs. */ });
      socket.on("message", (data) => {
        if (generation !== this.generation) return;
        try {
          const message = relayRequest.parse(JSON.parse(data.toString()));
          if (message.type === "cancel") { this.active.get(message.id)?.destroy(); this.active.delete(message.id); return; }
          this.forward(message, socket);
        } catch { socket.close(1008, "Invalid relay frame"); }
      });
      socket.on("close", () => {
        clearInterval(heartbeat);
        if (generation !== this.generation) return;
        for (const request of this.active.values()) request.destroy();
        this.active.clear();
        if (this.socket === socket) this.socket = null;
        this.schedule(generation);
      });
    } catch { this.schedule(generation); }
  }
  private schedule(generation: number) {
    if (this.stopped || this.retry || generation !== this.generation) return;
    this.retry = setTimeout(() => { this.retry = null; void this.connect(generation); }, this.backoff + Math.floor(Math.random() * 250));
    this.retry.unref();
    this.backoff = Math.min(this.backoff * 2, 30_000);
  }
  private forward(message: Extract<ReturnType<typeof relayRequest.parse>, { type: "request" }>, socket: WebSocket) {
    const send = (frame: object) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame)); };
    if (this.active.size >= RELAY_PENDING_LIMIT || this.active.has(message.id)) { send({ type: "error", id: message.id }); return; }
    const body = Buffer.from(message.body, "base64");
    if (body.length > RELAY_BODY_LIMIT || /[\\\r\n#]/.test(message.path)) { send({ type: "error", id: message.id }); return; }
    // Fixed loopback target: the relay cannot turn this into an arbitrary-network proxy.
    // Force the relay marker even if an untrusted sender tries to strip/spoof it.
    const request = httpRequest({ hostname: "127.0.0.1", port: this.options.localPort, method: message.method, path: message.path,
      headers: { ...forwardedRequestHeaders(message.headers), host: new URL(this.studioURL).host, "x-openbot-relay": "1", "x-forwarded-proto": "https", "content-length": String(body.length) },
    }, (response) => {
      send({ type: "head", id: message.id, status: response.statusCode || 502, headers: forwardedResponseHeaders(response.headers) });
      response.on("data", (chunk: Buffer) => {
        // Keep response frames small and cap buffered output for slow phones.
        if (socket.bufferedAmount > 4 * 1024 * 1024) { request.destroy(); send({ type: "error", id: message.id }); return; }
        for (let i = 0; i < chunk.length; i += 48 * 1024) send({ type: "chunk", id: message.id, body: chunk.subarray(i, i + 48 * 1024).toString("base64") });
      });
      response.on("end", () => { this.active.delete(message.id); send({ type: "end", id: message.id }); });
      response.on("error", () => { this.active.delete(message.id); send({ type: "error", id: message.id }); });
    });
    this.active.set(message.id, request);
    request.setTimeout(90_000, () => request.destroy());
    request.on("error", () => { this.active.delete(message.id); send({ type: "error", id: message.id }); });
    request.end(body);
  }
}
