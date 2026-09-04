import { useEffect, useRef } from "react";

export function useModalFocus(onClose: () => void) {
  const layer = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const siblings = [...(layer.current?.parentElement?.children || [])].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== layer.current,
    );
    const previousInert = siblings.map((element) => element.inert);
    for (const element of siblings) element.inert = true;
    const focusable = () =>
      [
        ...node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
    (focusable()[0] || node).focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        node.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === node)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", handleKey);
    return () => {
      node.removeEventListener("keydown", handleKey);
      siblings.forEach((element, index) => {
        element.inert = previousInert[index]!;
      });
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return { layer, dialog };
}
