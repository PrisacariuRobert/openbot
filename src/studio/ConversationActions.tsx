import { useEffect, useId, useRef, useState } from "react";
import { Archive, Info, Layers3, MoreHorizontal } from "lucide-react";
import type { Bot, Thread } from "../shared/types";
import "./conversation-actions.css";

export function ConversationActions({
  thread,
  bot,
  onDetails,
  onWorkspace,
  onRemoved,
}: {
  thread: Thread;
  bot?: Bot;
  onDetails: () => void;
  onWorkspace: () => void;
  onRemoved: (botId: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const removing = useRef(false);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const focusFirst = () => requestAnimationFrame(() => popover.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
  const close = () => {
    if (popover.current?.matches(":popover-open")) popover.current.hidePopover();
  };
  const choose = (action: () => void) => {
    close();
    action();
  };
  const toggle = () => {
    const menu = popover.current, button = trigger.current;
    if (!menu || !button) return;
    if (menu.matches(":popover-open")) return menu.hidePopover();
    const bounds = button.getBoundingClientRect();
    menu.style.setProperty("--conversation-actions-top", `${bounds.bottom + 8}px`);
    menu.style.setProperty("--conversation-actions-left", `${Math.max(12, bounds.right - 280)}px`);
    if (!removing.current) { setRemoveTarget(null); setError(""); }
    menu.showPopover();
  };
  useEffect(() => {
    if (!open) return;
    focusFirst();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      trigger.current?.focus();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [open, removeTarget]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function remove() {
    const target = removeTarget;
    if (!target || removing.current || target.id !== bot?.id) return;
    removing.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(target.id)}/retire`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json().catch(() => ({})) as { error?: string; bot?: { id?: string } };
      if (!response.ok) throw new Error(result.error || `Could not remove ${target.name}.`);
      if (result.bot?.id !== target.id) throw new Error(`OpenBot did not confirm removing ${target.name}. Refresh before trying again.`);
      if (!mounted.current) return;
      close();
      onRemoved(target.id);
    } catch (cause) {
      removing.current = false;
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : `Could not remove ${target.name}. Nothing was changed.`);
      setBusy(false);
    }
  }

  return (
    <span className="conversation-actions">
      <button ref={trigger} type="button" aria-label="Conversation actions" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={toggle}>
        <MoreHorizontal size={20} strokeWidth={1.5} />
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        className="conversation-actions-popover"
        role={removeTarget ? "dialog" : "menu"}
        aria-label={removeTarget ? `Remove ${removeTarget.name}` : `Actions for ${thread.title}`}
        onToggle={(event) => {
          const shown = event.currentTarget.matches(":popover-open");
          setOpen(shown);
          if (!shown && !removing.current) { setRemoveTarget(null); setError(""); setBusy(false); }
        }}
        onKeyDown={(event) => {
          if (removeTarget || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
          if (!items.length) return;
          event.preventDefault();
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length;
          items[next]?.focus();
        }}
      >
        {removeTarget ? (
          <div className="conversation-remove-confirm">
            <strong>Remove {removeTarget.name} from your team?</strong>
            <p>Active work will stop and the seat is freed. Conversations, results, files, and private browser data stay recoverable in Settings → Permissions & usage → Teammates.</p>
            {error && <p className="conversation-actions-error" role="alert">{error}</p>}
            <div>
              <button type="button" disabled={busy} onClick={() => { setRemoveTarget(null); setError(""); }}>Cancel</button>
              <button type="button" className="conversation-remove-confirm-button" disabled={busy} onClick={() => void remove()}>
                <Archive size={15} /> {busy ? "Removing…" : "Remove from team"}
              </button>
            </div>
          </div>
        ) : (
          <div className="conversation-actions-menu">
            <button type="button" role="menuitem" onClick={() => choose(onDetails)}><Info size={17} /><span>Conversation details</span></button>
            <button type="button" role="menuitem" onClick={() => choose(onWorkspace)}><Layers3 size={17} /><span>Workspace</span></button>
            {bot && <button type="button" role="menuitem" className="conversation-remove-item" onClick={() => { setRemoveTarget({ id: bot.id, name: bot.name }); setError(""); }}><Archive size={17} /><span>Remove teammate…</span></button>}
          </div>
        )}
      </div>
    </span>
  );
}
