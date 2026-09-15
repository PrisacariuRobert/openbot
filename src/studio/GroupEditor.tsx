import { useState } from "react";
import { ArrowRight, Check, UsersRound } from "lucide-react";
import type { AppState } from "../shared/types";
import { Character } from "./Character";

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
    setMembers((current) =>
      current.includes(id)
        ? current.filter((member) => member !== id)
        : current.length >= 6
          ? current
          : [...current, id],
    );
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        editing
          ? `/api/threads/${encodeURIComponent(threadId!)}/group`
          : "/api/threads",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editing
              ? { ...(title ? { title } : {}), botIds: members }
              : { title, botIds: members },
          ),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "That room could not be saved.",
        );
      onOpen((data as { id: string }).id);
      onDone?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "That room could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-editor">
      <div className="group-editor-heading">
        <span className="group-editor-mark" aria-hidden="true">
          <UsersRound size={20} strokeWidth={1.6} />
        </span>
        <div>
          <p className="overline">{editing ? "PROJECT ROOM" : "NEW PROJECT ROOM"}</p>
          <h2 className="detail-title">{editing ? editing.title : "Bring the right people together"}</h2>
          <p className="drawer-intro">
            {editing
              ? "Change who is here for future work. Anything already running keeps its original team."
              : "Use a room when you want several teammates in the same ongoing conversation. For one quick opinion, just ask a teammate in chat."}
          </p>
        </div>
      </div>

      <label className="group-name">
        <span>Room name</span>
        <input
          value={title}
          maxLength={48}
          required
          placeholder="For example, OpenBot launch"
          aria-label="Room name"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className="group-members-heading">
        <span>Teammates</span>
        <small>{members.length} of 6 selected</small>
      </div>
      <div className="group-members" role="group" aria-label="Room teammates">
        {state.bots.map((bot) => {
          const chosen = members.includes(bot.id);
          return (
            <button
              type="button"
              key={bot.id}
              className={chosen ? "group-member chosen" : "group-member"}
              aria-pressed={chosen}
              onClick={() => toggle(bot.id)}
            >
              <Character
                name={bot.name}
                color={bot.color}
                variant={bot.mascot}
                status={bot.status}
                size={38}
              />
              <span className="group-member-copy">
                <strong>{bot.name}</strong>
                <small>{bot.role}</small>
              </span>
              <span className="group-member-check" aria-hidden="true">
                <Check size={14} />
              </span>
            </button>
          );
        })}
      </div>

      {members.length >= 6 && state.bots.length > 6 && (
        <p className="boundary-note">A project room can include up to six teammates.</p>
      )}
      {error && <p className="extension-error" role="alert">{error}</p>}
      <button
        className="primary full-width"
        disabled={busy || !title.trim() || !members.length}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : editing ? "Save changes" : "Create room"}
        {!busy && <ArrowRight size={15} />}
      </button>
    </div>
  );
}
