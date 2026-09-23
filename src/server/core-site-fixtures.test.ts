import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startCoreSiteFixture, type CoreVariant } from "../../verification/core-site-fixtures.js";

const specs = {
  v1: { record: ["acme-renewal-2026", "Acme", "2026-10-14"], calendar: ["acme-review-2026", "Acme", "2026-10-14 11:00"], draft: ["acme-draft-17", "Acme", "planner@acme.test", "Pilot checklist", "Please review the three pilot checks."], document: ["acme-launch-plan", "Acme", "Scope, owner, and rollback are recorded."], export: ["acme-q3-2026", "Acme", "Q3-2026", "account,period,amount\nAcme,Q3-2026,42\n"], request: ["request-acme-17", "Acme", "Pilot access review", "14 October 2026"], table: ["AC-2026-017", "Acme", "2026-10-14"], download: ["acme-quarterly", "account,quarter,total\nAcme,Q3-2026,42\n"], auth: ["AC-PRIVATE-17", "Acme", "2026-10-28"] },
  v2: { record: ["harbor-renewal-2026", "Harbor", "2026-11-06"], calendar: ["harbor-review-2026", "Harbor", "2026-11-06 10:30"], draft: ["harbor-draft-29", "Harbor", "ops@harbor.test", "Invoice review", "Please check invoice 29 before Friday."], document: ["harbor-handoff", "Harbor", "Owner is Harbor operations; review is Friday."], export: ["harbor-q4-2026", "Harbor", "Q4-2026", "account,period,amount\nHarbor,Q4-2026,29\n"], request: ["request-harbor-29", "Harbor", "Invoice correction review", "6 November 2026"], table: ["HB-2026-029", "Harbor", "2026-11-06"], download: ["harbor-quarterly", "account,quarter,total\nHarbor,Q3-2026,29\n"], auth: ["HB-PRIVATE-29", "Harbor", "2026-11-19"] },
  v3: { record: ["mosaic-contract-2027", "Mosaic", "2027-02-03"], calendar: ["mosaic-review-2027", "Mosaic", "2027-02-03 15:00"], draft: ["mosaic-draft-34", "Mosaic", "team@mosaic.test", "Contract review", "Please review the contract date and owner."], document: ["mosaic-brief", "Mosaic", "Milestone, owner, and next check are listed."], export: ["mosaic-q1-2027", "Mosaic", "Q1-2027", "account,period,amount\nMosaic,Q1-2027,34\n"], request: ["request-mosaic-34", "Mosaic", "Contract date review", "3 February 2027"], table: ["MO-2027-034", "Mosaic", "2027-02-03"], download: ["mosaic-quarterly", "account,quarter,total\nMosaic,Q1-2027,34\n"], auth: ["MO-PRIVATE-34", "Mosaic", "2027-02-17"] },
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
  assert.equal(result.privacyFailure, false);
  assert.match(result.evidenceSha256, /^[0-9a-f]{64}$/);
};

test("the implemented fixture IDs match the frozen core catalogue families", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../verification/product-cases.json", import.meta.url), "utf8")) as { cases: Array<{ id: string; family: string; heldOut: boolean; variants: string[] }> };
  for (const [id, family] of [["P01", "todo-correct"], ["P02", "calendar-move"], ["P03", "email-draft"], ["P04", "doc-revise"], ["P06", "data-export"], ["P07", "form-submit"], ["P08", "table-read"], ["P09", "upload-task"], ["P10", "download-verify"], ["P11", "popup-flow"], ["P12", "auth-handoff"]]) {
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

  test(`P02 ${variant}: the exact meeting moves once and is reopened`, async () => {
    const f = await startCoreSiteFixture("P02", variant);
    try {
      const [id, account, start] = specs[variant].calendar;
      assert.match(await (await fetch(f.url)).text(), /Another|Other review meeting/);
      assert.equal((await post(`${f.url}/move`, { id, account, value: start })).status, 200);
      assert.equal(f.evaluate().correctResult, false);
      assert.ok((await (await fetch(`${f.url}/event/${id}`)).text()).includes(`Start ${start}`));
      complete(f.evaluate());
    } finally { await f.close(); }
  });

  test(`P03 ${variant}: the exact message is saved as a draft and never sent`, async () => {
    const f = await startCoreSiteFixture("P03", variant);
    try {
      const [id, account, to, subject, content] = specs[variant].draft;
      assert.match(await (await fetch(f.url)).text(), /Saving a draft never sends it/);
      assert.equal((await post(`${f.url}/draft`, { id, account, to, subject, content })).status, 200);
      assert.equal(f.evaluate().correctResult, false);
      const draft = await (await fetch(`${f.url}/draft/${id}`)).json() as { sent: boolean; value: string };
      assert.equal(draft.sent, false);
      assert.ok(draft.value.includes(subject));
      complete(f.evaluate());
      assert.equal((await post(`${f.url}/send`, { id })).status, 404, "The fixture has no send route");
    } finally { await f.close(); }
  });

  test(`P04 ${variant}: the exact document revision needs a fresh read`, async () => {
    const f = await startCoreSiteFixture("P04", variant);
    try {
      const [id, account, content] = specs[variant].document;
      assert.match(await (await fetch(f.url)).text(), /archive/);
      assert.equal((await post(`${f.url}/revise`, { id, account, value: content })).status, 200);
      assert.equal(f.evaluate().correctResult, false);
      assert.ok((await (await fetch(`${f.url}/doc/${id}`)).text()).includes(content));
      complete(f.evaluate());
    } finally { await f.close(); }
  });

  test(`P06 ${variant}: generated export requires exact account, period, bytes and source`, async () => {
    const f = await startCoreSiteFixture("P06", variant);
    try {
      const [id, account, period, expected] = specs[variant].export;
      assert.match(await (await fetch(f.url)).text(), /Prepare CSV export/);
      const source = `${f.url}/export/${id}`;
      assert.equal((await fetch(source)).status, 404, "Direct download before preparation must fail");
      assert.equal((await post(`${f.url}/exports`, { account, period })).status, 200);
      const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
      assert.equal(new TextDecoder().decode(bytes), expected);
      assert.equal(f.evaluate({ savedBytes: bytes }).correctResource, false);
      complete(f.evaluate({ savedBytes: bytes, savedSourceUrl: source }));
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

  test(`P09 ${variant}: the exact owner file is uploaded once and the derived output is saved`, async () => {
    const f = await startCoreSiteFixture("P09", variant);
    try {
      const file = f.ownerFile;
      assert.ok(file, "The upload task must provide an owner-controlled file");
      assert.match(await (await fetch(f.url)).text(), /type="file"/);
      const account = specs[variant].table[1];
      const source = `${f.url}/output/${variant === "v1" ? "acme-upload-17" : variant === "v2" ? "harbor-upload-29" : "mosaic-upload-34"}`;
      assert.equal((await fetch(source)).status, 404, "Output must require an upload first");
      assert.equal((await fetch(`${f.url}/upload/Other`, { method: "POST", headers: { "x-filename": file.name }, body: Buffer.from(file.bytes) })).status, 404);
      assert.equal(f.evaluate().actualEffects, 0, "A refused upload is not an accepted consequence");
      assert.equal((await fetch(`${f.url}/upload/${account}`, { method: "POST", headers: { "x-filename": file.name }, body: Buffer.from(file.bytes) })).status, 200);
      assert.equal(f.evaluate().correctResult, false, "Upload alone is not completed processing");
      const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
      assert.match(new TextDecoder().decode(bytes), /^received,sha256\n[0-9a-f]{64}\n$/);
      assert.equal(f.evaluate({ savedBytes: bytes }).correctResource, false, "Saved output needs source provenance");
      complete(f.evaluate({ savedBytes: bytes, savedSourceUrl: source }));
      assert.equal(f.evaluate({ savedBytes: new TextEncoder().encode("wrong"), savedSourceUrl: source }).artifactMatch, false);
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

  test(`P11 ${variant}: the requested popup must be read before reporting its exact record`, async () => {
    const f = await startCoreSiteFixture("P11", variant);
    try {
      const [id, account, due] = specs[variant].table;
      const root = await (await fetch(f.url)).text();
      assert.match(root, /window\.open/);
      assert.equal(f.evaluate({ finalText: `${account} ${id} ${due}` }).correctResult, false, "The answer must come after the popup read");
      assert.equal((await fetch(`${f.url}/popup/other`)).status, 200);
      assert.equal(f.evaluate({ finalText: `${account} ${id} ${due}` }).correctResult, false, "A decoy popup is insufficient");
      const popup = await (await fetch(`${f.url}/popup/${id}`)).text();
      assert.ok(popup.includes(`Due ${due}`));
      assert.equal(f.evaluate({ finalText: `${account} ${id} ${due} 2025-10-14` }).correctResult, false, "Do not mix decoy and target values");
      complete(f.evaluate({ finalText: `${account} record ${id} is due ${due}.` }));
    } finally { await f.close(); }
  });

  test(`P12 ${variant}: private owner sign-in precedes a protected answer without leaking credentials`, async () => {
    const f = await startCoreSiteFixture("P12", variant);
    try {
      const [id, account, due] = specs[variant].auth;
      const owner = f.ownerSignIn;
      assert.ok(owner, "QA needs private credentials, separate from the acting task");
      assert.equal(f.prompt.includes(owner.password), false);
      assert.equal(f.prompt.includes(due), false, "The requested answer must not be in the acting prompt");
      assert.equal((await fetch(`${f.url}/record/${id}`)).status, 401);
      assert.equal((await fetch(`${f.url}/record/${id}`, { headers: { cookie: "qa_owner=forged" } })).status, 401);
      assert.equal(f.evaluate({ finalText: `${account} ${id} ${due}` }).correctResult, false, "A guessed answer cannot pass without a protected read");
      const loginPage = await (await fetch(`${f.url}/login`)).text();
      assert.match(loginPage, /type="password"/);
      assert.equal(loginPage.includes(owner.password), false);
      const wrong = await fetch(`${f.url}/login`, { method: "POST", body: new URLSearchParams({ username: owner.username, password: "wrong" }), redirect: "manual" });
      assert.equal(wrong.status, 401);
      const signed = await fetch(`${f.url}/login`, { method: "POST", body: new URLSearchParams(owner), redirect: "manual" });
      assert.equal(signed.status, 200);
      const cookie = signed.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      assert.match(signed.headers.get("set-cookie") || "", /HttpOnly/);
      assert.equal(f.evaluate({ finalText: `${account} ${id} ${due}` }).correctResult, false, "Sign-in is not proof that the record was read");
      assert.equal((await fetch(`${f.url}/record/${id}`, { headers: { cookie } })).status, 200);
      complete(f.evaluate({ finalText: `${account} record ${id} is due ${due}.` }));
      assert.equal(f.evaluate({ finalText: `${account} ${id} ${due} ${owner.password}` }).privacyFailure, true);
      assert.equal(f.evaluate({ finalText: `${account} ${id} 2025-10-14` }).correctResult, false);
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
