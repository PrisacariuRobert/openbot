/** Canonical studio base: a private host root, or one studio on a shared relay.
 * Validate the original path before URL parsing can normalize dot segments. */
export function secureStudioBase(raw: string): string | null {
  const path = /^https:\/\/[^/?#\\\s]+([^?#]*)$/.exec(raw)?.[1];
  if (path === undefined || !/^(?:\/?|\/s\/[a-f0-9]{24}\/?)$/.test(path)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin + path.replace(/\/$/, "");
  } catch { return null; }
}

/** Native API routing only. Never normalize a path across a studio boundary. */
export function relayRoute(raw: string): { studio: string; path: string } | null {
  if (raw.length > 8192 || /[\\\s#]/.test(raw)) return null;
  const match = /^\/s\/([a-f0-9]{24})(\/api\/[^?]*)(\?[^#]*)?$/.exec(raw);
  if (!match) return null;
  const path = match[2]!;
  // Reject encoded separators, dot segments and nested encodings. Query values
  // stay byte-for-byte intact, including URLs and escaped search text.
  if (/%(?:2f|5c|2e|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path) || path.includes("//") || path.split("/").some((part) => part === "." || part === "..")) return null;
  return { studio: match[1]!, path: path + (match[3] || "") };
}
