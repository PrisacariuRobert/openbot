import type { TaughtWorkflow } from "./types.js";

export function skillSlug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "taught-workflow";
}

export function invokedSkillSlug(body: string): string | null {
  return body.match(/(?:^|\s)\/([a-z0-9][a-z0-9-]{0,79})(?=\s|$)/i)?.[1]?.toLowerCase() || null;
}

export function invokedWorkflow(body: string, workflows: TaughtWorkflow[]): TaughtWorkflow | null {
  const slug = invokedSkillSlug(body);
  return slug ? workflows.find((workflow) => workflow.skillSlug === slug) || null : null;
}
