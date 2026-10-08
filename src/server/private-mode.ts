/** Task F3: Private mode, per teammate. With a cloud AI, personal details
 * become placeholders before anything reaches it (instructions, memories,
 * the request, every tool answer), and the real values come back on this
 * Mac: in the answer, and in what the teammate asks Sidemates to do. With a
 * model on this Mac (Ollama), nothing leaves it, so nothing is masked. */
import type { NextFunction, Request, Response } from "express";
import type { ProviderInstance, Run } from "../shared/types.js";
import { emptyVault, fullNamesIn, learnNames, maskText, maskValue, unmaskText, unmaskValue, zeroCounts, type MaskCounts, type MaskVault } from "../shared/private-mask.js";
import { isLocalModelUrl } from "../shared/provider-config.js";
import type { OpenBotDatabase } from "./database.js";
import { logSentText } from "./sent-log.js";

export interface PrivateModeSetting { on: boolean; names: string[] }
export const PRIVATE_NAMES_LIMIT = 200;

export function privateModeSetting(db: OpenBotDatabase, botId: string): PrivateModeSetting {
  const saved = db.extensionRecord<PrivateModeSetting>("private-mode", botId);
  return { on: Boolean(saved?.on), names: Array.isArray(saved?.names) ? saved.names.filter((name) => typeof name === "string") : [] };
}

export function savePrivateModeSetting(db: OpenBotDatabase, botId: string, setting: PrivateModeSetting) {
  const names = [...new Set(setting.names.map((name) => name.trim().replace(/\s+/g, " ")).filter((name) => name.length >= 2 && name.length <= 80))].slice(0, PRIVATE_NAMES_LIMIT);
  db.saveExtensionRecord("private-mode", botId, { on: setting.on, names });
  return { on: setting.on, names };
}

/** A connection whose model runs on this Mac: a compatible API on a loopback address (Ollama). */
export function localConnection(provider: ProviderInstance | null | undefined): boolean {
  return Boolean(provider && provider.provider === "custom" && provider.apiConfig?.baseUrl && isLocalModelUrl(provider.apiConfig.baseUrl));
}

/** On for the run's teammate, or for the teammate whose task started it (a handoff stays private). */
function privateByLineage(db: OpenBotDatabase, run: Run): boolean {
  let current: Run | null = run;
  for (let depth = 0; current && depth < 12; depth += 1) {
    if (privateModeSetting(db, current.botId).on) return true;
    current = current.parentRunId ? db.getRun(current.parentRunId) : null;
  }
  return false;
}

export class RunPrivacy {
  private constructor(private readonly db: OpenBotDatabase, readonly botId: string, readonly on: boolean, readonly local: boolean, private readonly names: string[]) {}

  static forRun(db: OpenBotDatabase, run: Run): RunPrivacy {
    const on = privateByLineage(db, run);
    return new RunPrivacy(db, run.botId, on, localConnection(db.providerForBot(run.botId)), privateModeSetting(db, run.botId).names);
  }

  /** Text is masked only when Private mode is on and the AI isn't on this Mac. */
  get masked(): boolean { return this.on && !this.local; }

  private vault(): MaskVault { return this.db.extensionRecord<MaskVault>("private-vault", this.botId) ?? emptyVault(); }

  /** Full names in the owner's own words (requests, memories) are masked everywhere from now on. */
  learnFromOwner(texts: readonly string[]) {
    if (!this.masked) return;
    const vault = this.vault();
    if (learnNames(vault, texts.flatMap((text) => fullNamesIn(text)))) this.db.saveExtensionRecord("private-vault", this.botId, vault);
  }

  mask(text: string): { text: string; counts: MaskCounts } {
    if (!this.masked) return { text, counts: zeroCounts() };
    const vault = this.vault(), result = maskText(text, vault, this.names);
    if (result.changed) this.db.saveExtensionRecord("private-vault", this.botId, vault);
    return { text: result.text, counts: result.counts };
  }

  maskValue<T>(value: T): { value: T; counts: MaskCounts } {
    if (!this.masked) return { value, counts: zeroCounts() };
    const vault = this.vault(), result = maskValue(value, vault, this.names);
    if (result.changed) this.db.saveExtensionRecord("private-vault", this.botId, vault);
    return { value: result.value, counts: result.counts };
  }

  /** Always applied: a session that was masked earlier can still answer with placeholders. */
  unmask(text: string): string {
    if (!text || !text.includes("[")) return text;
    const vault = this.db.extensionRecord<MaskVault>("private-vault", this.botId);
    return vault ? unmaskText(text, vault) : text;
  }

  unmaskValue<T>(value: T): T {
    const vault = this.db.extensionRecord<MaskVault>("private-vault", this.botId);
    return vault ? unmaskValue(value, vault) : value;
  }
}

/** Tools whose answer is a picture, which can't be masked. */
const PICTURE_TOOLS = new Set(["browser_see"]);
export const PICTURE_REFUSAL = "Private mode keeps screenshots on this Mac, because a picture can't be masked. Use browser_observe or browser_snapshot to read the page as text.";

/** On every teammate tool call: real values back into the arguments, and the
 * answer masked (when Private mode applies) and written to the run's log
 * before it goes back to the AI. Runs before the route, after the token check. */
export function privateToolTraffic(db: OpenBotDatabase, validToken: (request: Request) => boolean) {
  return (request: Request, response: Response, next: NextFunction) => {
    const body = request.body as { botId?: unknown; runId?: unknown; action?: unknown; args?: unknown } | undefined;
    if (!body || typeof body.runId !== "string" || typeof body.botId !== "string" || !validToken(request)) return next();
    const run = db.getRun(body.runId);
    if (!run || run.botId !== body.botId) return next();
    const privacy = RunPrivacy.forRun(db, run), action = typeof body.action === "string" ? body.action : "tool";
    if (body.args && typeof body.args === "object") body.args = privacy.unmaskValue(body.args);
    const json = response.json.bind(response);
    response.json = ((payload: unknown) => {
      const { value, counts } = privacy.maskValue(payload);
      try {
        logSentText(db, run, { kind: "tool", label: response.statusCode >= 400 ? `${action} (refused)` : action, text: JSON.stringify(value), masked: privacy.masked, local: privacy.local, counts });
      } catch { /* The log never changes what the teammate receives. */ }
      return json(value);
    }) as Response["json"];
    if (privacy.masked && PICTURE_TOOLS.has(action)) return response.status(403).json({ error: PICTURE_REFUSAL });
    next();
  };
}
