import { useEffect, useRef, type ReactNode } from "react";

export type DirectOp =
  | { kind: "click"; x: number; y: number }
  | { kind: "press"; key: string }
  | { kind: "text"; value: string }
  | { kind: "scroll"; x: number; y: number; deltaY: number };

const VIEWPORT = { width: 1280, height: 820 };
// Single keystrokes forwarded to the page. Combos with held modifiers are
// never accepted; paste arrives as text instead.
const DIRECT_KEY =
  /^(?:[ -~]|Enter|Backspace|Delete|Tab|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|F(?:[1-9]|1[0-2]))$/;
const IGNORED_KEY = new Set([
  "Meta",
  "Shift",
  "Control",
  "Alt",
  "CapsLock",
  "Dead",
  "Process",
]);

function clampPoint(rect: DOMRect, clientX: number, clientY: number) {
  return {
    x: Math.round(
      Math.min(
        VIEWPORT.width,
        Math.max(0, ((clientX - rect.left) / rect.width) * VIEWPORT.width),
      ),
    ),
    y: Math.round(
      Math.min(
        VIEWPORT.height,
        Math.max(0, ((clientY - rect.top) / rect.height) * VIEWPORT.height),
      ),
    ),
  };
}

/** A live browser picture the owner drives directly: click a field and type,
 * like a real browser window. There is deliberately no separate typing box.
 *
 * Keystrokes queue in order and never block the screen; `send` carries each
 * operation to the page and surfaces its own errors. Nothing typed is stored,
 * logged, or sent anywhere except the page. Modifier combos (close, reload,
 * switch app) always stay local, so owner shortcuts can never reach the page.
 */
export function DirectScreen({
  image,
  alt,
  interactive,
  badge,
  empty,
  send,
  onInactiveClick,
  label,
}: {
  image: string | null;
  alt: string;
  interactive: boolean;
  badge: string;
  empty: ReactNode;
  send: (op: DirectOp) => void;
  onInactiveClick?: () => void;
  label: string;
}) {
  const screenRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const activeRef = useRef(interactive);
  activeRef.current = interactive;
  const push = (op: DirectOp) => {
    if (!activeRef.current) return;
    queue.current = queue.current.then(() => send(op)).catch(() => {});
  };
  // Touch screens cannot type into a div: tapping focuses an invisible input
  // that summons the OS keyboard and forwards each change. Desktop keeps
  // physical-keyboard capture on the screen itself. Both feel identical.
  const focusForTyping = () => {
    const coarse =
      window.matchMedia?.("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    if (coarse) keysRef.current?.focus({ preventScroll: true });
    else screenRef.current?.focus({ preventScroll: true });
  };
  const clickScreen = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activeRef.current) {
      onInactiveClick?.();
      return;
    }
    if (event.detail === 0) return;
    push({ kind: "click", ...clampPoint(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY) });
    focusForTyping();
  };
  const screenKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!activeRef.current) return;
    if (event.metaKey || event.ctrlKey || event.altKey) {
      // Paste inserts at the cursor; every other combo stays local.
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        navigator.clipboard
          ?.readText?.()
          .then((value) => {
            if (value) push({ kind: "text", value });
          })
          .catch(() => {
            /* Clipboard stayed local. */
          });
      }
      return;
    }
    if (IGNORED_KEY.has(event.key)) return;
    if (event.key.length > 1 && !DIRECT_KEY.test(event.key)) return;
    // preventDefault also keeps Escape from closing a host dialog and Tab
    // from leaving the screen: while active, those keys belong to the page.
    event.preventDefault();
    push({ kind: "press", key: event.key });
  };
  const keysInput = () => {
    const node = keysRef.current;
    if (!node || !activeRef.current) return;
    const value = node.value;
    node.value = "";
    if (value) push({ kind: "text", value });
  };
  const keysKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeRef.current) return;
    if (event.key === "Backspace" && !keysRef.current?.value) {
      event.preventDefault();
      push({ kind: "press", key: "Backspace" });
    } else if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      push({ kind: "press", key: event.key });
    }
  };
  // Wheel scrolls the page under the pointer. The listener must be
  // non-passive to own the gesture instead of scrolling the app.
  useEffect(() => {
    const node = screenRef.current;
    if (!node) return;
    let last = 0;
    const onWheel = (event: WheelEvent) => {
      if (!activeRef.current) return;
      event.preventDefault();
      const now = Date.now();
      if (now - last < 90) return;
      last = now;
      push({
        kind: "scroll",
        ...clampPoint(node.getBoundingClientRect(), event.clientX, event.clientY),
        deltaY: Math.max(-3000, Math.min(3000, event.deltaY)),
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <>
      <div
        ref={screenRef}
        className={interactive ? "direct-screen armed" : "direct-screen"}
        tabIndex={0}
        role="application"
        aria-label={label}
        onClick={clickScreen}
        onKeyDown={screenKeyDown}
        onDragStart={(event) => event.preventDefault()}
      >
        {image ? (
          <>
            <img src={image} alt={alt} draggable={false} />
            {interactive && (
              <span className="direct-screen-badge">{badge}</span>
            )}
          </>
        ) : (
          empty
        )}
      </div>
      <input
        ref={keysRef}
        className="takeover-hidden-keys"
        aria-label="Type directly into the browser page"
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        tabIndex={-1}
        onInput={keysInput}
        onKeyDown={keysKeyDown}
      />
    </>
  );
}
