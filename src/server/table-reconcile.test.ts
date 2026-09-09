import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { reconcileTables } from "./table-reconcile.js";

const input = { leftPath: "ledger.csv", rightPath: "receipts.csv", leftKey: "receipt", rightKey: "receipt", compare: [{ left: "amount", right: "amount", as: "decimal" }, { left: "currency", right: "currency", as: "text" }] };
function fixture(work: (root: string) => void) { const root = mkdtempSync(path.join(tmpdir(), "openbot-reconcile-")); try { work(root); } finally { rmSync(root, { recursive: true, force: true }); } }
test("reconciles exact decimals and currency separately without changing either source", () => fixture(root => {
  const ledger = "receipt,amount,currency\n001,12.50,EUR\n002,10,EUR\n003,-0.00,USD\n004,1.000000000000000001,EUR\n";
  writeFileSync(path.join(root, "ledger.csv"), ledger);
  writeFileSync(path.join(root, "receipts.csv"), "receipt,amount,currency\n001,12.5,EUR\n002,10,USD\n003,0,USD\n004,1.000000000000000002,EUR\n");
  const result = reconcileTables(root, input);
  assert.deepEqual(result.records.map(r => r.status), ["matched", "mismatch", "matched", "mismatch"]);
  assert.equal(result.records[0]!.key, "001"); assert.equal(result.records[1]!.differences![0]!.leftColumn, "currency");
  assert.equal(result.records[3]!.differences![0]!.leftValue, "1.000000000000000001");
  assert.equal(result.sources.left.sha256.length, 64); assert.equal(readFileSync(path.join(root, "ledger.csv"), "utf8"), ledger);
}));
test("reports missing, duplicate, empty, excluded and unmatched records without many-to-many guesses", () => fixture(root => {
  writeFileSync(path.join(root, "ledger.csv"), "receipt,status\nA,paid\nB,paid\nB,paid\nC,paid\n,paid\nZ,cancelled\n__proto__,paid\n A,paid\n");
  writeFileSync(path.join(root, "receipts.csv"), "receipt\nA\nA\nB\nD\n\n__proto__\n");
  const r = reconcileTables(root, { ...input, compare: [], leftFilters: [{ column: "status", operator: "not_equals", value: "cancelled" }] });
  assert.deepEqual(r.counts, { matched: 1, mismatched: 0, missing: 2, ambiguous: 3, emptyKeys: 1, excluded: 1 });
  assert.deepEqual(r.duplicateKeys.map(d => d.key), ["A", "B"]); assert.deepEqual(r.excludedRows, [7]);
  assert.deepEqual(r.unmatchedRightRows, [5]); assert.deepEqual(r.emptyRightRows, [6]);
  assert.equal(r.records.find(row => row.key === "__proto__")!.status, "matched");
}));
test("refuses malformed, hidden, symlinked, oversized and ambiguous numeric sources", () => fixture(root => {
  writeFileSync(path.join(root, "receipts.csv"), "receipt,amount,currency\nA,12,EUR\n");
  for (const content of ["receipt,receipt\nA,A\n", "receipt,amount,currency\nA,12\n", "receipt,amount,currency\nA,12 EUR,EUR\n", "receipt,amount,currency\nA,1e2,EUR\n", "receipt,amount,currency\nA,012,EUR\n", "receipt,amount,currency\n" + "A,12,EUR\n".repeat(1001)]) {
    writeFileSync(path.join(root, "ledger.csv"), content); assert.throws(() => reconcileTables(root, input));
  }
  writeFileSync(path.join(root, "ledger.csv"), "receipt,amount,currency\nA,12,EUR\n");
  for (const leftPath of ["../outside.csv", ".hidden.csv", "/tmp/outside.csv"]) assert.throws(() => reconcileTables(root, { ...input, leftPath }));
  symlinkSync(path.join(root, "ledger.csv"), path.join(root, "linked.csv"));
  assert.throws(() => reconcileTables(root, { ...input, leftPath: "linked.csv" }));
  assert.throws(() => reconcileTables(root, { ...input, rightPath: "ledger.csv" }));
}));
