import type { GoogleApiRecovery } from "../shared/types.js";

const GOOGLE_APIS = {
  "gmail.googleapis.com": { service: "gmail", serviceName: "Gmail" },
  "drive.googleapis.com": { service: "google-drive", serviceName: "Google Drive" },
  "calendar-json.googleapis.com": { service: "google-calendar", serviceName: "Google Calendar" },
} as const;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function serviceIcon(service: GoogleApiRecovery["service"] | null) {
  if (service === "gmail") return '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#4285f4" d="M5 25V10.7l5.5 4.1V25z"/><path fill="#34a853" d="M21.5 25V14.8l5.5-4.1V25z"/><path fill="#fbbc04" d="M5 10.7V8.9c0-2 2.3-3.1 3.8-1.9l1.7 1.3v6.5z"/><path fill="#ea4335" d="M10.5 14.8V8.3l5.5 4.1 5.5-4.1v6.5L16 18.9z"/><path fill="#c5221f" d="M21.5 8.3 23.2 7c1.5-1.2 3.8-.1 3.8 1.9v1.8l-5.5 4.1z"/></svg>';
  if (service === "google-drive") return '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#0f9d58" d="M11.3 4h8.5l8.1 14-4.2 7.2z"/><path fill="#f4b400" d="M11.3 4 3.2 18l4.2 7.2 8.1-14z"/><path fill="#4285f4" d="M3.2 18h16.2l4.3 7.2H7.4z"/></svg>';
  if (service === "google-calendar") return '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#4285f4" d="M5 8h22v19H5z"/><path fill="#34a853" d="M5 5h11v6H5z"/><path fill="#fbbc04" d="M16 5h6v6h-6z"/><path fill="#ea4335" d="M22 5h5v6h-5z"/><path fill="#fff" d="M9 12h14v12H9z"/><path fill="#4285f4" d="M11 14h5v2h-3v1h2.5v2H13v1h3v2h-5v-2h2v-1h-2v-2h2v-1h-2zm7 0h3v8h-2v-6h-1z"/></svg>';
  return '<span aria-hidden="true">!</span>';
}

export function googleCloudProjectFromClientId(clientId: string | null | undefined) {
  const match = clientId?.trim().match(/^(\d+)-[a-z0-9-]+\.apps\.googleusercontent\.com$/i);
  return match?.[1] || null;
}

export function googleApiRecovery(message: string): GoogleApiRecovery | null {
  const urlMatch = message.match(/apis\/api\/(gmail\.googleapis\.com|drive\.googleapis\.com|calendar-json\.googleapis\.com)\/overview\?project=(\d+)/i);
  const sentenceMatch = message.match(/(Gmail|Google Drive|Google Calendar) API has not been used in project (\d+) before or it is disabled/i);
  let serviceId = urlMatch?.[1]?.toLowerCase() as keyof typeof GOOGLE_APIS | undefined;
  const projectId = urlMatch?.[2] || sentenceMatch?.[2];
  if (!serviceId && sentenceMatch) {
    serviceId = sentenceMatch[1].toLowerCase() === "gmail" ? "gmail.googleapis.com" : sentenceMatch[1].toLowerCase() === "google drive" ? "drive.googleapis.com" : "calendar-json.googleapis.com";
  }
  const definition = serviceId ? GOOGLE_APIS[serviceId] : null;
  if (!definition || !projectId) return null;
  return {
    service: definition.service,
    serviceName: definition.serviceName,
    projectId,
    enableUrl: `https://console.cloud.google.com/apis/library/${serviceId}?project=${encodeURIComponent(projectId)}`,
  };
}

export function friendlyGoogleError(message: string) {
  const recovery = googleApiRecovery(message);
  if (recovery) return `${recovery.serviceName} is turned off in Google Cloud. Turn it on, wait a minute, then connect again.`;
  if (/redirect_uri_mismatch/i.test(message)) return "Google needs the exact OpenBot callback address. Check the OAuth client, then connect again.";
  if (/access_denied|org_internal/i.test(message)) return "This Google app is limited to certain accounts. Allow your account in the OAuth consent settings, then connect again.";
  if (/expired|invalid_grant/i.test(message)) return "That Google sign-in expired. Start the connection again from OpenBot.";
  return "Google couldn’t finish the connection. Try connecting again.";
}

export function googleReturnUrl(appUrl: string, result: "connected" | "attention") {
  const url = new URL(appUrl);
  url.searchParams.set("panel", "connectors");
  url.searchParams.set("google", result);
  return url.toString();
}

export function googleCallbackPage(success: boolean, message: string) {
  const recovery = success ? null : googleApiRecovery(message);
  const title = success ? "Google is connected" : recovery ? `Turn on ${recovery.serviceName} to finish` : "Google needs another try";
  const description = success
    ? escapeHtml(message)
    : recovery
      ? `Your Google sign-in worked. ${escapeHtml(recovery.serviceName)} is still switched off for this Cloud project.`
      : escapeHtml(friendlyGoogleError(message));
  const action = recovery
    ? `<a class="primary" href="${escapeHtml(recovery.enableUrl)}" target="_blank" rel="noreferrer">Open Google Cloud <span aria-hidden="true">↗</span></a>`
    : "";
  const steps = recovery
    ? `<ol><li><b>Open Google Cloud</b><span>Press <strong>Enable</strong> for ${escapeHtml(recovery.serviceName)}.</span></li><li><b>Give it a moment</b><span>Google can take a minute to apply the change.</span></li><li><b>Connect once more</b><span>Return to OpenBot and choose <strong>Connect Google</strong> again.</span></li></ol>`
    : "";
  const details = !success && !recovery
    ? `<details><summary>Show technical details</summary><p>${escapeHtml(message)}</p></details>`
    : recovery ? `<small class="project">Cloud project ${escapeHtml(recovery.projectId)}</small>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2e2b28;background:radial-gradient(circle at 50% 0,#f0edff 0,transparent 34%),#f5f2ed}.card{width:min(560px,100%);padding:36px;overflow:hidden;border:1px solid #e7e1da;border-radius:30px;background:#fff;box-shadow:0 28px 80px #4b40351c;text-align:center}.icon{width:68px;height:68px;margin:auto;padding:16px;position:relative;display:grid;place-items:center;border:1px solid #eee9e3;border-radius:22px;background:#fff;box-shadow:0 12px 28px #3e342a18}.icon svg{width:100%;height:100%}.icon>span{font-size:28px;font-weight:700;color:#b55a50}.icon::after{width:19px;height:19px;position:absolute;right:-3px;top:-3px;display:grid;place-items:center;content:"✦";color:#fff;border:3px solid #fff;border-radius:50%;background:#6757d9;font-size:9px}h1{margin:21px 0 9px;font-size:clamp(26px,6vw,34px);line-height:1.08;letter-spacing:-.8px}p{margin:0 auto;max-width:440px;color:#817b73;font-size:15px;line-height:1.55;overflow-wrap:anywhere}ol{margin:25px 0 20px;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;list-style:none;text-align:left;counter-reset:step}li{min-width:0;padding:13px;border:1px solid #ece7e2;border-radius:16px;background:#faf9f7;counter-increment:step}li::before{width:23px;height:23px;margin-bottom:10px;display:grid;place-items:center;content:counter(step);color:#fff;border-radius:8px;background:#6757d9;font-size:11px;font-weight:750}li b,li span{display:block}li b{font-size:12px}li span{margin-top:4px;color:#8c867f;font-size:10px;line-height:1.45}.primary{min-height:48px;padding:0 20px;display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#fff;border-radius:14px;background:linear-gradient(135deg,#6c5bd8,#5545bd);box-shadow:0 11px 24px #5a49bd33;font-size:14px;font-weight:700;text-decoration:none}.project{margin-top:15px;display:block;color:#aaa49d;font-size:11px}details{margin-top:22px;padding:12px 14px;border-radius:14px;background:#f7f5f2;text-align:left}summary{color:#746e67;font-size:12px;font-weight:650;cursor:pointer}details p{margin-top:9px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:1.5}@media(max-width:560px){body{padding:12px}.card{padding:28px 20px;border-radius:24px}ol{grid-template-columns:1fr}li{display:grid;grid-template-columns:25px 1fr;column-gap:10px}li::before{grid-row:1/3;margin:0}li span{grid-column:2}}</style></head><body><main class="card"><div class="icon">${serviceIcon(success ? "gmail" : recovery?.service || null)}</div><h1>${escapeHtml(title)}</h1><p>${description}</p>${steps}${action}${details}</main></body></html>`;
}
