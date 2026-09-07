import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { heartbeatURL, publicHeartbeatAddress } from "./external-heartbeat.js";

export function extensionURL(raw: string, allowLoopback = false): URL {
  const url = new URL(raw);
  if (url.username || url.password || url.hash || url.search) throw new Error("Use an endpoint without a password, query, or fragment. Put access tokens in the private token field.");
  if (allowLoopback && url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port) return url;
  return heartbeatURL(raw);
}

// Pin the validated DNS result to the socket. Redirects never carry credentials
// elsewhere. Both JSON and SSE are streamed under a hard byte/time limit.
export function extensionFetch(endpoint: string, allowLoopback: boolean, signal: AbortSignal): typeof fetch {
  const allowed = extensionURL(endpoint, allowLoopback);
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.href !== allowed.href) throw new Error("The connector tried to contact an unapproved address.");
    const local = allowed.protocol === "http:";
    const hostname = allowed.hostname.replace(/^\[|\]$/g, "");
    const family = isIP(hostname);
    signal.throwIfAborted();
    const addresses = family ? [{ address: hostname, family }] : await new Promise<LookupAddress[]>((resolve, reject) => {
      const abort = () => reject(new Error("Connector DNS lookup stopped or timed out."));
      signal.addEventListener("abort", abort, { once: true });
      void lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
    if (!addresses.length || (!local && addresses.some(({ address }) => !publicHeartbeatAddress(address)))) throw new Error("The connector address must resolve to a public server.");
    signal.throwIfAborted();
    const target = addresses[0]!;
    const requestSignal = AbortSignal.any([signal, ...(init.signal ? [init.signal] : [])]);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    if (init.body && typeof init.body !== "string") throw new Error("Unsupported connector request body.");
    return await new Promise<Response>((resolve, reject) => {
      const request = (local ? httpRequest : httpsRequest)(allowed, {
        method: init.method || "GET", headers, signal: requestSignal,
        lookup: (_hostname, options, callback) => options.all ? callback(null, [target]) : callback(null, target.address, target.family),
      }, (incoming) => {
        const status = incoming.statusCode || 502;
        if (status >= 300 && status < 400) { incoming.destroy(); reject(new Error("Connector redirects are not allowed. Use its final endpoint.")); return; }
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        const stream = Readable.from((async function* () {
          let bytes = 0;
          for await (const chunk of incoming) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > 1_048_576) { incoming.destroy(); throw new Error("Connector response exceeded the 1 MB limit."); }
            yield chunk;
          }
        })());
        const noBody = [204, 205, 304].includes(status);
        if (noBody) incoming.resume();
        resolve(new Response(noBody ? null : Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers: responseHeaders }));
      });
      request.on("error", reject);
      request.end(init.body || undefined);
    });
  }) as typeof fetch;
}
