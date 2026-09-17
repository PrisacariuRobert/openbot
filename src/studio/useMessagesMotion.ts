import { useEffect } from "react";

/** Small presentation-only interactions. Task success must come from real status
 * attributes; elapsed animation time never creates a successful task outcome. */
export function useMessagesMotion(ready = true) {
  useEffect(() => {
    if (!ready) return;
    const root = document.querySelector<HTMLElement>('.studio-shell');
    if (!root) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const active = new Set<Animation>();
    const previous = new WeakMap<Element, string>();
    const reduced = () => media.matches || document.documentElement.dataset.motion === 'off' || document.hidden;
    const sync = () => {
      root.dataset.motionPaused = String(reduced());
      if (reduced()) { active.forEach(animation => animation.cancel()); active.clear(); }
    };
    const animate = (node: Element, keyframes: Keyframe[], duration: number) => {
      if (reduced() || !node.isConnected || typeof node.animate !== 'function') return;
      const rect = node.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.width === 0) return;
      const animation = node.animate(keyframes, { duration, easing: 'cubic-bezier(.22,.78,.22,1)', iterations: 1 });
      active.add(animation); void animation.finished.catch(() => {}).then(() => active.delete(animation));
    };
    const greet = (event: PointerEvent | FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const subject = target.closest('.pinned-open,.conversation-identity,.contact-name,.teammate-card,.row-open,.conversation-person');
      if (!subject || (event.relatedTarget instanceof Node && subject.contains(event.relatedTarget))) return;
      const figure = subject.querySelector('.character,.mascot');
      if (figure) animate(figure, [{ transform: 'rotate(0deg)' }, { transform: 'translateY(-2px) rotate(-6deg)', offset: .35 }, { transform: 'rotate(3deg)', offset: .65 }, { transform: 'rotate(0deg)' }], 470);
    };
    const classify = (node: Element) => node.getAttribute('data-status') || node.getAttribute('data-mood') || '';
    const remember = (node: Element) => {
      if (node.matches('.character,.mascot')) previous.set(node, classify(node));
      node.querySelectorAll('.character,.mascot').forEach(child => previous.set(child, classify(child)));
    };
    remember(root);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(node => { if (node instanceof Element) remember(node); });
        else if (record.target instanceof Element && record.target.matches('.character,.mascot')) {
          const node = record.target, before = previous.get(node), now = classify(node);
          previous.set(node, now);
          if (before && /^(running|working|thinking|waiting_for_teammate)$/.test(before) && /^(completed|success|celebrating)$/.test(now)) {
            animate(node, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px) rotate(-4deg)', offset: .4 }, { transform: 'translateY(0)' }], 430);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-status','data-mood'] });
    const settings = new MutationObserver(sync);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    root.addEventListener('pointerover', greet); root.addEventListener('focusin', greet);
    document.addEventListener('visibilitychange', sync); media.addEventListener('change', sync); sync();
    return () => {
      observer.disconnect(); settings.disconnect(); active.forEach(animation => animation.cancel()); active.clear();
      root.removeEventListener('pointerover', greet); root.removeEventListener('focusin', greet);
      document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', sync);
      delete root.dataset.motionPaused;
    };
  }, [ready]);
}
