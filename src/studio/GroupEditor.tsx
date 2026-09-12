import { useState } from "react";
import { ArrowRight, Check, UsersRound } from "lucide-react";
import type { AppState } from "../shared/types";

/** Create or edit an optional project room: the owner picks the teammates; the
 * room keeps them. Mentions and the usual approvals still decide what happens. */
export function GroupEditor({
  state,
  threadId,
  onDone,
  onOpen,
}: {
  state: AppState;
  threadId?: string;
  onDone?: () => void;
  onOpen: (threadId: string) => void;
}) {
  const editing = threadId ? state.threads.find((thread) => thread.id === threadId) : undefined;
  const [title, setTitle] = useState(editing?.title || "");
  const [members, setMembers] = useState<string[]>(editing?.botIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (id: string) => {
    setMembers((current) => (current.includes(id) ? current.filter((member) => member !== id) : current.length >= 6 ? current : [...current, id]));
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(editing ? `/api/threads/${encodeURIComponent(threadId!)}/group` : "/api/threads", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...(title ? { title } : {}), botIds: members } : { title, botIds: members }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "That group could not be saved.");
      onOpen((data as { id: string }).id);
      onDone?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That group could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="group-editor">
      <p className="overline">{editing ? "PROJECT ROOM" : "NEW PROJECT ROOM"}</p>
      <h2 className="detail-title">{editing ? editing.title : "Project room"}</h2>
      <p className="drawer-intro">
        {editing
          ? "Rename the project room or change its teammates. Members change affects future tasks; running work keeps going."
          : "Project rooms are optional shared conversations for project decisions and files. No room is needed for bots to ask each other for help."}
      </p>
      <label className="group-name">
        <UsersRound size={15} />
        <input
          value={title}
          maxLength={48}
          required
          placeholder="Room name"
          aria-label="Room name"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="group-members" role="group" aria-label="Room teammates">
        {state.bots.map((bot) => (
          <button
            type="button"
            key={bot.id}
            className={members.includes(bot.id) ? "group-member chosen" : "group-member"}
            aria-pressed={members.includes(bot.id)}
            onClick={() => toggle(bot.id)}
          >
            <Check size={14} />
            <strong>{bot.name}</strong>
            <small>{bot.role}</small>
          </button>
        ))}
      </div>
      {error && <p className="extension-error" role="alert">{error}</p>}
      <button
        className="primary full-width"
        disabled={busy || !title.trim() || !members.length}
        onClick={() => void save()}
      >
        {editing ? "Save changes" : "Create room"} <ArrowRight size={15} />
      </button>
    </div>
  );
}
