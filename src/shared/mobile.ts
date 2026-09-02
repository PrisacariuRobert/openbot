export function iosConnectURL(serverURL: string) {
  const parsed = new URL(serverURL);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid OpenBot server URL.");
  const origin = parsed.origin;
  const link = new URL("openbot://connect");
  link.searchParams.set("server", origin);
  return link.toString();
}
