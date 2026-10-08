import { execFile } from "node:child_process";
import type { Express } from "express";
import { z } from "zod";
import { askMyMac, type LocalChat } from "./ask-my-mac.js";
import type { OpenBotDatabase } from "./database.js";
import { detectLocalEmbeddings, detectOllama } from "./ollama.js";
import { SOURCES, type PersonalIndex, type SourceKind } from "./personal-index.js";

export type Runner = (command: string, args: string[]) => Promise<void>;
const run: Runner = (command, args) => new Promise((resolve, reject) => { execFile(command, args, { timeout: 10_000 }, (error) => (error ? reject(error) : resolve())); });

/** Opens a source in the app it belongs to. Only items the index holds reach here. */
export async function openSource(item: { source: SourceKind; key: string }, deps: { platform?: NodeJS.Platform; runner?: Runner; mailFile: (id: string) => string | null }): Promise<{ opened: boolean; reason?: string }> {
  if ((deps.platform ?? process.platform) !== "darwin") return { opened: false, reason: "Opening sources works in Sidemates on a Mac." };
  const runner = deps.runner ?? run;
  try {
    if (item.source === "files") await runner("/usr/bin/open", ["-R", item.key]);
    else if (item.source === "mail") {
      const file = deps.mailFile(item.key);
      if (!file) return { opened: false, reason: "Mail no longer has that message." };
      await runner("/usr/bin/open", [file]);
    } else if (item.source === "notes") await runner("/usr/bin/osascript", ["-e", `tell application "Notes" to show note id ${JSON.stringify(item.key)}`, "-e", "tell application \"Notes\" to activate"]);
    else await runner("/usr/bin/open", ["-a", "Messages"]);
    return { opened: true };
  } catch { return { opened: false, reason: "macOS didn't open it. The item may have moved." }; }
}

let chatCache: { at: number; chat: LocalChat | null } | null = null;
async function localChat(): Promise<LocalChat | null> {
  if (chatCache && Date.now() - chatCache.at < 300_000) return chatCache.chat;
  const status = await detectOllama().catch(() => null);
  const chat = status?.running && status.models[0] ? { baseUrl: status.apiBaseUrl, model: status.models[0] } : null;
  chatCache = { at: Date.now(), chat };
  return chat;
}

/** Task F7. Studio routes only. */
export function registerAskRoutes(app: Express, deps: { db: OpenBotDatabase; index: PersonalIndex; mailFile: (id: string) => string | null; runner?: Runner; platform?: NodeJS.Platform }) {
  app.post("/api/ask", async (request, response) => {
    const parsed = z.object({ question: z.string().trim().min(2).max(300) }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Ask a question of 2 to 300 characters." });
    const counts = deps.index.counts();
    if (!SOURCES.some((source) => counts[source].items > 0)) return response.json({ question: parsed.data.question, answer: null, answeredWith: null, sources: [], cited: [], searchedBy: "words", note: "Nothing on this Mac is indexed yet. Choose what to include under What your team knows." });
    const [embeddings, chat] = await Promise.all([detectLocalEmbeddings().catch(() => null), localChat()]);
    response.json(await askMyMac({ question: parsed.data.question, index: deps.index, embeddings, chat }));
  });
  app.post("/api/ask/open", async (request, response) => {
    const parsed = z.object({ source: z.enum(SOURCES as unknown as [SourceKind, ...SourceKind[]]), key: z.string().min(1).max(4_096) }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Choose one of the sources shown." });
    const item = deps.index.get(parsed.data.source, parsed.data.key);
    if (!item) return response.status(404).json({ error: "That isn't in the index any more." });
    response.json(await openSource(item, { platform: deps.platform, runner: deps.runner, mailFile: deps.mailFile }));
  });
}
