const riskyPatterns: Array<[RegExp, string]> = [
  [/\b(delete|remove|erase|wipe|drop|truncate)\b/i, "This may delete files or data."],
  [/\b(git\s+push|publish|deploy|merge\s+(the\s+)?pr)\b/i, "This may publish work outside your computer."],
  [/\b(send|post|message|email|reply|submit)\b.{0,45}\b(client|customer|team|public|twitter|x|slack|discord|form|application)\b/i, "This may communicate with other people."],
  [/\b(buy|purchase|pay|subscribe|order|checkout|transfer)\b/i, "This may spend money or start a subscription."],
  [/\b(sudo|chmod|chown|rm\s+-rf|killall|shutdown|reboot)\b/i, "This requests a high-impact system action."],
  [/\b(password|passcode|api[ _-]?key|secret|credit card|bank account)\b/i, "This may use private credentials or financial information."],
];

export function approvalReason(prompt: string): string | null {
  const actionable = prompt.replace(/\b(?:do\s+not|don't|never)\s+(?:try\s+to\s+|attempt\s+to\s+)?(?:delete|remove|erase|wipe|drop|truncate|git\s+push|publish|deploy|release|merge\s+(?:the\s+)?pr|send|post|message|email|reply|submit|buy|purchase|pay|subscribe|order|checkout|transfer|use\s+(?:an?\s+)?(?:password|passcode|api[ _-]?key|secret|credit\s+card|bank\s+account))\b[^,.;]*?(?=\s+\b(?:but|then)\b|[,.;]|$)/gi, "[action explicitly excluded]");
  for (const [pattern, reason] of riskyPatterns) {
    if (reason === "This may communicate with other people." && /\bmessage_teammate\b/i.test(actionable)) continue;
    if (pattern.test(actionable)) return reason;
  }
  return null;
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

export function browserApprovalReason(action: "open" | "click" | "type", value: string): string | null {
  if (action === "type" && /password|passcode|secret|token|credit.?card|checkout|payment/i.test(value)) return "This browser action may enter private or payment information.";
  if (action === "click" && /send|submit|publish|buy|pay|order|delete|remove|confirm/i.test(value)) return "This click may create an external or irreversible action.";
  return null;
}
