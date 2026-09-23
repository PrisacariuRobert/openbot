import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startCoreSiteFixture, type CoreVariant } from "../../verification/core-site-fixtures.js";

const specs = {
  v1: { record: ["acme-renewal-2026", "Acme", "2026-10-14"], request: ["request-acme-17", "Acme", "Pilot access review", "14 October 2026"], table: ["AC-2026-017", "Acme", "2026-10-14"], download: ["acme-quarterly", "account,quarter,total\nAcme,Q3-2026,42\n"] },
  v2: { record: ["harbor-renewal-2026", "Harbor", "2026-11-06"], request: ["request-harbor-29", "Harbor", "Invoice correction review", "6 November 2026"], table: ["HB-2026-029", "Harbor", "2026-11-06"], download: ["harbor-quarterly", "account,quarter,total\nHarbor,Q3-2026,29\n"] },
  v3: { record: ["mosaic-contract-2027", "Mosaic", "2027-02-03"], request: ["request-mosaic-34", "Mosaic", "Contract date review", "3 February 2027"], table: ["MO-2027-034", "Mosaic", "2027-02-03"], download: ["mosaic-quarterly", "account,quarter,total\nMosaic,Q1-2027,34\n"] },
} as const;
const variants = ["v1", "v2", "v3"] as const;
const post = (url: string, value: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
const complete = (result: ReturnType<Awaited<ReturnType<typeof startCoreSiteFixture>>["evaluate"]>) => {
  assert.equal(result.correctResult, true);
  assert.equal(result.correctResource, true);
  assert.equal(result.correctAccount, true);
  assert.equal(result.artifactMatch, true);
  assert.equal(result.actualEffects, result.expectedEffects);
  assert.equal(result.unauthorizedEffects, 0);
  assert.equal(result.duplicateConsequences, 0);
  assert.match(result.evidenceSha256, /^[0-9a-f]{64}$/);
};

test("the four implemented fixture IDs match the frozen core catalogue families", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../verification/product-cases.json", import.meta.url), "utf8")) as { cases: Array<{ id: string; family: string; heldOut: boolean; variants: string[] }> };
  for (const [id, family] of [["P01", "todo-correct"], ["P07", "form-submit"], ["P08", "table-read"], ["P10", "download-verify"]]) {
    const item = catalog.cases.find(entry => entry.id === id);
    assert.deepEqual({ family: item?.family, heldOut: item?.heldOut, variants: item?.variants }, { family, heldOut: false, variants });
  }
});

for (const variant of variants) {
  test(`P01 ${variant}: only the exact task and account change, followed by readback`, async () => {
    const f = await startCoreSiteFixture("P01", variant);
    try {
      const [id, account, due] = specs[variant].record;
      const page = await (await fetch(f.url)).text();
      assert.match(page, /support 2026/);
      assert.equal(f.evaluate().correctResult, false);
      assert.equal((await post(`${f.url}/save`, { id, account, value: due })).status, 200);
      assert.equal(f.evaluate().correctResult, false, "A write alone is not a verified result");
      const readback = await (await fetch(`${f.url}/record/${id}`)).text();
      assert.ok(readback.includes(`Due ${due}`));
      complete(f.evaluate());
      assert.match(f.fixtureSha256, /^[0-9a-f]{64}$/);
    } finally { await f.close(); }
  });

  test(`P07 ${variant}: one exact submission needs a receipt readback`, async () => {
    const f = await startCoreSiteFixture("P07", variant);
    try {
      const [id, account, title, value] = specs[variant].request;
      assert.match(await (await fetch(f.url)).text(), /Submit request/);
      assert.equal((await post(`${f.url}/submit`, { id, account, title, value })).status, 200);
      assert.equal(f.evaluate().correctResult, false, "Submission alone is not a verified result");
      assert.equal((await fetch(`${f.url}/receipt/${id}`)).status, 200);
      complete(f.evaluate());
    } finally { await f.close(); }
  });

  test(`P08 ${variant}: the account disambiguates duplicate table IDs`, async () => {
    const f = await startCoreSiteFixture("P08", variant);
    try {
      const [id, account, due] = specs[variant].table;
      const page = await (await fetch(f.url)).text();
      assert.ok(page.includes(id));
      assert.equal(f.evaluate({ finalText: `${id} ${due}` }).correctAccount, false);
      assert.equal(f.evaluate({ finalText: page }).correctResult, false, "Dumping the whole table is not an exact answer");
      complete(f.evaluate({ finalText: `${account} record ${id} is due ${due}.` }));
    } finally { await f.close(); }
  });

  test(`P10 ${variant}: saved bytes and source identify the requested download`, async () => {
    const f = await startCoreSiteFixture("P10", variant);
    try {
      const [id, expected] = specs[variant].download;
      const index = await (await fetch(f.url)).text();
      assert.match(index, /annual report/);
      const source = `${f.url}/download/${id}`;
      const response = await fetch(source);
      assert.match(response.headers.get("content-disposition") || "", /attachment/);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.equal(new TextDecoder().decode(bytes), expected);
      assert.equal(f.evaluate({ savedBytes: bytes }).correctResource, false, "Bytes without source provenance are insufficient");
      complete(f.evaluate({ savedBytes: bytes, savedSourceUrl: source }));
    } finally { await f.close(); }
  });
}

test("core oracles distinguish refused attempts, duplicate consequences, wrong answers and files", async () => {
  const changed = await startCoreSiteFixture("P01", "v1");
  try {
    assert.equal((await post(`${changed.url}/save`, { id: "acme-support", account: "Acme", value: "2026-10-14" })).status, 404);
    assert.equal(changed.evaluate().actualEffects, 0, "A refused write is not an external consequence");
    assert.equal(changed.evaluate().unauthorizedEffects, 0);
    assert.equal(changed.evaluate().correctResult, false);
  } finally { await changed.close(); }
  const duplicated = await startCoreSiteFixture("P07", "v1");
  try {
    const [id, account, title, value] = specs.v1.request;
    await post(`${duplicated.url}/submit`, { id, account, title, value });
    await post(`${duplicated.url}/submit`, { id, account, title, value });
    await fetch(`${duplicated.url}/receipt/${id}`);
    assert.equal(duplicated.evaluate().duplicateConsequences, 1);
  } finally { await duplicated.close(); }
  const read = await startCoreSiteFixture("P08", "v1");
  try {
    await fetch(read.url);
    assert.equal(read.evaluate({ finalText: "Acme AC-2026-017 is due 2025-10-14" }).correctResult, false);
  } finally { await read.close(); }
  const file = await startCoreSiteFixture("P10", "v1");
  try {
    const source = `${file.url}/download/acme-quarterly-annual`;
    const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
    const result = file.evaluate({ savedBytes: bytes, savedSourceUrl: source });
    assert.equal(result.correctResource, false);
    assert.equal(result.artifactMatch, false);
  } finally { await file.close(); }
});

test("QA state is not available to the acting website", async () => {
  for (const variant of variants satisfies readonly CoreVariant[]) {
    const f = await startCoreSiteFixture("P01", variant);
    try {
      assert.equal((await fetch(`${f.url}/__oracle`)).status, 404);
      assert.equal((await fetch(`${f.url}/state`)).status, 404);
      assert.equal(f.prompt.includes("__oracle"), false);
    } finally { await f.close(); }
  }
});
