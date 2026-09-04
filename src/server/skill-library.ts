import { createHash } from "node:crypto";
import { z } from "zod";
import type { SkillStep, SkillTemplate } from "../shared/types.js";

const stepSchema = z.object({
  type: z.enum(["navigate", "click", "input", "submit"]),
  url: z.string().url().max(2_000),
  selector: z.string().max(500).optional(),
  value: z.string().max(4_000).optional(),
  label: z.string().max(240).optional(),
}).strict();

const definitionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300),
  instructions: z.string().trim().min(1).max(5_000),
  startUrl: z.string().url().max(2_000),
  steps: z.array(stepSchema).max(80),
  version: z.number().int().min(1).max(10_000).default(1),
}).strict();

const packageSchema = z.object({
  format: z.literal("openbot.skill"),
  formatVersion: z.literal(1),
  skill: definitionSchema,
  integrity: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export type SkillDefinition = z.infer<typeof definitionSchema>;
export type PortableSkillPackage = z.infer<typeof packageSchema>;

type TemplateDefinition = SkillTemplate & { steps: SkillStep[] };

export const SKILL_TEMPLATES: TemplateDefinition[] = [
  {
    id: "website-qa",
    name: "Website quality check",
    description: "Review a page like a careful customer and return a short, prioritized quality report.",
    instructions: "Open the starting page, check the most important navigation and call-to-action paths, notice broken or confusing states, and finish with a prioritized report. Do not submit forms, buy anything, or change data without approval.",
    startUrl: "https://example.com",
    category: "Quality",
    stepCount: 1,
    steps: [{ type: "navigate", url: "https://example.com", label: "Open the page to review" }],
  },
  {
    id: "research-roundup",
    name: "Research roundup",
    description: "Gather current information from several sources and produce a concise linked brief.",
    instructions: "Ask for the topic if it is missing. Search the web, open multiple trustworthy sources, compare dates and claims, then return a concise brief with direct source links and a clear statement of uncertainty.",
    startUrl: "https://www.google.com",
    category: "Research",
    stepCount: 1,
    steps: [{ type: "navigate", url: "https://www.google.com", label: "Start current research" }],
  },
  {
    id: "repeatable-admin",
    name: "Careful admin task",
    description: "Repeat a browser-based admin flow while keeping changes reviewable and approval-safe.",
    instructions: "Open the starting page, inspect the current state before changing anything, prepare the requested update, and pause before any final submit, send, publish, purchase, or destructive action. Verify the result after approval.",
    startUrl: "https://example.com",
    category: "Operations",
    stepCount: 1,
    steps: [{ type: "navigate", url: "https://example.com", label: "Open the admin starting page" }],
  },
];

function canonicalSkill(skill: SkillDefinition): string {
  return JSON.stringify(skill);
}

function digest(skill: SkillDefinition): string {
  return `sha256:${createHash("sha256").update(canonicalSkill(skill)).digest("hex")}`;
}

function placeholder(value: string): boolean {
  return /^\{\{[a-z0-9_-]+\}\}$/i.test(value.trim());
}

export function skillSecretFindings(skill: SkillDefinition): string[] {
  const findings = new Set<string>();
  const text = canonicalSkill(skill);
  const textWithoutPlaceholders = text.replace(/\{\{[a-z0-9_-]+\}\}/gi, "");
  const patterns: Array<[RegExp, string]> = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, "private key"],
    [/\bsk-[A-Za-z0-9_-]{20,}\b/, "API key"],
    [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "GitHub token"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
    [/\bAIza[0-9A-Za-z_-]{30,}\b/, "Google API key"],
    [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b/i, "bearer token"],
    [/(?:password|passwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\s*[:=]\s*["']?[^"'\s,}]{6,}/i, "credential value"],
  ];
  for (const [pattern, label] of patterns) if (pattern.test(textWithoutPlaceholders)) findings.add(label);
  const inspectUrl = (raw: string, where: string) => {
    try {
      const url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol)) findings.add(`${where} uses an unsupported address`);
      if (url.username || url.password) findings.add(`${where} contains sign-in details`);
      for (const [key, value] of url.searchParams) {
        if (/token|secret|password|passwd|api[_-]?key|auth|session/i.test(key) && value && !placeholder(value)) findings.add(`${where} contains a private ${key} value`);
      }
    } catch {
      findings.add(`${where} is not a valid web address`);
    }
  };
  inspectUrl(skill.startUrl, "Starting page");
  skill.steps.forEach((step, index) => {
    inspectUrl(step.url, `Step ${index + 1}`);
    if (step.value && /password|secret|token|passcode|one.?time|api.?key/i.test(`${step.label || ""} ${step.selector || ""}`) && !placeholder(step.value)) {
      findings.add(`Step ${index + 1} contains a private field value`);
    }
  });
  return [...findings];
}

export function createSkillPackage(input: Omit<SkillDefinition, "version"> & { version: number }): PortableSkillPackage {
  const skill = definitionSchema.parse(input);
  return { format: "openbot.skill", formatVersion: 1, skill, integrity: digest(skill) };
}

export function parseSkillPackage(input: unknown): SkillDefinition {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) throw new Error("That file is not an OpenBot skill package.");
  if (parsed.data.integrity !== digest(parsed.data.skill)) throw new Error("This skill file changed after it was exported.");
  const findings = skillSecretFindings(parsed.data.skill);
  if (findings.length) throw new Error(`Remove private information before importing: ${findings.join(", ")}. Use placeholders such as {{secret}} instead.`);
  return parsed.data.skill;
}

export function skillTemplate(id: string): TemplateDefinition | null {
  return SKILL_TEMPLATES.find((template) => template.id === id) || null;
}
