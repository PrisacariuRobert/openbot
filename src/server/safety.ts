const SPEND_REASON = "This may spend money or start a subscription.";
const LOCAL_ANALYSIS_REASON = "This analyzes attached payment data and writes a local report; it proposes no transaction.";
const riskyPatterns: Array<[RegExp, string]> = [
  [/\b(delete|remove|erase|wipe|drop|truncate)\b/i, "This may delete files or data."],
  [/\b(git\s+push|publish|deploy|merge\s+(the\s+)?pr)\b/i, "This may publish work outside your computer."],
  [/\b(send|post|message|email|reply|submit)\b.{0,45}\b(client|customer|team|public|twitter|x|slack|discord|form|application)\b/i, "This may communicate with other people."],
  // "order" alone is usually grammatical ("in order to") or analytical
  // ("total orders"); spending means executing: buying, subscribing, paying
  // out, or issuing a refund. Calculation, drafting and explanation words
  // around refunds never trigger this on their own.
  [/\b(buy|purchase|pay|subscribe|checkout|transfer)\b/i, SPEND_REASON],
  [/(?<!\bin\s)\border\b(?!\s+to\b)(?!\s+by\b)/i, SPEND_REASON],
  [/\b(execute|process|issue|send|submit|approve|pay out)\b.{0,30}\brefunds?\b/i, SPEND_REASON],
  [/\b(sudo|chmod|chown|rm\s+-rf|killall|shutdown|reboot)\b/i, "This requests a high-impact system action."],
  [/\b(password|passcode|api[ _-]?key|secret|credit card|bank account)\b/i, "This may use private credentials or financial information."],
];

export function approvalReason(prompt: string): string | null {
  // A clear coordinated prohibition shares "do not" across its list:
  // "Do not install packages, push, publish, or change my checkout."
  // Only accept explicit OR lists of recognized verbs. Ambiguous conjunctions
  // and contrast/sequence clauses stay subject to the conservative detector.
  const withoutExcludedLists = prompt.replace(/\b(?:do\s+not|don't|never)\s+[^.;!?\n]+/gi, (clause) => {
    const actions = clause.replace(/^(?:do\s+not|don't|never)\s+/i, "");
    if (!/\s+or\s+/i.test(actions) || /\b(?:but|then|instead|however|also|actually|afterwards|except)\b/i.test(actions)) return clause;
    const parts = actions.split(/,\s*(?:or\s+)?|\s+or\s+/i);
    const excludedVerb = /^(?:delete|remove|erase|wipe|drop|truncate|git\s+push|push|publish|deploy|release|merge|send|post|message|email|reply|submit|buy|purchase|pay|subscribe|order|checkout|transfer|execute|process|issue|install|access|change|modify|overwrite)\b/i;
    return parts.length >= 2 && parts.every((part) => excludedVerb.test(part.trim())) ? "[actions explicitly excluded]" : clause;
  });
  const actionable = withoutExcludedLists.replace(/\b(?:do\s+not|don't|never)\s+(?:try\s+to\s+|attempt\s+to\s+)?(?:delete|remove|erase|wipe|drop|truncate|git\s+push|publish|deploy|release|merge\s+(?:the\s+)?pr|send|post|message|email|reply|submit|buy|purchase|pay|subscribe|order|checkout|transfer|execute|process|issue|use\s+(?:an?\s+)?(?:password|passcode|api[ _-]?key|secret|credit\s+card|bank\s+account))\b[^,.;]*?(?=\s+\b(?:but|then)\b|[,.;]|$)/gi, "[action explicitly excluded]");
  for (const [pattern, reason] of riskyPatterns) {
    if (reason === "This may communicate with other people." && /\bmessage_teammate\b/i.test(actionable)) continue;
    if (pattern.test(actionable)) {
      // S3-P01: a spend-pattern match inside explicitly local, read-only
      // payment-data analysis (reconcile/analyze/summarize attached files,
      // no execution target) keeps Ask-first approval but with a truthful
      // reason instead of a spending warning. Any explicit execution target
      // (issue/pay out/send TO someone, buy/subscribe/order goods) keeps
      // the spend gate.
      if (reason === SPEND_REASON && isLocalPaymentAnalysis(actionable)) return LOCAL_ANALYSIS_REASON;
      return reason;
    }
  }
  return null;
}

/** True when the prompt frames payment words as data to analyze locally
 * (attached/historical files, reconcile/analyze/summarize/report verbs)
 * without proposing a transaction to anyone. */
function isLocalPaymentAnalysis(prompt: string): boolean {
  const framed = /\b(reconcil|analy[sz]e|analysis|summariz|report|review|calculat|read-only|attached|synthetic|historical|local (file|report|json|analysis))\b/i.test(prompt);
  if (!framed) return false;
  const executes = /\b(issue|pay\s?out|send|submit|transfer|approve|authori[sz]e|execute)\b[^.;]{0,60}\b(to|for)\b[^.;]{0,30}\b(customer|client|user|vendor|supplier|account)\b/i.test(prompt)
    || /\b(buy|buys|purchase|purchases|subscrib|checkout|order\s+\d+|order\s+(more|new)\b)\b/i.test(prompt);
  return !executes;
}

const commandRisks: Array<[RegExp, string]> = [
  [/\brm\b|\brmdir\b|\bunlink\b|\bshred\b|\btruncate\b|\bfind\b[^\n]*-delete/i, "This terminal command may delete data."],
  [/\bgit\s+(push|reset|clean\s+-f|checkout|restore|rebase)|\bnpm\s+publish|\bgh\s+pr\s+merge/i, "This terminal command may publish or rewrite project work."],
  [/\bcurl\b[^\n]*(--data|-d\s|--upload|-T\s)|\bwget\b[^\n]*--post/i, "This command may send data to an external service."],
  [/\b(sudo|su\s|chmod|chown|mkfs|shutdown|reboot|killall)\b/i, "This terminal command requests elevated or system-level access."],
];

export function commandApprovalReason(command: string): string | null {
  return commandRisks.find(([pattern]) => pattern.test(command))?.[1] || null;
}

export interface BrowserTarget {
  url: string;
  tag: string;
  role: string;
  label: string;
  inputType: string;
  autocomplete: string;
  href: string;
  formMethod: string;
  searchForm: boolean;
  review?: { url: string; label: string; control: string; fields: Array<{ label: string; value: string }>; complete: boolean };
}

export function browserApprovalReason(action: "open" | "click" | "type", value: string, target?: BrowserTarget): string | null {
  const description = `${value} ${target?.label || ""} ${target?.inputType || ""} ${target?.autocomplete || ""}`;
  if (action === "type" && /password|passcode|secret|token|credit.?card|checkout|payment|one-time-code|cc-/i.test(description)) return "This browser action may enter private or payment information.";
  if (action === "click") {
    if (/send|submit|publish|buy|pay|order|delete|remove|confirm/i.test(description)) return "This click may create an external or irreversible action.";
    // A CSS selector is not evidence of intent: #primary can mean Send.
    // Permit observed navigation/search; review other controls by default.
    if (target?.tag === "a" && /^https?:/i.test(target.href)) return null;
    if (target?.searchForm && target.formMethod === "get" && /^(search|find)$/i.test(target.label.trim())) return null;
    return "Review this browser control before it runs; it may change data or send information.";
  }
  return null;
}
