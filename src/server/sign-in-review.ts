/** Pre-handoff review of a sign-in request: cheap, local checks that catch
 * the obvious tells before the owner types anything. This is advice attached
 * to the pane, not a block — the owner decides. */

const KNOWN_PROVIDER_HOSTS = [
  "accounts.google.com", "google.com", "apple.com", "id.apple.com", "github.com",
  "login.microsoftonline.com", "login.live.com", "microsoft.com", "okta.com",
  "x.com", "twitter.com", "facebook.com", "amazon.com", "dropbox.com", "notion.so",
];

export interface SignInReview {
  level: "ok" | "warn";
  reason: string | null;
}

export function reviewSignInRequest(rawUrl: string): SignInReview {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { level: "warn", reason: "The sign-in address could not be read. Do not enter anything." };
  }
  if (url.username || url.password) return { level: "warn", reason: "This address embeds a username or password in the URL — a common phishing trick. Do not enter anything." };
  if (url.protocol !== "https:") return { level: "warn", reason: "This page is not encrypted (no https). Do not enter a password here." };
  const host = url.hostname.toLowerCase();
  if (host.startsWith("xn--") || host.split(".").some((label) => label.startsWith("xn--"))) return { level: "warn", reason: "This address uses an encoded (punycode) name that can imitate a real site. Check it character by character." };
  const lookalike = KNOWN_PROVIDER_HOSTS.find((known) => isLookalike(host, known));
  if (lookalike) return { level: "warn", reason: `This address mimics ${lookalike} without being it. Compare it character by character before signing in.` };
  return { level: "ok", reason: null };
}

function isLookalike(host: string, known: string): boolean {
  if (host === known || host.endsWith(`.${known}`)) return false;
  const knownLabels = known.split(".");
  const hostLabels = host.split(".");
  // The known domain hidden mid-host ("google.com.evil.io") is always a tell.
  for (let start = 0; start + knownLabels.length <= hostLabels.length; start++) {
    if (knownLabels.every((label, index) => hostLabels[start + index] === label)) return true;
  }
  // The shared tail: everything past the TLD for three-label knowns
  // (accounts.google.com → .google.com), just the TLD for two-label ones.
  const tail = knownLabels.slice(knownLabels.length > 2 ? -2 : -1).join(".");
  if (!host.endsWith(`.${tail}`)) return false;
  const hostName = host.slice(0, -(tail.length + 1)).replace(/[^a-z0-9]/g, "");
  const knownName = (knownLabels.length > 2 ? knownLabels.slice(0, -2).join(".") : knownLabels[0]!).replace(/[^a-z0-9]/g, "");
  if (!hostName || knownName.length < 4) return false;
  return hostName.includes(knownName) || editDistanceWithin(hostName, knownName, 2);
}

function editDistanceWithin(left: string, right: string, limit: number): boolean {
  const a = left.replace(/-/g, "");
  const b = right.replace(/[-.]/g, "");
  if (Math.abs(a.length - b.length) > limit) return false;
  const previous = new Array(b.length + 1).fill(0).map((_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]!;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length]! <= limit;
}
