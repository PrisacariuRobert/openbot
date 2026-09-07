import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { DevicePairing, pairingLink } from "./device-pairing.js";
import { AwayAccess } from "./away-access.js";
import { LoginAttemptGate, trustedLocalRequest } from "./auth-security.js";

export function registerPairingRoutes(app: Express, devices: DevicePairing, away: AwayAccess, revokeStreams: (id: string) => void) {
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
  app.get("/api/access/away", localOnly, async (_req, res) => { res.json({ ...await away.status(), devices: devices.list() }); });
  app.post("/api/access/pairing", localOnly, async (_req, res) => {
    const state = await away.status();
    if (!state.ready || !state.url) return res.status(409).json({ error: state.detail });
    const invitation = devices.invite();
    const link = pairingLink(state.url, invitation.ticket);
    const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 4, width: 320 });
    res.json({ link, qr, expiresAt: invitation.expiresAt });
  });
  app.delete("/api/access/pairing", localOnly, (_req, res) => { devices.cancel(); res.json({ ok: true }); });
  app.delete("/api/access/devices/:id", localOnly, (req, res) => {
    const id = String(req.params.id);
    const revoked = devices.revoke(id);
    if (revoked) revokeStreams(id);
    res.status(revoked ? 200 : 404).json(revoked ? { ok: true } : { error: "That phone is already disconnected." });
  });
}
