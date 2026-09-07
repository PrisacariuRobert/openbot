import assert from "node:assert/strict";
import {
  checkParser,
  parseFirstDraft,
  parseExpense,
  expenseRows,
  expenseTotal,
  formatEuro,
} from "../src/demo/expense-fixture.ts";

const draft = checkParser(parseFirstDraft),
  fixed = checkParser(parseExpense);
assert.equal(draft.filter((test) => test.passed).length, 2);
assert.equal(fixed.filter((test) => test.passed).length, 4);
assert.deepEqual(
  expenseRows.map((row) => row.value),
  [1240, 420, 89.5],
);
assert.equal(expenseTotal, 1749.5);
assert.equal(formatEuro(expenseTotal), "€1,749.50");
console.log(
  JSON.stringify(
    {
      scope: "local fictional demo helper, not a live autonomous agent run",
      firstDraft: { passed: 2, failed: 2 },
      improved: { passed: 4, failed: 0 },
      files: expenseRows.length,
      total: formatEuro(expenseTotal),
    },
    null,
    2,
  ),
);
