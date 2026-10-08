import { useEffect, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import type { Bot, MascotKind } from "../shared/types";
import { SPECIALISTS } from "../shared/first-run";
import { Character } from "./Character";
import { missingSpecialists } from "./first-run-steps";
import "./guided-first-run.css";

type Member = { key: string; name: string; role: string; mascot: MascotKind; color: string };

const BLURBS: Record<string, string> = {
  researcher: "Looks things up on the web and brings back sources you can check.",
  writer: "Drafts and polishes emails, posts and documents.",
};

/** Add a specialist when a job needs one, on the same AI as an existing
 * teammate. Nothing is added without the owner's click. */
export function AddSpecialist({ teammates, anchor, layout = "card", onAdded, onDismiss }: {
  teammates: Bot[]; anchor: Bot; layout?: "card" | "row"; onAdded: (bot: Bot) => void; onDismiss?: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void fetch("/api/team-templates", { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok || !live) return;
      const templates = await response.json() as Array<{ id: string; members: Array<Member & { key?: string }> }>;
      const starter = templates.find((template) => template.id === "starter-team");
      setMembers((starter?.members ?? []).filter((member): member is Member => Boolean(member.key && SPECIALISTS.includes(member.key as never))));
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const offers = members ? missingSpecialists(members, teammates) : [];
  if (!anchor.providerInstanceId || !anchor.model || !offers.length) return null;

  const add = async (member: Member) => {
    setBusy(member.key); setError("");
    try {
      const response = await fetch("/api/team-templates/starter-team/install", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerInstanceId: anchor.providerInstanceId, model: anchor.model, members: [{ key: member.key, browserEnabled: member.key === "researcher" }] }),
      });
      const result = await response.json().catch(() => ({})) as { bots?: Bot[]; error?: string };
      if (!response.ok || !result.bots?.[0]) throw new Error(result.error || `${member.name} couldn’t be added. Try again.`);
      onAdded(result.bots[0]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${member.name} couldn’t be added. Try again.`); }
    finally { setBusy(null); }
  };

  return <section className={`add-specialist is-${layout}`} aria-labelledby={`add-specialist-${layout}`}>
    <div className="add-specialist-head">
      <h3 id={`add-specialist-${layout}`}>Add a specialist when a job needs one</h3>
      {onDismiss && <button type="button" className="add-specialist-dismiss" aria-label="Not now" onClick={onDismiss}><X size={16} aria-hidden="true" /></button>}
    </div>
    <p>They use the same AI as {anchor.name}, and your teammates can ask each other for help.</p>
    <ul>
      {offers.map((member) => <li key={member.key}>
        <Character name={member.name} variant={member.mascot} color={member.color} size={36} />
        <span><strong>{member.name}, {member.role.toLowerCase()}</strong><small>{BLURBS[member.key] ?? member.role}</small></span>
        <button type="button" disabled={busy !== null} onClick={() => void add(member)}>{busy === member.key ? <LoaderCircle size={14} className="spinner" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}Add {member.name}</button>
      </li>)}
    </ul>
    {error && <p className="send-error" role="alert">{error}</p>}
  </section>;
}
