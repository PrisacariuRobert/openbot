/** Only a public origin belongs in a saved handoff, never a login URL's tokens. */
export function signInOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.username || url.password || !(url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Sign-in needs a secure website. Open its HTTPS address first.");
  }
  return url.origin;
}

export interface BrowserSignInHandoff { botId: string; siteOrigin: string }
