import test from "node:test";
import assert from "node:assert/strict";
import { appleMarketingVersion } from "./lib/release-version.mjs";
import { includesStringLiteral, includesText } from "./lib/source-contract.mjs";

test("native versions retain the release number without invalid beta or build suffixes", () => {
  for (const version of ["0.37.0", "0.37.0-beta.1", "0.37.0-rc.2+build.43", "0.37.0+build.43"]) {
    assert.equal(appleMarketingVersion(version), "0.37.0");
  }
  assert.equal(appleMarketingVersion("1.2.34-beta.1"), "1.2.34");
});

test("invalid release versions fail instead of silently guessing a native version", () => {
  for (const version of [undefined, 37, "0.37", "v0.37.0", "0.37.0broken", "0.37.0-", "0.37.0\n", "01.2.3", "0.37.0;echo bad"]) {
    assert.throws(() => appleMarketingVersion(version), /semantic release version/);
  }
});

test("release source contracts accept equivalent JavaScript string quotes", () => {
  const route = "/api/approved-actions/:id/resolve";
  assert.equal(includesStringLiteral(`app.post("${route}", handler)`, route), true);
  assert.equal(includesStringLiteral(`app.post('${route}', handler)`, route), true);
  assert.equal(includesStringLiteral(`app.post(\`${route}\`, handler)`, route), true);
  assert.equal(includesStringLiteral('app.post("/api/approved-actions/:id/cancel", handler)', route), false);
});

test("release source contracts do not fail on presentation-only text casing", () => {
  assert.equal(includesText("Approved action history", "Action history"), true);
  assert.equal(includesText("Approved action receipts", "Action history"), false);
});
