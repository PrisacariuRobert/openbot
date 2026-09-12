import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import "./choice-menu.css";

export type Choice = {
  value: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

/** Native top-layer popover with keyboard selection; works inside modal sheets too. */
export function ChoiceMenu({
  label,
  value,
  choices,
  onChange,
  placeholder = "Choose…",
  disabled = false,
  compact = false,
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState<CSSProperties>({});
  const search = useRef({ text: "", time: 0 });
  const selected = choices.find((item) => item.value === value);
  const items = () =>
    Array.from(
      popover.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]:not(:disabled)',
      ) || [],
    );
  function isShowing(): boolean {
    try {
      return popover.current?.matches(":popover-open") ?? open;
    } catch {
      return open;
    }
  }
  function close(restore = false) {
    search.current = { text: "", time: 0 };
    try {
      if (popover.current?.matches(":popover-open")) popover.current?.hidePopover();
    } catch {
      popover.current?.hidePopover();
    }
    setOpen(false);
    if (restore) trigger.current?.focus();
  }
  function show(edge?: "first" | "last") {
    if (disabled || !trigger.current || !popover.current) return;
    if (isShowing()) {
      // Already open (e.g. a second activation while showing): converge on
      // the open menu instead of throwing from showPopover().
      setOpen(true);
      items().find((item) => item.getAttribute("aria-selected") === "true")?.focus();
      return;
    }
    search.current = { text: "", time: 0 };
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(
      Math.max(rect.width, compact ? 238 : 250),
      window.innerWidth - 24,
    );
    const below = window.innerHeight - rect.bottom - 16,
      above = rect.top - 16;
    const up = below < Math.min(300, choices.length * 52 + 16) && above > below;
    setPosition({
      width,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(up
        ? { bottom: window.innerHeight - rect.top + 6, top: "auto" }
        : { top: rect.bottom + 6, bottom: "auto" }),
      maxHeight: Math.max(100, Math.min(320, up ? above : below)),
    });
    popover.current.showPopover();
    setOpen(true);
    const options = items();
    (edge === "last"
      ? options.at(-1)
      : edge === "first"
        ? options[0]
        : options.find(
            (item) => item.getAttribute("aria-selected") === "true",
          ) || options[0]
    )?.focus();
  }
  useEffect(() => {
    const element = popover.current;
    const toggle = (event: Event) =>
      setOpen((event as ToggleEvent).newState === "open");
    const dismiss = () => close();
    element?.addEventListener("toggle", toggle);
    window.addEventListener("resize", dismiss);
    return () => {
      element?.removeEventListener("toggle", toggle);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  return (
    <span className={`choice-menu ${compact ? "choice-compact" : ""}`}>
      <button
        type="button"
        ref={trigger}
        className="choice-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => (isShowing() ? close(true) : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            show(
              event.key === "End" || event.key === "ArrowUp"
                ? "last"
                : event.key === "Home"
                  ? "first"
                  : undefined,
            );
          }
        }}
      >
        {selected?.icon}
        <span>{selected?.label || placeholder}</span>
        <ChevronDown size={14} />
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        role="listbox"
        aria-label={label}
        className="choice-popover"
        style={position}
        onKeyDown={(event) => {
          const options = items(),
            index = options.indexOf(
              document.activeElement as HTMLButtonElement,
            );
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          } else if (event.key === "Tab") {
            close(true);
          } else if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
          ) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length;
            options[next]?.focus();
          } else if (
            event.key.length === 1 &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            event.key !== " "
          ) {
            event.preventDefault();
            const now = Date.now();
            search.current = {
              text:
                (now - search.current.time < 600 ? search.current.text : "") +
                event.key.toLowerCase(),
              time: now,
            };
            options
              .find((option) =>
                option.dataset.label
                  ?.toLowerCase()
                  .startsWith(search.current.text),
              )
              ?.focus();
          }
        }}
      >
        {choices.length ? (
          choices.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={value === item.value}
              data-label={item.label}
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => {
                onChange(item.value);
                close(true);
              }}
            >
              {item.icon}
              <span>
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </span>
              {value === item.value && <Check size={15} />}
            </button>
          ))
        ) : (
          <p>No options available yet.</p>
        )}
      </div>
    </span>
  );
}
