import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { teammateLink } from "../shared/teammate-link";

/** One tap to a link anyone can open: the teammate's name, face, job and
 * instructions travel inside the link itself, never through a server. */
export function CopyShareLink({ botId }: { botId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/share`, { credentials: "same-origin" });
      const value = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(value.error || "This teammate could not be shared.");
      const link = await teammateLink(value);
      try { await navigator.clipboard.writeText(link); }
      catch { window.prompt("Copy this link:", link); }
      setState("copied");
    } catch (error) {
      setState("error");
      window.alert(error instanceof Error ? error.message : "This teammate could not be shared.");
    }
    window.setTimeout(() => setState("idle"), 2_500);
  };
  return (
    <button type="button" onClick={() => void copy()}>
      {state === "copied" ? <Check size={15} /> : <Link2 size={15} />}
      {state === "copied" ? "Link copied" : "Copy share link"}
    </button>
  );
}
