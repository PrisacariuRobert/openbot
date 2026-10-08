/** Task T4: what makes a community skill trustworthy enough to use. Pure, so
 * the studio and the server agree: lines that send data out or fetch code
 * to run, a line-by-line diff for updates, and the content hash that pins
 * an installed skill to exactly what the owner reviewed. */

export interface SkillFlag {
  file: string;
  line: number;
  text: string;
  reason: string;
  /** Blocks adding the skill; otherwise it's shown for the owner to read before adding. */
  blocks: boolean;
}

const COLLECTOR_HOSTS = /\b(?:webhook\.site|requestbin\.(?:com|net)|[a-z0-9-]+\.pipedream\.net|[a-z0-9-]+\.ngrok(?:-free)?\.(?:io|app|dev)|discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com\/services|[a-z0-9-]+\.oast\.(?:pro|live|site|online|fun|me)|interact\.sh|burpcollaborator\.net|canarytokens\.com|beeceptor\.com|requestcatcher\.com|hookbin\.com|postb\.in)/i;
const PLACEHOLDER = /\{\{[^}]*\}\}|\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]{2,}|%s|<[A-Za-z_ -]{2,40}>/;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

const RULES: Array<{ test: (line: string) => boolean; reason: string; blocks: boolean }> = [
  { test: (line) => /\b(?:curl|wget|fetch)\b[^|\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python3?|node|perl|ruby)\b/i.test(line) || /\b(?:bash|sh|zsh)\s+<\(\s*(?:curl|wget)\b/i.test(line) || /\beval\s+["'`]?\$\(\s*(?:curl|wget)\b/i.test(line), reason: "Downloads code and runs it straight away.", blocks: true },
  { test: (line) => /\b(?:iex|Invoke-Expression)\b[\s\S]*\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b|\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|\n]*\|\s*(?:iex|Invoke-Expression)\b/i.test(line), reason: "Downloads code and runs it straight away.", blocks: true },
  { test: (line) => /\bbase64\s+(?:-d|--decode|-D)\b[^|\n]*\|\s*(?:sh|bash|zsh|python3?|node)\b/i.test(line), reason: "Decodes hidden code and runs it.", blocks: true },
  { test: (line) => COLLECTOR_HOSTS.test(line), reason: "Sends to an address that collects requests (a webhook or request catcher).", blocks: false },
  { test: (line) => /\bcurl\b[^\n]*(?:\s-d\b|\s--data(?:-raw|-binary|-urlencode)?\b|\s-F\b|\s--form\b|\s-T\b|\s--upload-file\b|\s-X\s*(?:POST|PUT|PATCH)\b)|\bwget\b[^\n]*--post-(?:data|file)\b|\bInvoke-(?:WebRequest|RestMethod)\b[^\n]*-Method\s+(?:Post|Put)\b|\brequests\.(?:post|put|patch)\(|\bfetch\([^)]*method\s*:\s*["'](?:POST|PUT|PATCH)/i.test(line), reason: "Sends data to a web address.", blocks: false },
  { test: (line) => [...line.matchAll(URL_PATTERN)].some(([url]) => { const at = url.search(/[?#]/); return PLACEHOLDER.test(at >= 0 ? url.slice(at) : "") || PLACEHOLDER.test(url.replace(/^https?:\/\/[^/]+/, "")); }), reason: "A link that carries filled-in data, which would send it to that site.", blocks: false },
  { test: (line) => /!\[[^\]]*\]\(\s*https?:\/\/[^)]*[?&][^)]*=/i.test(line), reason: "An image link with data in it; showing it would send that data.", blocks: false },
  { test: (line) => /\b(?:pip3?|npm|pnpm|yarn|gem|brew|apt(?:-get)?|cargo)\s+(?:install|add)\b/i.test(line), reason: "Installs software from the internet when followed.", blocks: false },
  { test: (line) => /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier|other)\s+(?:instructions|rules|messages)\b/i.test(line) || /\b(?:do not|don't|never)\s+(?:tell|inform|ask)\s+(?:the\s+)?(?:user|owner)\b/i.test(line), reason: "Tells the teammate to ignore its rules or keep something from you.", blocks: false },
  { test: (line) => /(?:~\/\.ssh|id_rsa|\.aws\/credentials|\.netrc|Keychain|security\s+find-(?:generic|internet)-password|\.env\b)/i.test(line), reason: "Mentions keys, passwords or credential files.", blocks: false },
];

/** Every line worth a look, in file order. Hidden HTML comments count too. */
export function skillFlags(files: Record<string, string>): SkillFlag[] {
  const flags: SkillFlag[] = [];
  for (const [file, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    lines.forEach((text, index) => {
      for (const rule of RULES) if (rule.test(text)) flags.push({ file, line: index + 1, text: text.trim().slice(0, 240), reason: rule.reason, blocks: rule.blocks });
    });
    for (const match of content.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (match[1]!.trim().length < 12) continue;
      const line = content.slice(0, match.index).split("\n").length;
      flags.push({ file, line, text: match[0].replace(/\s+/g, " ").slice(0, 240), reason: "A hidden comment: you don't see it on the page, but the teammate reads it.", blocks: false });
    }
  }
  return flags;
}

export const SCRIPT_FILE = /^scripts\/[a-zA-Z0-9_./-]+\.(?:py|sh|bash|js|mjs|cjs|ts|rb|pl)$/;
export function skillScripts(files: Record<string, string>): string[] {
  return Object.keys(files).filter((file) => SCRIPT_FILE.test(file)).sort();
}

export interface DiffLine { kind: "same" | "added" | "removed"; text: string }
export interface FileDiff { file: string; status: "added" | "removed" | "changed"; lines: DiffLine[]; added: number; removed: number }

/** Line diff (longest common subsequence), with unchanged runs cut to three lines of context. */
export function diffLines(before: string, after: string, context = 3): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n"), b = after.replace(/\r\n/g, "\n").split("\n");
  const n = a.length, m = b.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const all: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { all.push({ kind: "same", text: a[i]! }); i++; j++; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) all.push({ kind: "removed", text: a[i++]! });
    else all.push({ kind: "added", text: b[j++]! });
  }
  while (i < n) all.push({ kind: "removed", text: a[i++]! });
  while (j < m) all.push({ kind: "added", text: b[j++]! });
  return all.filter((line, index) => line.kind !== "same" || all.slice(Math.max(0, index - context), index + context + 1).some((near) => near.kind !== "same"));
}

export function diffSkill(before: Record<string, string>, after: Record<string, string>): FileDiff[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const split = (text: string) => text.replace(/\r\n/g, "\n").split("\n");
  return names.flatMap((file): FileDiff[] => {
    const old = before[file], next = after[file];
    if (old === next) return [];
    const lines: DiffLine[] = old === undefined ? split(next!).map((text) => ({ kind: "added", text }))
      : next === undefined ? split(old).map((text) => ({ kind: "removed", text }))
        : diffLines(old, next);
    return [{ file, status: old === undefined ? "added" : next === undefined ? "removed" : "changed", lines, added: lines.filter((line) => line.kind === "added").length, removed: lines.filter((line) => line.kind === "removed").length }];
  });
}
