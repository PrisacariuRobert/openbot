import { authoredSkillSchema } from "../shared/skill-authoring.js";
import { skillSecretFindings, type SkillDefinition } from "./skill-library.js";

export function parseAuthoredSkill(input: unknown): SkillDefinition {
  const skill = { ...authoredSkillSchema.parse(input), steps: [], version: 1 };
  const findings = skillSecretFindings(skill);
  if (findings.length) throw new Error(`This skill cannot be saved: ${findings.join(", ")}. Remove private values and use named inputs instead.`);
  return skill;
}
