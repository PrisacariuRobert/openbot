/**
 * Browser status is presentation, not a grant. Keep connector denials ahead of
 * available browser alternatives, and never infer a verified website login.
 */
export function browserServiceLabel(service, access) {
  if (service.connectorState === "read-denied") return "Reading turned off";
  if (service.preferred === "connector") return "Connection available";
  if (!access.browserEnabled) return "Browser off";
  if (access.runtimeAvailable === false) return "Browser needs setup";
  if (service.preferred === "browser") return "Browser option";
  return "Needs setup";
}

export function browserAccessMatchesRequest(payload, expectedBotId) {
  return !!payload &&
    typeof payload === "object" &&
    payload.botId === expectedBotId &&
    typeof payload.browserEnabled === "boolean" &&
    Array.isArray(payload.services) &&
    payload.services.every(service =>
      service && typeof service === "object" &&
      typeof service.service === "string" &&
      typeof service.label === "string" &&
      typeof service.connectorState === "string" &&
      typeof service.browserState === "string" &&
      typeof service.preferred === "string"
    );
}
