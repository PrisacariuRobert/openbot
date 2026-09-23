import { spawn, type ChildProcess } from "node:child_process";
import { safeHostEnvironment } from "./runtime.js";

type SpawnModel = typeof spawn;
const cache = new Map<string, { until: number; supported: boolean }>();

/** OpenCode's verbose model catalog is the runtime's own capability claim.
 * Unknown models, CLI failures and text-only models never receive pixels. */
export function imageCapableInCatalog(output: string, model: string): boolean {
  const lines = output.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === model);
  if (index < 0) return false;
  const start = lines.slice(index + 1).findIndex((line) => line.trim().startsWith("{"));
  if (start < 0) return false;
  const remainder = lines.slice(index + start + 1).join("\n");
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let position = 0; position < remainder.length; position++) {
    const character = remainder[position]!;
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quoted) { escaped = true; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (character === "{") depth++;
    if (character === "}" && --depth === 0) { end = position + 1; break; }
  }
  if (end < 0) return false;
  try {
    const parsed = JSON.parse(remainder.slice(0, end)) as { providerID?: string; id?: string; capabilities?: { attachment?: boolean; input?: { image?: boolean } } };
    const [provider, ...id] = model.split("/");
    return parsed.providerID === provider && parsed.id === id.join("/") && parsed.capabilities?.attachment === true && parsed.capabilities.input?.image === true;
  } catch {
    return false;
  }
}

export async function modelCanReceiveBrowserImage(model: string, runtime: string, spawnModel: SpawnModel = spawn): Promise<boolean> {
  if (runtime !== "opencode" || !/^[a-z0-9._-]+\/[a-z0-9._:/-]+$/i.test(model)) return false;
  const cached = cache.get(model);
  if (cached && cached.until > Date.now()) return cached.supported;
  const provider = model.split("/")[0]!;
  const supported = await new Promise<boolean>((resolve) => {
    let settled = false, output = "";
    const child: ChildProcess = spawnModel("opencode", ["models", provider, "--verbose", "--pure"], {
      env: safeHostEnvironment(), stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (value: boolean) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false); }, 8_000);
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
      if (output.length > 2_000_000) { child.kill("SIGKILL"); finish(false); }
    });
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0 && imageCapableInCatalog(output, model)));
  });
  cache.set(model, { until: Date.now() + (supported ? 600_000 : 30_000), supported });
  return supported;
}
