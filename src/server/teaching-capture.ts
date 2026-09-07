import { z } from "zod";
import type { SkillStep } from "../shared/types.js";

export function teachingAddress(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Teach from a normal web page without credentials in its address.");
  // Login callbacks, search text and fragment state are not portable inputs.
  url.search = ""; url.hash = "";
  return url.href;
}
const captureInput = z.object({ type: z.enum(["navigate", "click", "input", "submit"]), selector: z.string().max(500).optional(), label: z.string().max(240).optional(), privateField: z.boolean().optional() });
export function captureTeachingStep(raw: unknown, observedFrameUrl: string, fields: Map<string, string>): SkillStep {
  // Intentionally strips page-provided value and URL fields. A page can forge
  // recorder events, but cannot cause us to persist its submitted field value.
  const { privateField, ...input } = captureInput.parse(raw), url = teachingAddress(observedFrameUrl);
  if (input.type !== "input") return { ...input, url };
  if (privateField || /password|secret|token|one.?time|passcode|verification|\botp\b|\bpin\b/i.test(`${input.label || ""} ${input.selector || ""}`)) return { ...input, label: "Private field — owner takeover only", url, value: "{{secret}}" };
  const key = `${url}:${input.selector || input.label || "field"}`;
  if (!fields.has(key)) {
    if (fields.size >= 40) throw new Error("This demonstration has too many input fields. Teach a smaller workflow.");
    fields.set(key, `{{input_${fields.size + 1}}}`);
  }
  return { ...input, url, value: fields.get(key) };
}
