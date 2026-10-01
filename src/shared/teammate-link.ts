/** A teammate as a link. The bundle (name, face, job, instructions, skills,
 * paused routines — never history, memory or access) is deflated and put in
 * the part of the address after "#", which browsers never send to a server:
 *
 *   https://openbots.foundation/t/#1.<base64url>
 *
 * The same codec runs in the studio (browser), the website and the tests. */

export const LINK_BASE = "https://openbots.foundation/t/#";
const VERSION = "1.";
export const MAX_PAYLOAD_CHARS = 60_000;
export const MAX_BUNDLE_BYTES = 64_000;

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function collect(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("This teammate link is too large."); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

export async function encodeTeammate(bundle: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(bundle));
  if (json.length > MAX_BUNDLE_BYTES) throw new Error("This teammate is too large to share as a link. Share it as a file instead.");
  const stream = new Blob([json as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return VERSION + toBase64Url(await collect(stream, MAX_PAYLOAD_CHARS));
}

export async function decodeTeammate(payload: string): Promise<unknown> {
  const text = payload.trim();
  if (!text.startsWith(VERSION) || text.length > MAX_PAYLOAD_CHARS || !/^[A-Za-z0-9_-]+$/.test(text.slice(VERSION.length))) throw new Error("This doesn't look like an OpenBot teammate link.");
  let bytes: Uint8Array;
  try { bytes = fromBase64Url(text.slice(VERSION.length)); } catch { throw new Error("This teammate link is damaged."); }
  try {
    // The decompressed size is capped while reading, so a tiny link can't expand without limit.
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(await collect(stream, MAX_BUNDLE_BYTES)));
  } catch (error) {
    if (error instanceof Error && /too large/.test(error.message)) throw error;
    throw new Error("This teammate link is damaged.");
  }
}

/** Accepts the whole link, just the part after "#", or the payload itself. */
export function payloadFromLink(text: string): string | null {
  const trimmed = text.trim();
  const hash = trimmed.includes("#") ? trimmed.slice(trimmed.indexOf("#") + 1) : trimmed;
  const payload = decodeURIComponent(hash).trim();
  return payload.startsWith(VERSION) ? payload : null;
}

export const teammateLink = async (bundle: unknown) => `${LINK_BASE}${await encodeTeammate(bundle)}`;
