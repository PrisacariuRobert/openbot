import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { summarizeTable } from "./table-summary.js";

function summary(csv: string, args: Record<string, unknown> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-table-summary-"));
  try {
    writeFileSync(path.join(root, "source.csv"), csv);
    return summarizeTable(root, { csvPath: "source.csv", sumColumns: ["amount"], ...args });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("table sums are exact decimals, grouped by currency, with explicit exclusions and source hashes", () => {
  const result = summary("currency,amount,status\nEUR,0.10,paid\nEUR,0.20,paid\nEUR,-0.05,refund\nUSD,20.15,paid\nEUR,999,cancelled\n", { groupBy: ["currency"], filters: [{ column: "status", operator: "not_equals", value: "cancelled" }] });
  assert.deepEqual(result.groups, [{ key: { currency: "EUR" }, rows: 3, sums: { amount: "0.25" } }, { key: { currency: "USD" }, rows: 1, sums: { amount: "20.15" } }]);
  assert.equal(result.matchedRows, 4); assert.equal(result.excludedRows, 1);
  assert.equal(result.source.dataRows, 5); assert.match(result.source.sha256, /^[0-9a-f]{64}$/);
});

test("table sums preserve high precision, signed zeros, and an explicitly empty selection", () => {
  assert.equal(summary("amount\n99999999999999999.99\n0.01\n").groups[0].sums.amount, "100000000000000000.00");
  assert.equal(summary("amount\n-0.00\n0.0\n").groups[0].sums.amount, "0.00");
  const result = summary("amount,status\n1,paid\n", { filters: [{ column: "status", operator: "equals", value: "pending" }] });
  assert.equal(result.matchedRows, 0); assert.deepEqual(result.groups, []);
});

test("table summary refuses malformed or ambiguous data rather than inventing totals", () => {
  for (const value of ["", "1 EUR", "=SUM(A1)", "1e3", "001", " 2"]) assert.throws(() => summary(`id,amount\nx,${value}\n`), /unformatted decimal/);
  assert.throws(() => summary("id,amount\nx,1,extra\n"), /different number/);
  assert.throws(() => summary("amount,amount\n1,2\n"), /unique/);
  assert.throws(() => summary("amount\n1\n", { groupBy: ["currency"] }), /not found/);
  assert.throws(() => summary("amount\n1\n", { sumColumns: ["amount", "amount"] }), /only once/);
  assert.throws(() => summary("amount,currency\n" + Array.from({ length: 201 }, (_, i) => `1,g${i}`).join("\n"), { groupBy: ["currency"] }), /200 groups/);
});

test("source content cannot become object prototype keys or computation instructions", () => {
  const result = summary("__proto__,amount\nconstructor,2.00\n", { groupBy: ["__proto__"] });
  assert.equal(Object.getPrototypeOf(result.groups[0].key), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(result.groups[0].key, "__proto__")?.value, "constructor");
  assert.equal(result.groups[0].sums.amount, "2.00");
});
