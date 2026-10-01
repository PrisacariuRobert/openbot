// Serves the Mac bundle through openbots.foundation so installs don't depend on how fast a visitor's
// connection is to GitHub's release servers. Everything is fetched from our own GitHub releases and
// cached at Cloudflare's edge; anything else on the site is served as static files.
//   /download/latest/<file>   → redirects to the newest release's file
//   /download/v0.41.0/<file>  → that release's file (immutable, cached for a long time)

const REPO = "PrisacariuRobert/openbot";
const FILES = /^openbot-darwin-(?:arm64|x64)\.tar\.gz(?:\.sha256)?$/;
const TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

/** Maps a request path to what we serve, or null when it is not a download path. */
export function routeDownload(pathname) {
  const match = /^\/download\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const [, version, file] = match;
  if (!FILES.test(file)) return null;
  if (version === "latest") return { kind: "latest", file };
  return TAG.test(version) ? { kind: "release", tag: version, file } : null;
}

const githubFile = (tag, file) => `https://github.com/${REPO}/releases/download/${tag}/${file}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = routeDownload(url.pathname);
    if (!route || (request.method !== "GET" && request.method !== "HEAD")) return env.ASSETS.fetch(request);

    if (route.kind === "latest") {
      // GitHub answers /releases/latest with a redirect to the newest tag's page. Remember that for a minute.
      const found = await fetch(`https://github.com/${REPO}/releases/latest`, { redirect: "manual", cf: { cacheEverything: true, cacheTtlByStatus: { "300-399": 60, "400-599": 0 } } });
      const tag = /\/tag\/(v[^/?#]+)$/.exec(found.headers.get("location") || "")?.[1];
      if (!tag || !TAG.test(tag)) return new Response("No release is available right now.", { status: 502 });
      return new Response(null, { status: 302, headers: { location: `/download/${tag}/${route.file}`, "cache-control": "public, max-age=60" } });
    }

    const upstream = await fetch(githubFile(route.tag, route.file), {
      method: request.method,
      redirect: "follow",
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 31536000, "400-599": 0 } },
    });
    if (!upstream.ok) return new Response("That download isn't available.", { status: upstream.status === 404 ? 404 : 502 });
    const headers = new Headers({ "content-type": route.file.endsWith(".sha256") ? "text/plain; charset=utf-8" : "application/gzip", "cache-control": "public, max-age=3600" });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("content-length", length);
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: 200, headers });
  },
};
