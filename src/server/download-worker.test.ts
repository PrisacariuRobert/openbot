import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import worker, { redirectTarget, routeDownload } from "../../deploy/download-worker.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const ASSETS = { fetch: async () => new Response("static", { status: 200 }) };
const request = (pathname: string, method = "GET") => new Request(`https://sidemates.app${pathname}`, { method });

async function withFetch<T>(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, run: (calls: string[]) => Promise<T>) {
  const original = globalThis.fetch, calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); calls.push(url); return handler(url, init); }) as typeof fetch;
  try { return await run(calls); } finally { globalThis.fetch = original; }
}

test("only our own bundle files can be downloaded through the site", () => {
  assert.deepEqual(routeDownload("/download/latest/sidemates-darwin-arm64.tar.gz"), { kind: "latest", file: "sidemates-darwin-arm64.tar.gz" });
  assert.deepEqual(routeDownload("/download/v0.41.0/sidemates-darwin-x64.tar.gz.sha256"), { kind: "release", tag: "v0.41.0", file: "sidemates-darwin-x64.tar.gz.sha256" });
  assert.deepEqual(routeDownload("/download/v0.37.0-beta.1/sidemates-darwin-arm64.tar.gz"), { kind: "release", tag: "v0.37.0-beta.1", file: "sidemates-darwin-arm64.tar.gz" });
  for (const bad of ["/download/", "/download/latest", "/download/latest/install.sh", "/download/latest/../install.sh", "/download/v1/sidemates-darwin-arm64.tar.gz", "/download/main/sidemates-darwin-arm64.tar.gz", "/download/v0.41.0/openbot-linux-x64.tar.gz", "/download/v0.41.0/sidemates-darwin-arm64.tar.gz/extra", "/download/%2e%2e/sidemates-darwin-arm64.tar.gz", "/install.sh", "/"]) {
    assert.equal(routeDownload(bad), null, bad);
  }
});

test("latest redirects to the newest release's file", async () => {
  await withFetch(() => new Response(null, { status: 302, headers: { location: "https://github.com/PrisacariuRobert/sidemates/releases/tag/v0.41.0" } }), async (calls) => {
    const response = await worker.fetch(request("/download/latest/sidemates-darwin-arm64.tar.gz"), { ASSETS });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/download/v0.41.0/sidemates-darwin-arm64.tar.gz");
    assert.deepEqual(calls, ["https://github.com/PrisacariuRobert/sidemates/releases/latest"]);
  });
  await withFetch(() => new Response("nothing", { status: 200 }), async () => {
    assert.equal((await worker.fetch(request("/download/latest/sidemates-darwin-arm64.tar.gz"), { ASSETS })).status, 502, "no release found");
  });
  await withFetch(() => new Response(null, { status: 302, headers: { location: "https://evil.example/tag/v9.9.9" } }), async () => {
    // Only a tag name is ever taken from GitHub's answer, never a host.
    const response = await worker.fetch(request("/download/latest/sidemates-darwin-arm64.tar.gz"), { ASSETS });
    assert.match(response.headers.get("location") || "", /^\/download\/v9\.9\.9\//);
  });
});

test("a release file streams from our GitHub release, with the right headers", async () => {
  await withFetch(() => new Response("bundle-bytes", { status: 200, headers: { "content-length": "12", "content-type": "application/octet-stream" } }), async (calls) => {
    const response = await worker.fetch(request("/download/v0.41.0/sidemates-darwin-arm64.tar.gz"), { ASSETS });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "bundle-bytes");
    assert.equal(response.headers.get("content-type"), "application/gzip");
    assert.equal(response.headers.get("content-length"), "12");
    assert.deepEqual(calls, ["https://github.com/PrisacariuRobert/sidemates/releases/download/v0.41.0/sidemates-darwin-arm64.tar.gz"]);
    const sha = await worker.fetch(request("/download/v0.41.0/sidemates-darwin-arm64.tar.gz.sha256"), { ASSETS });
    assert.match(sha.headers.get("content-type") || "", /^text\/plain/);
    const head = await worker.fetch(request("/download/v0.41.0/sidemates-darwin-arm64.tar.gz", "HEAD"), { ASSETS });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  });
  await withFetch(() => new Response("missing", { status: 404 }), async () => {
    assert.equal((await worker.fetch(request("/download/v0.99.0/sidemates-darwin-arm64.tar.gz"), { ASSETS })).status, 404);
  });
  await withFetch(() => new Response("boom", { status: 503 }), async () => {
    assert.equal((await worker.fetch(request("/download/v0.41.0/sidemates-darwin-arm64.tar.gz"), { ASSETS })).status, 502);
  });
});

test("everything else is the static site, and downloads are read-only", async () => {
  for (const [pathname, method] of [["/", "GET"], ["/alternatives/", "GET"], ["/install.sh", "GET"], ["/download/latest/sidemates-darwin-arm64.tar.gz", "POST"]] as const) {
    const response = await worker.fetch(request(pathname, method), { ASSETS });
    assert.equal(await response.text(), "static", `${method} ${pathname}`);
  }
});

test("releases published under the old name still download, and nothing else slips through", () => {
  assert.deepEqual(routeDownload("/download/v0.41.1/openbot-darwin-arm64.tar.gz"), { kind: "release", tag: "v0.41.1", file: "openbot-darwin-arm64.tar.gz" });
  assert.equal(routeDownload("/download/latest/other-darwin-arm64.tar.gz"), null);
  // The Mac download page's disk images, and their fingerprints.
  assert.deepEqual(routeDownload("/download/latest/Sidemates-mac-arm64.dmg"), { kind: "latest", file: "Sidemates-mac-arm64.dmg" });
  assert.deepEqual(routeDownload("/download/v0.43.0/Sidemates-mac-x64.dmg.sha256"), { kind: "release", tag: "v0.43.0", file: "Sidemates-mac-x64.dmg.sha256" });
  for (const bad of ["Sidemates-mac-arm64.dmg.zip", "sidemates-mac-arm64.dmg", "Sidemates-mac-universal.dmg", "Sidemates-0.43.0-mac-arm64.dmg"]) assert.equal(routeDownload(`/download/latest/${bad}`), null, bad);
});

test("the old OpenBot host sends pages to sidemates.app but keeps the installer and downloads", async () => {
  const on = (host: string, pathname: string) => redirectTarget(new URL(`https://${host}${pathname}`));
  assert.equal(on("openbots.foundation", "/"), "https://sidemates.app/");
  assert.equal(on("www.openbots.foundation", "/alternatives/siri-ai/?x=1"), "https://sidemates.app/alternatives/siri-ai/?x=1");
  assert.equal(on("openbots.foundation", "/robots.txt"), "https://sidemates.app/robots.txt");
  assert.equal(on("openbots.foundation", "/install.sh"), null, "copies installed as OpenBot update through this");
  assert.equal(on("openbots.foundation", "/download/latest/sidemates-darwin-arm64.tar.gz"), null);
  assert.equal(on("www.sidemates.app", "/install.sh"), "https://sidemates.app/install.sh");
  assert.equal(on("sidemates.app", "/"), null);
  assert.equal(on("sidemates.app", "/install.sh"), null);
  const moved = await worker.fetch(new Request("https://openbots.foundation/alternatives/"), { ASSETS });
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get("location"), "https://sidemates.app/alternatives/");
  assert.equal(await (await worker.fetch(new Request("https://openbots.foundation/install.sh"), { ASSETS })).text(), "static");
});

test("the site config serves every domain through the Worker and keeps the static site as it was", () => {
  const config = readFileSync(path.join(root, "deploy/install-site.wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const parsed = JSON.parse(config) as { main: string; assets: { binding: string; directory: string; run_worker_first: boolean | string[] }; routes: { pattern: string; custom_domain: boolean }[] };
  assert.equal(parsed.main, "./download-worker.mjs");
  assert.equal(parsed.assets.run_worker_first, true, "the old host's pages need the Worker to redirect them");
  assert.equal(parsed.assets.binding, "ASSETS");
  assert.equal(parsed.assets.directory, "../site");
  assert.deepEqual(parsed.routes.map((route) => route.pattern).sort(), ["openbots.foundation", "sidemates.app", "www.openbots.foundation", "www.sidemates.app"]);
});
