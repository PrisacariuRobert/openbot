import { useState } from "react";
import { Check, Globe2 } from "lucide-react";
import { galleryIssueUrl } from "../shared/gallery-submission";
import "./submit-to-gallery.css";

/** Task R3: open GitHub's gallery form, filled in with this teammate. Sidemates sends
 * nothing; the owner reads it and submits it on GitHub, where it becomes public. */
export function SubmitToGallery({ botId }: { botId: string }) {
  const [note, setNote] = useState("");
  const open = async () => {
    setNote("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/share`, { credentials: "same-origin" });
      const bundle = await response.json().catch(() => ({})) as { error?: string; bot?: { name: string }; about?: string };
      if (!response.ok || !bundle.bot) throw new Error(bundle.error || "This teammate couldn't be prepared for the gallery.");
      const json = JSON.stringify(bundle, null, 2);
      const form = galleryIssueUrl({ bot: bundle.bot, about: bundle.about }, json);
      if (!form.includesFile) {
        try { await navigator.clipboard.writeText(json); } catch { /* the note says where to get it */ }
      }
      window.open(form.url, "_blank", "noopener");
      setNote(form.includesFile ? "The form opened on GitHub. Read it, then submit it there: it becomes public." : "The form opened on GitHub, and the teammate file is copied: paste it into “Teammate file”, read it, then submit.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "This teammate couldn't be prepared for the gallery.");
    }
  };
  return (
    <>
      <button type="button" onClick={() => void open()} title="Opens a public GitHub form, filled in. Nothing is sent until you submit it there.">
        {note && !note.startsWith("This teammate") ? <Check size={15} /> : <Globe2 size={15} />}
        Submit to the gallery
      </button>
      {note && <small className="gallery-submit-note" role="status">{note}</small>}
    </>
  );
}
