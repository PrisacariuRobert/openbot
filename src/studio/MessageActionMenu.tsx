import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Eye, Heart, MoreHorizontal, PartyPopper, Reply, ThumbsUp } from "lucide-react";
import type { Message } from "../shared/types";

/** Wire values match the existing reactions API; UI uses monochrome symbols. */
export const messageReactions = [
  { value: "👍", label: "Like", Icon: ThumbsUp },
  { value: "❤️", label: "Love", Icon: Heart },
  { value: "✅", label: "Agree", Icon: Check },
  { value: "👀", label: "Looking", Icon: Eye },
  { value: "🎉", label: "Celebrate", Icon: PartyPopper },
] as const;
export type MessageReactionValue = typeof messageReactions[number]["value"];

type Props = {
  message: Message;
  onReply: () => void;
  onReact: (value: MessageReactionValue) => Promise<void>;
  disabled?: boolean;
};

/** A top-layer popover, not an overlay that replays or approves work.
 * Mouse, keyboard, long-press and swipe all invoke the same real callbacks.
 */
export function MessageActionMenu({ message, onReply, onReact, disabled = false }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReply, onReact, disabled });
  callbacks.current = { onReply, onReact, disabled };
  const busy = useRef(false);
  const mounted = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const close = (restoreFocus = false) => {
    if (panel.current?.matches(":popover-open")) panel.current.hidePopover();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const show = (x?: number, y?: number) => {
    const node = panel.current, button = trigger.current;
    if (!node || !button) return;
    const bounds = button.getBoundingClientRect();
    setError(""); setFeedback("");
    const width = Math.min(276, window.innerWidth - 24);
    node.style.width = `${width}px`;
    node.style.left = `${Math.max(12, Math.min(x ?? bounds.right - width, window.innerWidth - width - 12))}px`;
    node.style.top = `${Math.max(12, y ?? bounds.bottom + 6)}px`;
    if (!node.matches(":popover-open")) node.showPopover();
    const size = node.getBoundingClientRect();
    node.style.top = `${Math.max(12, Math.min(y ?? bounds.bottom + 6, window.innerHeight - size.height - 12))}px`;
    setOpen(true);
    requestAnimationFrame(() => node.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    mounted.current = true;
    const owner = root.current?.closest<HTMLElement>("[data-message-id]");
    if (!owner) return () => { mounted.current = false; };
    let press: ReturnType<typeof setTimeout> | undefined;
    let gesture: { id: number; x: number; y: number; moved: boolean } | null = null;
    let suppressUntil = 0;
    const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest("a,button,input,textarea,select,summary,[contenteditable='true']");
    const cancel = () => { clearTimeout(press); gesture = null; owner.style.removeProperty("--ob-reply-offset"); owner.classList.remove("ob-reply-drag"); };
    const context = (event: MouseEvent) => {
      if (interactive(event.target) || window.getSelection()?.toString()) return;
      event.preventDefault(); event.stopPropagation(); show(event.clientX, event.clientY);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary || interactive(event.target)) return;
      cancel(); gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      press = setTimeout(() => {
        if (!gesture || window.getSelection()?.toString()) return;
        const {x, y} = gesture; cancel(); suppressUntil = Date.now() + 750; show(x, y);
      }, 500);
    };
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.hypot(dx,dy) > 9) clearTimeout(press);
      if (Math.abs(dy) > Math.max(18, Math.abs(dx))) { cancel(); return; }
      if (dx > 16 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        gesture.moved = true;
        owner.classList.add("ob-reply-drag");
        owner.style.setProperty("--ob-reply-offset", `${Math.min(44, dx * .5)}px`);
      }
    };
    const up = (event: PointerEvent) => {
      const start = gesture; cancel();
      if (start && start.id === event.pointerId && start.moved && event.clientX - start.x > 64 && Math.abs(event.clientY - start.y) < 30) {
        suppressUntil = Date.now() + 750; callbacks.current.onReply();
      }
    };
    const click = (event: MouseEvent) => {
      if (Date.now() < suppressUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    owner.classList.add("ob-message-interactive");
    owner.addEventListener("contextmenu", context);
    owner.addEventListener("pointerdown", down, {passive:true});
    owner.addEventListener("pointermove", move, {passive:true});
    owner.addEventListener("pointerup", up, {passive:true});
    owner.addEventListener("pointercancel", cancel, {passive:true});
    owner.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    return () => {
      mounted.current = false; cancel(); owner.classList.remove("ob-message-interactive");
      owner.removeEventListener("contextmenu", context); owner.removeEventListener("pointerdown", down);
      owner.removeEventListener("pointermove", move); owner.removeEventListener("pointerup", up);
      owner.removeEventListener("pointercancel", cancel); owner.removeEventListener("click", click, true);
      window.removeEventListener("blur", cancel);
    };
  }, [message.id]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => close(false);
    const scrolled = (event: Event) => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) dismiss(); };
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", dismiss); window.addEventListener("blur", dismiss);
    return () => { document.removeEventListener("scroll", scrolled, true); window.removeEventListener("resize", dismiss); window.removeEventListener("blur", dismiss); };
  }, [open]);

  async function react(value: MessageReactionValue) {
    if (busy.current || callbacks.current.disabled) return;
    busy.current = true; setPending(true); setError("");
    try { await callbacks.current.onReact(value); if (mounted.current) close(true); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Couldn’t save that reaction. Try again."); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Copy isn’t available here. Select the message text to copy it.");
      await navigator.clipboard.writeText(message.body);
      if (mounted.current) setFeedback("Copied to clipboard");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Couldn’t copy. Select the text instead."); }
  }

  return <div className="ob-message-actions" ref={root}>
    <button type="button" ref={trigger} className="ob-message-actions-trigger"
      aria-label={`Actions for message from ${message.senderName}`} aria-controls={id} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => open ? close(true) : show()}>
      <MoreHorizontal size={18} aria-hidden="true" />
    </button>
    <div ref={panel} id={id} popover="auto" className="ob-message-action-panel" role="dialog" aria-label={`Message actions for ${message.senderName}`}
      onToggle={event => setOpen(event.currentTarget.matches(":popover-open"))}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + items.length) % items.length;
          items[next]?.focus({preventScroll:true});
        }
      }}>
      <div className="ob-reaction-tray" role="group" aria-label="React to message">
        {messageReactions.map(({value,label,Icon}) => <button key={value} type="button" aria-label={label}
          aria-pressed={message.reactions.some(reaction => reaction.emoji === value && reaction.reactedByYou)}
          disabled={disabled || pending} onClick={() => void react(value)}><Icon size={21} aria-hidden="true" /></button>)}
      </div>
      <div className="ob-message-action-list">
        <button type="button" onClick={() => { close(false); onReply(); }}><Reply size={17} aria-hidden="true" />Reply</button>
        <button type="button" onClick={() => void copy()}><Copy size={17} aria-hidden="true" />Copy text</button>
      </div>
      {feedback && <p className="ob-action-feedback" role="status">{feedback}</p>}
      {error && <p className="ob-action-error" role="alert">{error}</p>}
    </div>
  </div>;
}
