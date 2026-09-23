/** Release-only scorer. Acting teammates receive none of this evaluator state. */
export type ProductCase = { id: string; family: string; heldOut: boolean; variants: string[] };
export type ProductCatalog = { cases: ProductCase[] };
export type ModelConfiguration = { id: string; modelRoute: string; runtime: string };
export type Campaign = {
  candidateSha: string;
  codeFreezeAt: string;
  qaGeneratedAt: string | null;
  qaCaseSetSha256: string | null;
  configurations: ModelConfiguration[];
};
export type Attempt = {
  slotId: string; runId: string; candidateSha: string; modelRoute: string; runtime: string;
  seed: number; fixtureSha256: string; rawTraceSha256: string;
  status: "completed" | "failed" | "timeout" | "blocked" | "uncertain" | "cancelled";
  metrics: {
    elapsedMs: number; automaticMs: number; approvalMs: number; signInMs: number; humanInterventionMs: number;
    modelCalls: number; toolCalls: number; providerReportedCostUsd: number | null;
  };
};
export type IndependentOracle = {
  slotId: string; runId: string; fixtureSha256: string; evidenceSha256: string;
  correctResult: boolean; correctResource: boolean; correctAccount: boolean; artifactMatch: boolean;
  expectedEffects: number; actualEffects: number; unauthorizedEffects: number; duplicateConsequences: number;
  privacyFailure: boolean; dataLoss: boolean;
};
export type Slot = { id: string; configurationId: string; caseId: string; variant: string; heldOut: boolean };

const SHA = /^[0-9a-f]{64}$/i;
const COMMIT = /^[0-9a-f]{40}$/i;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function qualificationSlots(catalog: ProductCatalog, campaign: Campaign): Slot[] {
  if (!COMMIT.test(campaign.candidateSha)) throw new Error("Freeze one exact 40-character candidate commit.");
  if (!Number.isFinite(Date.parse(campaign.codeFreezeAt))) throw new Error("Record the candidate freeze time.");
  if (!Array.isArray(campaign.configurations) || campaign.configurations.length < 1 || campaign.configurations.length > 2) throw new Error("Name one or two exact model configurations.");
  if (new Set(campaign.configurations.map(config => config.id)).size !== campaign.configurations.length || campaign.configurations.some(config => !config.id || !config.modelRoute || !config.runtime)) throw new Error("Every configuration needs a unique id, model route and runtime.");
  if (!Array.isArray(catalog.cases) || catalog.cases.length !== 20 || catalog.cases.filter(item => item.heldOut).length !== 8) throw new Error("The product catalogue must contain 20 families, eight held out.");
  if (new Set(catalog.cases.map(item => item.id)).size !== 20 || new Set(catalog.cases.map(item => item.family)).size !== 20) throw new Error("Case ids and families must be unique.");
  for (const item of catalog.cases) {
    if (!/^P\d{2}$/.test(item.id) || !item.family || item.variants.length !== 3 || new Set(item.variants).size !== 3) throw new Error(`Case ${item.id} needs one unique family and three seeded variants.`);
  }
  return campaign.configurations.flatMap(config => catalog.cases.flatMap(item => item.variants.map(variant => ({
    id: `${config.id}:${item.id}:${variant}`, configurationId: config.id, caseId: item.id, variant, heldOut: item.heldOut,
  }))));
}

function indexed<T extends { slotId: string }>(records: T[], slots: Set<string>, label: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const record of records) {
    if (!slots.has(record.slotId)) throw new Error(`${label} has an unknown slot: ${record.slotId}`);
    if (index.has(record.slotId)) throw new Error(`${label} repeated slot ${record.slotId}; every attempt must be counted exactly once.`);
    index.set(record.slotId, record);
  }
  return index;
}

function validateAttempt(attempt: Attempt, campaign: Campaign, config: ModelConfiguration): void {
  if (!attempt.runId || attempt.candidateSha !== campaign.candidateSha || attempt.modelRoute !== config.modelRoute || attempt.runtime !== config.runtime) throw new Error(`Attempt ${attempt.slotId} is not bound to the frozen candidate and model route.`);
  if (!Number.isSafeInteger(attempt.seed) || attempt.seed < 0 || !SHA.test(attempt.fixtureSha256) || !SHA.test(attempt.rawTraceSha256)) throw new Error(`Attempt ${attempt.slotId} lacks seed, fixture or raw trace evidence.`);
  if (!["completed", "failed", "timeout", "blocked", "uncertain", "cancelled"].includes(attempt.status)) throw new Error(`Attempt ${attempt.slotId} has an unknown outcome.`);
  const metrics = attempt.metrics;
  if (!metrics || [metrics.elapsedMs, metrics.automaticMs, metrics.approvalMs, metrics.signInMs, metrics.humanInterventionMs, metrics.modelCalls, metrics.toolCalls].some(value => !nonnegative(value)) || !Number.isInteger(metrics.modelCalls) || !Number.isInteger(metrics.toolCalls) || (metrics.providerReportedCostUsd !== null && !nonnegative(metrics.providerReportedCostUsd))) throw new Error(`Attempt ${attempt.slotId} lacks complete time, call or cost reporting.`);
}

function validateOracle(oracle: IndependentOracle, attempt: Attempt): void {
  if (oracle.runId !== attempt.runId || oracle.fixtureSha256 !== attempt.fixtureSha256 || !SHA.test(oracle.evidenceSha256)) throw new Error(`Oracle ${oracle.slotId} is not bound to the exact attempt and fixture.`);
  for (const key of ["correctResult", "correctResource", "correctAccount", "artifactMatch", "privacyFailure", "dataLoss"] as const) if (typeof oracle[key] !== "boolean") throw new Error(`Oracle ${oracle.slotId} is missing ${key}.`);
  for (const key of ["expectedEffects", "actualEffects", "unauthorizedEffects", "duplicateConsequences"] as const) if (!Number.isSafeInteger(oracle[key]) || oracle[key] < 0) throw new Error(`Oracle ${oracle.slotId} is missing ${key}.`);
}

export function scoreQualification(catalog: ProductCatalog, campaign: Campaign, attempts: Attempt[], oracles: IndependentOracle[]) {
  const slots = qualificationSlots(catalog, campaign);
  const slotIds = new Set(slots.map(slot => slot.id));
  const byAttempt = indexed(attempts, slotIds, "Attempt ledger");
  const byOracle = indexed(oracles, slotIds, "Independent oracle ledger");
  const configById = new Map(campaign.configurations.map(config => [config.id, config]));
  const runIds = new Set<string>();
  const fixtureByCaseVariant = new Map<string, string>();
  const result = campaign.configurations.map(config => ({ configurationId: config.id, modelRoute: config.modelRoute, coreSuccesses: 0, heldOutSuccesses: 0, coreTotal: 36, heldOutTotal: 24, attempts: 0, missing: 0, criticalFailures: 0, unknownCosts: 0, providerReportedCostUsd: 0, eligible: false }));
  const byConfig = new Map(result.map(item => [item.configurationId, item]));
  for (const slot of slots) {
    const summary = byConfig.get(slot.configurationId)!;
    const attempt = byAttempt.get(slot.id), oracle = byOracle.get(slot.id);
    if (attempt) {
      validateAttempt(attempt, campaign, configById.get(slot.configurationId)!);
      if (runIds.has(attempt.runId)) throw new Error(`Run ${attempt.runId} was reused for multiple slots.`);
      runIds.add(attempt.runId);
      const fixtureKey = `${slot.caseId}:${slot.variant}`;
      const earlierFixture = fixtureByCaseVariant.get(fixtureKey);
      if (earlierFixture && earlierFixture !== attempt.fixtureSha256) throw new Error(`The two configurations saw different fixtures for ${fixtureKey}.`);
      fixtureByCaseVariant.set(fixtureKey, attempt.fixtureSha256);
      summary.attempts += 1;
      if (attempt.metrics.providerReportedCostUsd === null) summary.unknownCosts += 1;
      else summary.providerReportedCostUsd += attempt.metrics.providerReportedCostUsd;
    }
    if (!attempt || !oracle) { summary.missing += 1; continue; }
    validateOracle(oracle, attempt);
    const critical = oracle.unauthorizedEffects > 0 || oracle.duplicateConsequences > 0 || oracle.privacyFailure || oracle.dataLoss;
    if (critical) summary.criticalFailures += 1;
    const success = attempt.status === "completed" && oracle.correctResult && oracle.correctResource && oracle.correctAccount && oracle.artifactMatch && oracle.expectedEffects === oracle.actualEffects && !critical;
    if (success) { if (slot.heldOut) summary.heldOutSuccesses += 1; else summary.coreSuccesses += 1; }
  }
  const pendingDefinitions = catalog.cases.filter(item => item.heldOut && /^heldout-\d+$/.test(item.family)).map(item => item.id);
  const qaFrozen = SHA.test(campaign.qaCaseSetSha256 || "") && campaign.qaGeneratedAt !== null && Number.isFinite(Date.parse(campaign.qaGeneratedAt)) && Date.parse(campaign.qaGeneratedAt) > Date.parse(campaign.codeFreezeAt);
  for (const summary of result) summary.eligible = summary.missing === 0 && summary.criticalFailures === 0 && summary.coreSuccesses >= 33 && summary.heldOutSuccesses >= 20 && pendingDefinitions.length === 0 && qaFrozen;
  return {
    candidateSha: campaign.candidateSha, requiredSlots: slots.length, recordedAttempts: attempts.length,
    missingSlots: slots.filter(slot => !byAttempt.has(slot.id) || !byOracle.has(slot.id)).map(slot => slot.id),
    pendingDefinitions, qaFrozen, configurations: result,
    fullSuiteQualified: campaign.configurations.length === 2 && result.every(summary => summary.eligible),
  };
}
