import { useEffect, useState } from "react";
import { CheckCircle2, Globe2, LoaderCircle, QrCode, Smartphone } from "lucide-react";
import "./away-access-panel.css";

type Device = { id: string; name: string; revokedAt: number | null; lastUsedAt: number };
type Status = { ready: boolean; detail: string; checkedAt: number; devices: Device[] };
type Invitation = { qr: string; expiresAt: number };
async function request<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(`/api/access${path}`, { method, credentials: "same-origin" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "This connection needs attention.");
  return value as T;
}

export function AwayAccessPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  async function refresh() {
    setBusy(true); setError("");
    try { const result = await request<Status>("/away"); setStatus(result); if (!result.ready) setInvitation(null); }
    catch (error) { setError(error instanceof Error ? error.message : "Open this panel on your Mac."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!invitation) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [invitation]);
  async function showCode() {
    setBusy(true); setError("");
    try { setInvitation(await request<Invitation>("/pairing", "POST")); setNow(Date.now()); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not prepare a code."); }
    finally { setBusy(false); }
  }
  async function revoke(device: Device) {
    if (!window.confirm(`Disconnect ${device.name}? It will need a new QR code to use your studio again.`)) return;
    try { await request(`/devices/${device.id}`, "DELETE"); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not disconnect this phone."); }
  }
  const seconds = invitation ? Math.max(0, Math.ceil((invitation.expiresAt - now) / 1000)) : 0;
  return <section className="away-pairing" aria-label="Away access">
    <div className="away-pairing-heading"><span className="away-pairing-icon"><Globe2 size={23} /></span><div>
      <h3>{status?.ready ? "Away access is ready" : "Your studio, wherever you are"}</h3>
      <p>Just OpenBot on your Mac and iPhone. No extra apps.</p>
    </div></div>
    <div className={`away-pairing-state ${status?.ready ? "ready" : ""}`}>
      {busy ? <LoaderCircle className="spinner" size={19} /> : status?.ready ? <CheckCircle2 size={19} /> : <Globe2 size={19} />}
      <div><strong>{status?.ready ? "Secure connection checked" : status ? "Relay setup is still needed" : "Checking your connection…"}</strong>
      <p>{status?.detail || "Checking the studio address and access protection."}</p></div>
    </div>
    {status?.ready && <>
      {invitation && seconds > 0 ? <div className="away-qr">
        <img src={invitation.qr} width="240" height="240" alt="Scan this code with OpenBot on your iPhone to pair it with this studio" />
        <div><h4>Scan. Connect. You’re in.</h4><p>On your iPhone, open OpenBot and choose <strong>Scan my Mac’s QR code</strong>.</p><small>Single-use invitation · expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</small>
        <button onClick={() => { setInvitation(null); void request("/pairing", "DELETE").catch(() => {}); }}>Hide and cancel code</button></div>
      </div> : <button className="away-pairing-primary" onClick={() => void showCode()} disabled={busy}><QrCode size={18} />{invitation ? "Show a new QR code" : "Connect my iPhone"}</button>}
    </>}
    {error && <p className="away-pairing-error" role="alert">{error}</p>}
    <div className="away-pairing-footer"><small>Your Mac must stay awake and online. A private always-on host can work while it is off.</small><button onClick={() => void refresh()} disabled={busy}>Check again</button></div>
    {!!status?.devices.filter((device) => !device.revokedAt).length && <div className="away-devices"><h4>Connected phones</h4>{status.devices.filter((device) => !device.revokedAt).map((device) => <div key={device.id}><Smartphone size={20} /><span><strong>{device.name}</strong><small>Last connected {new Date(device.lastUsedAt).toLocaleString()}</small></span><button onClick={() => void revoke(device)}>Disconnect</button></div>)}</div>}
  </section>;
}
