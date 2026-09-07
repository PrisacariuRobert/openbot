import assert from "node:assert/strict";
import test from "node:test";
import { relayRoute, secureStudioBase } from "./relay-address.js";

const id = "a".repeat(24), base = `https://pilot.onrender.com/s/${id}`;
test("hosted studio addresses preserve a strict path, never normalize aliases", () => {
  assert.equal(secureStudioBase(base), base);
  assert.equal(secureStudioBase(`${base}/`), base);
  assert.equal(secureStudioBase("https://private.example.com/"), "https://private.example.com");
  for (const raw of [base + "/../", base + "/%2e%2e", base + "/extra", base + "?token=x", base + "#x", base.replace("/s/", "/%73/"), base.replace(id, "short"), "https://user:secret@pilot.onrender.com", "http://pilot.onrender.com", "https://pilot.onrender.com/./"]) assert.equal(secureStudioBase(raw), null, raw);
});

test("relay paths are native API only; queries survive without cross-studio normalization", () => {
  assert.deepEqual(relayRoute(`/s/${id}/api/messages?q=hello%20world&url=https%3A%2F%2Fexample.com`), {
    studio: id, path: "/api/messages?q=hello%20world&url=https%3A%2F%2Fexample.com",
  });
  for (const path of ["/", "/api/state", `/s/${id}`, `/s/${id}/index.html`, `/s/${id}/api/../../s/${"b".repeat(24)}/api/state`, `/s/${id}/api/%2e%2e/state`, `/s/${id}/api/%252e%252e/state`, `/s/${id}/api//state`, `/s/${id}/api/foo%2fstate`, `/s/${id}/api/foo\\state`, `/s/${id}/api/state#foo`, `/s/${id}/api/state\n`, `//s/${id}/api/state`]) assert.equal(relayRoute(path), null, path);
});
