import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { DevicePairing, newBrowserDeviceKey, pairingLink, webPairingLink } from "./device-pairing.js";
import { AwayAccess } from "./away-access.js";
import { LoginAttemptGate, trustedLocalRequest } from "./auth-security.js";
import { shortcutPlist, signedShortcut } from "./siri-shortcut.js";

export function registerPairingRoutes(app: Express, devices: DevicePairing, away: AwayAccess, revokeStreams: (id: string) => void, sessionCookie: (req: Request, value: string) => string) {
  const gate = new LoginAttemptGate(30, 60_000);
  const localOnly = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!trustedLocalRequest(req)) return res.status(403).json({ error: "Manage phone connections from OpenBot on this host." });
    next();
  };
  app.get("/api/auth/pairing-probe", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ studio: away.probeIdentity }); });
  // Deliberately not exempt from authentication. Readiness checks must get 401.
  app.get("/api/auth/pairing-guard", (_req, res) => res.sendStatus(204));
  app.post("/api/auth/pair", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const peer = req.socket.remoteAddress || "unknown";
    const allowed = gate.check(peer);
    if (!allowed.allowed) { res.setHeader("Retry-After", String(allowed.retryAfterSeconds)); return res.status(429).json({ error: "Wait a moment before scanning again." }); }
    const parsed = z.object({ ticket: z.string().length(43), deviceKey: z.string().length(47), name: z.string().max(100) }).strict().safeParse(req.body);
    const result = parsed.success ? devices.redeem(parsed.data.ticket, parsed.data.deviceKey, parsed.data.name) : null;
    if (!result) { gate.failed(peer); return res.status(401).json({ error: "This QR code has expired or was already used. Show a new code on your Mac." }); }
    gate.succeeded(peer);
    res.json({ ok: true, ...result });
  });
  // The phone's camera opens the studio in its browser; the page posts the
  // ticket from the link's fragment and receives a device session cookie.
  app.post("/api/auth/pair-browser", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const peer = req.socket.remoteAddress || "unknown";
    const allowed = gate.check(peer);
    if (!allowed.allowed) { res.setHeader("Retry-After", String(allowed.retryAfterSeconds)); return res.status(429).json({ error: "Wait a moment before scanning again." }); }
    const parsed = z.object({ ticket: z.string().length(43), name: z.string().max(100) }).strict().safeParse(req.body);
    const key = newBrowserDeviceKey();
    const result = parsed.success ? devices.redeem(parsed.data.ticket, key, parsed.data.name) : null;
    if (!result) { gate.failed(peer); return res.status(401).json({ error: "This code has expired or was already used." }); }
    gate.succeeded(peer);
    res.setHeader("Set-Cookie", sessionCookie(req, key));
    res.json({ ok: true });
  });
  app.get("/api/access/away", localOnly, async (_req, res) => { res.json({ ...await away.status(), devices: devices.list() }); });
  app.post("/api/access/pairing", localOnly, async (_req, res) => {
    const state = await away.status();
    if (!state.ready || !state.url) return res.status(409).json({ error: state.detail });
    const invitation = devices.invite();
    // A shared relay never accepts cookies, so only the app can pair there;
    // the studio's own address pairs straight from the phone's camera.
    const browser = !/\/s\/[a-f0-9]{24}\/?$/.test(state.url);
    const appLink = pairingLink(state.url, invitation.ticket);
    const link = browser ? webPairingLink(state.url, invitation.ticket) : appLink;
    const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 4, width: 320 });
    res.json({ link, appLink, browser, qr, expiresAt: invitation.expiresAt });
  });
  app.delete("/api/access/pairing", localOnly, (_req, res) => { devices.cancel(); res.json({ ok: true }); });
  // "Hey Siri, Ask OpenBot": a one-time link the iPhone opens to import a
  // signed Shortcut carrying its own device key (listed as "Siri", revocable).
  app.post("/api/access/siri", localOnly, async (_req, res) => {
    const state = await away.status();
    if (!state.ready || !state.url) return res.status(409).json({ error: state.detail || "Turn on Away access first so your iPhone can reach this Mac." });
    const invitation = devices.invite();
    const link = `${state.url.replace(/\/$/, "")}/api/auth/siri-shortcut?ticket=${encodeURIComponent(invitation.ticket)}`;
    res.json({ link, qr: await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 4, width: 320 }), expiresAt: invitation.expiresAt });
  });
  app.get("/api/auth/siri-shortcut", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const peer = req.socket.remoteAddress || "unknown";
    const allowed = gate.check(peer);
    if (!allowed.allowed) return res.status(429).send("Wait a moment and try again.");
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
    const state = await away.status();
    if (!state.url) return res.status(409).send("Away access is off on the Mac.");
    const key = newBrowserDeviceKey();
    const result = ticket.length === 43 ? devices.redeem(ticket, key, "Siri") : null;
    if (!result) { gate.failed(peer); return res.status(401).send("This link has expired or was already used. Make a new one on your Mac."); }
    gate.succeeded(peer);
    try {
      const file = await signedShortcut(shortcutPlist({ askUrl: `${state.url.replace(/\/$/, "")}/api/ask`, deviceKey: key }));
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", 'attachment; filename="Ask OpenBot.shortcut"');
      res.send(file);
    } catch (error) {
      devices.revoke(result.deviceId);
      res.status(500).send(error instanceof Error ? `The shortcut couldn't be made: ${error.message}` : "The shortcut couldn't be made.");
    }
  });
  app.delete("/api/access/devices/:id", localOnly, (req, res) => {
    const id = String(req.params.id);
    const revoked = devices.revoke(id);
    if (revoked) revokeStreams(id);
    res.status(revoked ? 200 : 404).json(revoked ? { ok: true } : { error: "That phone is already disconnected." });
  });
}
