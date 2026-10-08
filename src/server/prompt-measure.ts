/** Measures one OpenAI-compatible chat request: what a teammate's model reads
 * before it answers (task A7). Used by scripts/prompt-size.ts and its tests. */

/** Characters per token, calibrated once against a live run: the eval's greeting
 * measured 8,140 tokens on Muse Spark at 9eeeae5 (qa/prompt-eval/README.md), and the
 * same request measured here at 9eeeae5 is 35,540 characters (size-at-9eeeae5.json).
 * An estimate for comparing changes; the live eval is the record. */
export const CHARS_PER_TOKEN = 4.37;

export interface RequestMeasure {
  systemChars: number;
  userChars: number;
  toolCount: number;
  toolChars: number;
  totalChars: number;
  estimatedTokens: number;
  tools: string[];
  /** Characters per tool definition, largest first. */
  toolSizes: Array<[string, number]>;
}

type Message = { role?: unknown; content?: unknown };
type Tool = { function?: { name?: unknown } };

const text = (content: unknown): string =>
  typeof content === "string" ? content
    : Array.isArray(content) ? content.map((part) => typeof part === "string" ? part : typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : "").join("")
      : "";

export function measureModelRequest(body: Record<string, unknown>): RequestMeasure {
  const messages = (Array.isArray(body.messages) ? body.messages : []) as Message[];
  const tools = (Array.isArray(body.tools) ? body.tools : []) as Tool[];
  const systemChars = messages.filter((message) => message.role === "system").reduce((sum, message) => sum + text(message.content).length, 0);
  const userChars = messages.filter((message) => message.role !== "system").reduce((sum, message) => sum + text(message.content).length, 0);
  const toolChars = tools.length ? JSON.stringify(tools).length : 0;
  const totalChars = systemChars + userChars + toolChars;
  return {
    systemChars, userChars, toolCount: tools.length, toolChars, totalChars,
    estimatedTokens: Math.round(totalChars / CHARS_PER_TOKEN),
    tools: tools.map((tool) => String(tool.function?.name ?? "")).filter(Boolean).sort(),
    toolSizes: tools.map((tool) => [String(tool.function?.name ?? ""), JSON.stringify(tool).length] as [string, number]).sort((a, b) => b[1] - a[1]),
  };
}
