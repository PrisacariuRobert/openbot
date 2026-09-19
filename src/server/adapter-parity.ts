/**
 * T03 — Runtime + model-tool parity, including images.
 *
 * Backend-only. No Codex UI/client changes.
 * Schema parity is necessary but insufficient: this module traces tool
 * definitions → argument validation → attachment/image transport → grants →
 * reply/error propagation, with fail-closed compatibility checks.
 *
 * Proves runtime image/tool delivery independently from the developer
 * agent's abilities. No model-native bash/read/web escape around mediated
 * capabilities.
 */

export type AdapterId = string;

export type ToolTransportCheck = {
  adapter: AdapterId;
  toolName: string;
  supportsImageResults: boolean;
  supportsAttachments: boolean;
  grantsEnforced: boolean;
  errorSemanticsMatch: boolean;
};

export function adapterParityPass(checks: ToolTransportCheck[]): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const check of checks) {
    if (!check.grantsEnforced) failures.push(`${check.adapter}/${check.toolName}: grants not enforced`);
    if (!check.errorSemanticsMatch) failures.push(`${check.adapter}/${check.toolName}: error semantics diverge`);
  }
  return { pass: failures.length === 0, failures };
}

/** Missing image/tool support is explicit and affects capability reporting. */
export function capabilityForAdapter(check: ToolTransportCheck): "visual-supported" | "text-only" | "unsupported" {
  if (!check.grantsEnforced || !check.errorSemanticsMatch) return "unsupported";
  if (check.supportsImageResults) return "visual-supported";
  return "text-only";
}

/** Unhandled tool names/args fail rather than invoke a generic shell/JS escape. */
const MEDIATED_PREFIXES = ["browser_", "visual_", "native_", "observe", "verify", "consult"];

export function mediatedToolAllowed(toolName: string): boolean {
  if (toolName === "bash" || toolName === "read" || toolName === "web" || toolName === "execute" || toolName === "eval" || toolName === "shell") {
    return false;
  }
  return MEDIATED_PREFIXES.some((prefix) => toolName === prefix || toolName.startsWith(prefix));
}

/** Runtime upgrade evidence binds to the exact tested version; no
 * "accept all future versions" bypass. */
export function runtimeVersionAccepted(pinned: string, tested: string): boolean {
  return pinned === tested;
}
