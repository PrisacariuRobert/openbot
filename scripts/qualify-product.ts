import { readFileSync } from "node:fs";
import { scoreQualification, type Attempt, type Campaign, type IndependentOracle, type ProductCatalog } from "../verification/product-qualification.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run qualify:product -- <campaign-results.json>");
  process.exit(2);
}
const catalog = JSON.parse(readFileSync(new URL("../verification/product-cases.json", import.meta.url), "utf8")) as ProductCatalog;
const evidence = JSON.parse(readFileSync(input, "utf8")) as { campaign: Campaign; attempts: Attempt[]; independentOracles: IndependentOracle[] };
const report = scoreQualification(catalog, evidence.campaign, evidence.attempts, evidence.independentOracles);
console.log(JSON.stringify(report, null, 2));
if (!report.fullSuiteQualified) process.exitCode = 1;
