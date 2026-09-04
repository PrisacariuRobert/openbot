export function iosConnectURL(serverURL: string) {
  const parsed = new URL(serverURL);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid OpenBot server URL.");
  const origin = parsed.origin;
  const link = new URL("openbot://connect");
  link.searchParams.set("server", origin);
  return link.toString();
}

export function isTailscaleURL(serverURL: string) {
  let host: string;
  try { host = new URL(serverURL).hostname; }
  catch { return false; }
  const parts = host.split(".").map(Number);
  return parts.length === 4 && parts.every(Number.isInteger) && parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127;
}
