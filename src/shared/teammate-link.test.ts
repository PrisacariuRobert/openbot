import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { decodeTeammate, encodeTeammate, LINK_BASE, MAX_BUNDLE_BYTES, payloadFromLink, teammateLink } from "./teammate-link.js";

const bundle = { kind: "openbot-teammate", version: 1, bot: { name: "Receipt keeper", emoji: "🧾", color: "#299575", role: "Finds receipts and files them", instructions: "Find receipts in Mail and save the PDFs. Zürich café ✓" }, skills: [], routines: [] };

test("a teammate survives the round trip, including accents and symbols", async () => {
  const payload = await encodeTeammate(bundle);
  assert.match(payload, /^1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeTeammate(payload), bundle);
});

test("a full-size teammate fits comfortably in a link", async () => {
  const instructions = "Read the unread mail from the last two days. Pick the messages that need an answer or an action, one line each: who, and what is asked. Skip newsletters and automatic notifications. ".repeat(10).slice(0, 2_000);
  const big = { ...bundle, bot: { ...bundle.bot, instructions }, routines: [{ name: "Weekly", prompt: instructions, intervalMinutes: 10_080 }] };
  const payload = await encodeTeammate(big);
  assert.ok(payload.length < JSON.stringify(big).length * 0.6, `link is ${payload.length} characters`);
  assert.ok(payload.length < 4_000);
  assert.deepEqual(await decodeTeammate(payload), big);
});

test("the link works whole, as a fragment, or as the bare payload", async () => {
  const link = await teammateLink(bundle);
  assert.ok(link.startsWith(LINK_BASE));
  const payload = link.slice(LINK_BASE.length);
  for (const text of [link, `#${payload}`, payload, `  ${link}\n`, link.replace(payload, encodeURIComponent(payload))]) assert.equal(payloadFromLink(text), payload);
  assert.equal(payloadFromLink("https://example.com/#nothing"), null);
  assert.equal(payloadFromLink("hello"), null);
});

test("damaged and hostile links are refused with a plain sentence", async () => {
  await assert.rejects(() => decodeTeammate("2.abc"), /doesn't look like a Sidemates teammate link/);
  await assert.rejects(() => decodeTeammate("1.!!!"), /doesn't look like/);
  await assert.rejects(() => decodeTeammate("1.AAAA"), /damaged/);
  // A small link that would expand to far more than the limit.
  const bomb = deflateRawSync(Buffer.alloc(MAX_BUNDLE_BYTES * 20, "a")).toString("base64url");
  assert.ok(bomb.length < 10_000);
  await assert.rejects(() => decodeTeammate(`1.${bomb}`), /too large/);
  await assert.rejects(() => encodeTeammate({ big: "x".repeat(MAX_BUNDLE_BYTES + 1) }), /too large to share as a link/);
});
