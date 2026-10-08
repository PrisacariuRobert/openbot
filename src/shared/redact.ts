/** Hides personal details before a result leaves the studio as a page.
 * This is a safety net, not a promise to catch everything: it removes what a
 * pattern can recognise (email addresses, phone numbers, long numbers such as
 * cards and IBANs, keys and tokens, home-folder names, and secrets inside web
 * addresses). A person still reads the page before sharing it. */

export interface Redaction { text: string; hidden: { emails: number; phones: number; numbers: number; keys: number; folders: number; links: number }; total: number }

const KEYS = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|obd_[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const LONG_NUMBER = /\b(?:\d[ -]?){13,19}\b/g;
const PHONE = /(?<![\w.])(?:\+|00)\d{1,3}[\s.()-]*\d(?:[\s.()-]*\d){6,12}\b|(?<![\w.,/-])(?:\(0\)|\(?0\d{1,4}\)?)[\s.-]?\d{2,4}(?:[\s.-]\d{2,4}){1,3}\b/g;
const DATE = /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}$/;
const HOME = /\/Users\/[^/\s)"'`]+/g;
/** The same patterns, for Private mode's placeholders (src/shared/private-mask.ts). */
export const PERSONAL_PATTERNS = { email: EMAIL, iban: IBAN, longNumber: LONG_NUMBER, phone: PHONE, date: DATE } as const;
const SECRET_PARAMS = /^(?:token|access_token|refresh_token|id_token|key|api_key|apikey|secret|auth|authorization|session|sessionid|sid|sig|signature|code|password|pass|pwd|ticket|otp|jwt)$/i;

/** Web addresses keep their site and path, which are the useful part. The
 * query and fragment carry tokens and tracking, so they go unless harmless. */
function cleanLink(url: string, count: () => void): string {
  const trailing = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? "";
  const body = trailing ? url.slice(0, -trailing.length) : url;
  try {
    const parsed = new URL(body);
    let changed = false;
    if (parsed.username || parsed.password) { parsed.username = ""; parsed.password = ""; changed = true; }
    for (const name of [...parsed.searchParams.keys()]) if (SECRET_PARAMS.test(name) || /(?:token|secret|key|session|sig)/i.test(name)) { parsed.searchParams.delete(name); changed = true; }
    if (parsed.hash.length > 24) { parsed.hash = ""; changed = true; }
    if (changed) count();
    return parsed.toString().replace(/\?$/, "") + trailing;
  } catch { return url; }
}

export function redact(input: string): Redaction {
  const hidden = { emails: 0, phones: 0, numbers: 0, keys: 0, folders: 0, links: 0 };
  let text = input;
  text = text.replace(KEYS, () => { hidden.keys += 1; return "[key hidden]"; });
  text = text.replace(/https?:\/\/[^\s<>"'`]+/g, (url) => cleanLink(url, () => { hidden.links += 1; }));
  text = text.replace(EMAIL, (match) => (/^https?:/.test(match) ? match : (hidden.emails += 1, "[email hidden]")));
  text = text.replace(IBAN, (match) => (match.replace(/\s/g, "").length >= 15 ? (hidden.numbers += 1, "[number hidden]") : match));
  // Phone numbers first, so a long international number is called what it is.
  text = text.replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 8 && !DATE.test(match) ? (hidden.phones += 1, "[phone hidden]") : match));
  text = text.replace(LONG_NUMBER, (match) => { const digits = match.replace(/\D/g, ""); return digits.length >= 13 && digits.length <= 19 ? (hidden.numbers += 1, "[number hidden]") : match; });
  text = text.replace(HOME, () => { hidden.folders += 1; return "~"; });
  return { text, hidden, total: Object.values(hidden).reduce((sum, count) => sum + count, 0) };
}

/** "2 email addresses, 1 phone number" */
export function describeHidden(hidden: Redaction["hidden"]): string {
  const part = (count: number, one: string, many: string) => (count ? `${count} ${count === 1 ? one : many}` : "");
  return [part(hidden.emails, "email address", "email addresses"), part(hidden.phones, "phone number", "phone numbers"), part(hidden.numbers, "long number", "long numbers"), part(hidden.keys, "key", "keys"), part(hidden.folders, "folder name", "folder names"), part(hidden.links, "link cleaned", "links cleaned")].filter(Boolean).join(", ");
}
