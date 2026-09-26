/** Turn on background notifications for this device. Shared by Settings and
 * the phone welcome, so both paths behave the same. */
export async function enablePushNotifications(): Promise<{ ok: boolean; message: string }> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, message: isIOS() && !isStandalone() ? "On iPhone, add OpenBot to your Home Screen first, then turn on notifications there." : "Background notifications are unavailable in this browser." };
  }
  if (await Notification.requestPermission() !== "granted") return { ok: false, message: "Notifications stayed off." };
  const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register("/sw.js");
  const keyResponse = await fetch("/api/notifications/key", { credentials: "same-origin" });
  if (!keyResponse.ok) throw new Error("Your studio couldn't set up notifications. Try again.");
  const { publicKey } = await keyResponse.json() as { publicKey: string };
  const encoded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const key = Uint8Array.from(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4)), (c) => c.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const saved = subscription.toJSON();
  if (!saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) throw new Error("This browser did not finish notification setup.");
  const response = await fetch("/api/notifications/subscriptions", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: saved.endpoint, keys: saved.keys }) });
  if (!response.ok) throw new Error("Your studio couldn't save this device for notifications.");
  try { localStorage.setItem("openbot_push_enabled", "1"); } catch { /* Storage can be off in private browsing. */ }
  return { ok: true, message: "Background notifications are on." };
}

export function pushEnabled() {
  try { return localStorage.getItem("openbot_push_enabled") === "1" && "Notification" in window && Notification.permission === "granted"; } catch { return false; }
}
export function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
export function isStandalone() { return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; }
