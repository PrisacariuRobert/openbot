// Original fictional demo data. This helper is not OpenBot's production tool runner.
export const receipts = [
  { file: "design.csv", category: "Design", amount: "€ 1.240,00" },
  { file: "production.csv", category: "Production", amount: "420,00" },
  { file: "hosting.csv", category: "Hosting", amount: "89.50" },
];

export const parseFirstDraft = (input: string) => {
  const value = Number(input.replace(/[€\s]/g, ""));
  if (!Number.isFinite(value)) throw new Error("Unsupported amount");
  return value;
};

// Deliberately bounded: the sample's EUR amounts, with decimal comma or decimal dot.
export const parseExpense = (input: string) => {
  const clean = input.replace(/[€\s]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error("Unsupported amount");
  return Number(normalized);
};

export const expenseRows = receipts.map((receipt) => ({
  ...receipt,
  value: parseExpense(receipt.amount),
}));
export const expenseTotal = expenseRows.reduce(
  (total, row) => total + row.value,
  0,
);
export const formatEuro = (value: number) =>
  `€${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fixtureTests = [
  { label: "European thousands", input: "€ 1.240,00", expected: 1240 },
  { label: "Decimal comma", input: "420,00", expected: 420 },
  { label: "Decimal point", input: "89.50", expected: 89.5 },
  { label: "Reject invalid input", input: "not an amount", expected: null },
];
export function checkParser(parser: (input: string) => number) {
  return fixtureTests.map((test) => {
    try {
      return { ...test, passed: parser(test.input) === test.expected };
    } catch {
      return { ...test, passed: test.expected === null };
    }
  });
}
