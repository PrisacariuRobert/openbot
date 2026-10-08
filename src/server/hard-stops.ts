import type { HardStop } from "../shared/hard-stops.js";
import type { BrowserTarget } from "./safety.js";

/** Task T1: which hard stop, if any, an action falls under. Decided from facts the
 * host observed: the control's label and visible text, the page and its title,
 * where the click goes, the fields beside it, the command, the app. Page text is
 * untrusted, so every test errs towards asking: a false stop costs one click, a
 * missed one could cost money. */

const MONEY_WORDS = /\b(?:pay|pay now|buy|buy now|purchase|place (?:my |your |the )?order|order now|submit order|complete (?:my |your |the )?(?:purchase|order|payment)|confirm (?:and pay|payment|purchase|order)|subscribe|checkout|check out|transfer|send money|donate|add funds|top up|upgrade|start (?:my |your )?(?:free )?trial)\b|^\s*order\s*$|\b(?:bezahlen|jetzt kaufen|kaufen|zahlungspflichtig(?: bestellen)?|bestellen|abonnieren|überweisen|payer|acheter|commander|s'abonner|pagar|comprar|suscribirse|pagare|acquista|abbonati|betalen|kopen|afrekenen)\b/i;
const PRICE = /[€$£¥₹]\s?\d|\d\s?[€$£¥₹]|\b(?:eur|usd|gbp|chf)\s?\d|\d[.,]?\d*\s?(?:eur|usd|gbp|chf)\b/i;
const MONEY_PLACE = /checkout|\bcart\b|basket|payment|billing|\bpay\b|purchase|subscri|donate|warenkorb|kasse|zahlung|bezahl|panier|paiement|carrito|\bpago\b|carrello|pagamento|winkelwagen|afrekenen/i;
export const CARD_FIELD = /\bcc-|card ?number|cardholder|name on (?:the )?card|expir|exp\.? date|\bmm ?\/ ?yy|\bcvc\b|\bcvv\b|security code|\biban\b|\bbic\b|\bswift\b|routing number|account number|sort code|kartennummer|ablaufdatum|prüfnummer|numéro de carte|cryptogramme|número de tarjeta|numero di carta|kaartnummer/i;
const PASSWORD_FIELD = /password|passcode|passwort|mot de passe|contraseña|one-time-code|verification code|\bpin\b|\botp\b/i;
const GONE = /\b(?:delete|remove|erase|destroy|wipe|permanently|empty (?:the )?(?:trash|bin)|close (?:my |your |the )?account|deactivate|cancel (?:my |your |the )?(?:account|membership)|reset (?:all|everything)|löschen|entfernen|endgültig|supprimer|eliminar|borrar|elimina|cancella|verwijderen)\b/i;
const SECURITY_PLACE = /security|password|two-factor|2fa|\bmfa\b|passkey|recovery|sicherheit|sécurité|seguridad|sicurezza/i;
const PUBLISH = /\b(?:publish|post|tweet|share (?:publicly|with everyone|to everyone)|make (?:it )?public|go live|deploy|merge|veröffentlichen|posten|publier|publicar|pubblica|publiceren)\b/i;
const SEND = /\b(?:send|reply(?: all)?|forward|invite|senden|antworten|weiterleiten|einladen|envoyer|répondre|transférer|inviter|enviar|responder|reenviar|invitar|invia|rispondi|inoltra|invita|verzenden|versturen|beantwoorden|uitnodigen)\b/i;

const path = (url: string | undefined) => { try { return url ? new URL(url).pathname : ""; } catch { return ""; } };

/** A browser click or entry. `facts` carries what describeTarget observed beyond the review. */
export function browserHardStop(action: "click" | "type", target: BrowserTarget): HardStop | null {
  const fieldText = `${target.label} ${target.inputType} ${target.autocomplete}`;
  if (action === "type") return CARD_FIELD.test(fieldText) || PASSWORD_FIELD.test(fieldText) || target.inputType === "password" ? "credentials" : null;
  const words = `${target.label} ${target.facts?.text || ""}`;
  const places = [target.url, target.review?.url, target.review?.destination, target.href].map(path).join(" ");
  const title = target.facts?.title || "";
  const cardFields = (target.facts?.cardFields || 0) > 0 || (target.review?.fields || []).some((field) => CARD_FIELD.test(field.label));
  if (MONEY_WORDS.test(words) || PRICE.test(words) || MONEY_PLACE.test(places) || MONEY_PLACE.test(title) || cardFields) return "money";
  if ((GONE.test(words) && !/\bremove (?:all )?filters?\b/i.test(words)) || SECURITY_PLACE.test(places) || SECURITY_PLACE.test(title) || /\bchange (?:my |your )?(?:password|email)\b/i.test(words)) return "gone-for-good";
  if (PUBLISH.test(words)) return "publishing";
  // A web page doesn't show the host who a message reaches, so a send asks.
  if (SEND.test(words)) return "new-person";
  return null;
}

const DEPLOY = /\b(?:vercel|netlify|flyctl|fly|wrangler|firebase|heroku|railway|serverless|sls|cdk|eb|amplify|surge|gh-pages)\b[^\n|;&]*\b(?:deploy|publish|--prod)\b|\bgcloud\b[^\n|;&]*\bdeploy\b|\baws\b[^\n|;&]*\bdeploy\b|\b(?:terraform|tofu|pulumi)\s+(?:apply|up)\b|\bkubectl\s+(?:apply|delete|rollout)\b|\bhelm\s+(?:install|upgrade)\b|\bdocker\s+push\b/i;

/** A terminal command (bash, code_run). Commands already can't be approved from the
 * review screen; this keeps an owner's "always allow" rule from covering them. */
export function commandHardStop(command: string): HardStop | null {
  if (/\bgit\s+push\b|\b(?:npm|yarn|pnpm|bun)\s+publish\b|\bgh\s+(?:pr\s+merge|release\s+create|repo\s+create)\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bpod\s+trunk\s+push\b/i.test(command) || DEPLOY.test(command)) return "publishing";
  if (/\brm\b|\brmdir\b|\bunlink\b|\bshred\b|\btruncate\b|\bfind\b[^\n]*-delete|\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f)|\bdropdb\b|\bdrop\s+(?:table|database)\b|\bmkfs\b|\bdiskutil\s+erase/i.test(command)) return "gone-for-good";
  if (/\bsecurity\s+(?:find|dump)-[a-z-]*password\b|\.ssh\/id_|\bkeychain\b/i.test(command)) return "credentials";
  return null;
}

/** Apps whose Send reaches people Sidemates can't check. */
const MESSAGING_APP = /^(?:messages|mail|whatsapp|telegram|signal|slack|discord|microsoft teams|teams|outlook|spark|messenger|wechat|line)$/i;

/** Every other mediated action that always asks, from its type and what the host
 * put in the review (the control's label for Mac app clicks). */
export function actionHardStop(input: { action: string; args?: Record<string, unknown>; reason?: string; label?: string }): HardStop | null {
  const { action, args = {} } = input;
  if (action === "code_publish_pr" || action === "github_issue_create") return "publishing";
  if (action === "bash" || action === "code_run") return commandHardStop(String(args.command || input.label || ""));
  const app = String(args.app || "");
  if (action === "mac_app_click") {
    const clicked = /“([^”]*)”/.exec(input.reason || "")?.[1] || "";
    if (MONEY_WORDS.test(clicked) || PRICE.test(clicked)) return "money";
    if (GONE.test(clicked)) return "gone-for-good";
    if (PUBLISH.test(clicked)) return "publishing";
    if (MESSAGING_APP.test(app) && SEND.test(clicked)) return "new-person";
    if (/^(?:finder|system settings|system preferences|keychain access|passwords)$/i.test(app) && /\b(?:empty|erase|delete|remove|password|security)\b/i.test(clicked)) return "gone-for-good";
  }
  if (action === "mac_app_key" && MESSAGING_APP.test(app)) {
    const key = String(args.key || "").toLowerCase(), modifiers = (Array.isArray(args.modifiers) ? args.modifiers : []).map(String).map((value) => value.toLowerCase());
    // Return sends in Messages and most chat apps; Command-Shift-D sends in Mail.
    if (/^(?:return|enter)$/.test(key) || (key === "d" && modifiers.includes("command") && modifiers.includes("shift"))) return "new-person";
  }
  if (action === "mac_app_type" && /^(?:keychain access|passwords)$/i.test(app)) return "credentials";
  return null;
}
