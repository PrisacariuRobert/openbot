import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BringYourAI } from "../components/BringYourAI";

/** A new studio with no teammates. Nobody fills in a form: as soon as an AI
 * is connected, the starter team is created on Automatic and the studio moves
 * on to what's waiting. Without an AI, the one step left is connecting one. */
export function FirstRun({ onTeamReady, onMakeOwn, onBringTeam, bringLabel }: {
  onTeamReady: () => void;
  onMakeOwn: () => void;
  onBringTeam: () => void;
  bringLabel: string;
}) {
  const [phase, setPhase] = useState<"finding" | "needs-ai" | "creating" | "error">("finding");
  const [error, setError] = useState("");
  const creating = useRef(false);

  const check = async () => {
    if (creating.current) return;
    setPhase("finding");
    setError("");
    try {
      const status = await (await fetch("/api/provider", { credentials: "same-origin" })).json() as { instances?: Array<{ connected?: boolean; models?: string[] }> };
      if (!(status.instances || []).some((instance) => instance.connected && (instance.models || []).length)) { setPhase("needs-ai"); return; }
      creating.current = true;
      setPhase("creating");
      const response = await fetch("/api/team-templates/your-team/install", { method: "POST", credentials: "same-origin" });
      // 409: the team is already here (another window got there first).
      if (!response.ok && response.status !== 409) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Your team couldn't be created. Nothing was changed.");
      onTeamReady();
    } catch (failure) {
      creating.current = false;
      setError(failure instanceof Error ? failure.message : "Your team couldn't be created.");
      setPhase("error");
    }
  };
  useEffect(() => { void check(); }, []);

  return <div className="welcome-start first-run" aria-live="polite">
    {phase === "needs-ai" ? <>
      <h2>One step:<br />connect an AI.</h2>
      <p>Your team works on an AI you already have, such as ChatGPT, Claude or Gemini. Connect one and they're ready.</p>
      <BringYourAI compact onConnected={() => void check()} />
    </> : phase === "error" ? <>
      <h2>Almost there.</h2>
      <p role="alert">{error}</p>
      <button className="primary" onClick={() => void check()}>Try again <ArrowRight size={16} /></button>
    </> : <>
      <h2>Getting your<br />team ready…</h2>
      <p>Nova looks after your inbox, Pixel your invoices and receipts, Scout your calendar.</p>
    </>}
    <p className="first-run-honest">AI can make mistakes. Your team shows its sources and asks before anything important.</p>
    <div className="first-run-other">
      <button type="button" onClick={onMakeOwn}>Make your own teammate</button>
      <button type="button" onClick={onBringTeam}>{bringLabel}</button>
    </div>
    <small>Your team lives on this Mac. What you ask goes only to the AI you connect.</small>
  </div>;
}
