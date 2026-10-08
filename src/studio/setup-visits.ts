import { useEffect } from "react";

const VISIT_EVERY_MS = 30 * 60 * 1000;

/** Tells this studio's server that the studio was opened or came back into
 * view, for the setup timeline in Settings → Your setup. It stays on the Mac. */
export function useSetupVisits() {
  useEffect(() => {
    let last = 0, pending = false;
    const note = () => {
      if (document.visibilityState !== "visible" || pending || Date.now() - last < VISIT_EVERY_MS) return;
      pending = true;
      // A refused request (not signed in yet, offline) is tried again at the next visit.
      fetch("/api/setup/visit", { method: "POST", credentials: "same-origin" })
        .then((response) => { if (response.ok) last = Date.now(); })
        .catch(() => undefined)
        .finally(() => { pending = false; });
    };
    note();
    document.addEventListener("visibilitychange", note);
    window.addEventListener("focus", note);
    return () => {
      document.removeEventListener("visibilitychange", note);
      window.removeEventListener("focus", note);
    };
  }, []);
}
