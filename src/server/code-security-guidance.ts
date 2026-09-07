// Modified TypeScript subset of Hermes/Anthropic security-guidance concepts.
// Apache-2.0; attribution/license: skills/bundled/licenses/SECURITY-GUIDANCE-*.
// No Python runtime, code execution, source telemetry or security certification.
import path from "node:path";

const js = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];
const py = [".py", ".pyi"];
const rules = [
  { id: "shell-command", extensions: js, pattern: /\b(?:exec|execSync)\s*\(/g, message: "If this invokes a shell, untrusted interpolation can become a command. Prefer a fixed executable with separate arguments." },
  { id: "dynamic-code", extensions: js, pattern: /(?<![\w.])eval\s*\(|\bnew\s+Function\s*\(/g, message: "Check whether untrusted text reaches dynamic code evaluation. Prefer parsing validated data." },
  { id: "html-injection", extensions: js, pattern: /\bdangerouslySetInnerHTML\b|\.(?:innerHTML|outerHTML)\s*=|\b(?:document\.write|\w+\.insertAdjacentHTML)\s*\(/g, message: "Check the origin of inserted HTML. Use text rendering or a maintained sanitizer for untrusted content." },
  { id: "python-shell", extensions: py, pattern: /\bos\.system\s*\(|\bsubprocess\.[a-z_]+\s*\([^)]{0,800}\bshell\s*=\s*True/gs, message: "Shell execution needs a trusted command. Prefer validated arguments with shell=False." },
  { id: "unsafe-deserialization", extensions: py, pattern: /\b(?:pickle|cPickle|cloudpickle|dill|marshal|joblib)\.loads?\s*\(|\b(?:pd|pandas)\.read_pickle\s*\(/g, message: "Object deserialization may execute code. Never load untrusted files this way; prefer a validated data format." },
  { id: "unsafe-yaml", extensions: py, pattern: /\byaml\.unsafe_load\s*\(|\byaml\.load\s*\([^)]{0,600}\)/gs, message: "Check the YAML loader. Use safe_load or an explicitly safe loader for untrusted data, then validate the schema." },
  { id: "weak-encryption", extensions: [...js, ...py], pattern: /\bcreateCipher\s*\(|\b(?:AES\.)?MODE_ECB\b/g, message: "Review encryption mode and nonce handling. Prefer maintained authenticated-encryption APIs." },
  { id: "tls-disabled", extensions: [...js, ...py], pattern: /\brejectUnauthorized\s*:\s*false|\bverify\s*=\s*False|\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/g, message: "TLS verification appears disabled. Restore certificate validation instead of accepting arbitrary certificates." },
];

export function codeSecurityGuidance(filename: string, content: string) {
  const maxCharacters = 1_000_000, scanned = content.slice(0, maxCharacters);
  const warnings: Array<{ rule: string; line: number; message: string }> = [];
  const extension = path.extname(filename).toLowerCase();
  for (const rule of rules) {
    if (!rule.extensions.includes(extension)) continue;
    // matchAll clones each regex; no shared mutable lastIndex across calls.
    for (const match of scanned.matchAll(rule.pattern)) {
      if (rule.id === "unsafe-yaml" && /\bLoader\s*=\s*(?:yaml\.)?C?SafeLoader\b/.test(match[0])) continue;
      warnings.push({ rule: rule.id, line: scanned.slice(0, match.index).split("\n").length, message: rule.message });
      break;
    }
  }
  if (/(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(filename.replaceAll("\\", "/"))) {
    const index = scanned.search(/\$\{\{\s*github\.event\./);
    if (index >= 0) warnings.push({ rule: "workflow-input", line: scanned.slice(0, index).split("\n").length, message: "Review event input. Never interpolate untrusted event text directly into shell commands; use quoted environment variables. This may already be safe." });
  }
  return { kind: "advisory" as const, coverage: "Selected textual patterns in this written file only; not a security audit or proof of safety.", truncated: content.length > maxCharacters, warnings };
}
