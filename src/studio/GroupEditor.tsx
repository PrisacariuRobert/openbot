import { useState } from "react";
import { ArrowRight, Check, UsersRound } from "lucide-react";
import type { AppState } from "../shared/types";

/** Existing multi-teammate conversations remain editable for recovery. New
 * work starts in a direct chat; teammates can coordinate there privately. */
export function GroupEditor({
  state,
  threadId,
  onDone,
  onOpen,
}: {
  state: AppState;
  threadId: string;
  onDone?: () => void;
  onOpen: (threadId: string) => void;
}) {
  const editing = state.threads.find((thread) => thread.id === threadId);
  const [title, setTitle] = useState(editing?.title || "");
  const [members, setMembers] = useState<string[]>(editing?.botIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (id: string) => {
    setMembers((current) => (current.includes(id) ? current.filter((member) => member !== id) : current.length >= 6 ? current : [...current, id]));
  };
  const save = async () => {
    if (busy || !editing) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/group`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, botIds: members }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "That conversation could not be saved.");
      onOpen((data as { id: string }).id);
      onDone?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That shared chat could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="group-editor">
      {!editing ? <><p className="drawer-intro">This conversation is no longer available.</p><button onClick={onDone}>Back to chats</button></> : <>
      <h2 className="detail-title">{editing.title}</h2>
      <p className="drawer-intro">Rename this existing conversation or change who can join future work. Work already running keeps its current participants.</p>
      <label className="group-name">
        <UsersRound size={15} />
        <input
          value={title}
          maxLength={48}
          required
          placeholder="Chat name"
          aria-label="Chat name"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="group-members" role="group" aria-label="Shared chat teammates">
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
        disabled={busy || !title.trim() || members.length < 1}
        onClick={() => void save()}
      >
        Save conversation <ArrowRight size={15} />
      </button>
      </>}
    </div>
  );
}
