import { useEffect, useRef, useState } from "react";
import type { Bot, MascotKind } from "../shared/types";
import { AppearancePicker } from "./AppearancePicker";
import { Character } from "./Character";

export function AppearanceEditor({
  bot,
  onSaved,
}: {
  bot: Bot;
  onSaved: (bot: Bot) => void;
}) {
  const [shape, setShape] = useState(bot.mascot),
    [color, setColor] = useState(bot.color);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saving = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const saveSeq = useRef(0);
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);
  async function save(nextShape: MascotKind, nextColor: string) {
    if (saving.current) return;
    const ticket = ++saveSeq.current;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mascot: nextShape, color: nextColor }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Couldn’t save this look. Try again.");
      // A newer pick already supersedes this flight — don't refresh stale.
      if (ticket === saveSeq.current) onSaved(result);
    } catch (reason) {
      if (ticket === saveSeq.current)
        setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  // Picks save themselves after a beat — no Save button to hunt for.
  function pick(nextShape: MascotKind, nextColor: string) {
    setShape(nextShape);
    setColor(nextColor);
    setError("");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void save(nextShape, nextColor);
    }, 450);
  }
  return (
    <details className="appearance-editor">
      <summary>Change their look</summary>
      <div className="appearance-preview">
        <Character
          name={bot.name}
          variant={shape}
          color={color}
          size={96}
          mood="happy"
        />
        <p>Still {bot.name}. A little more you.</p>
      </div>
      <AppearancePicker
        name={bot.name}
        shape={shape}
        color={color}
        onShape={(next) => pick(next, color)}
        onColor={(next) => pick(shape, next)}
      />
      {error && (
        <p className="send-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="boundary-note" role="status">
          Saving their look…
        </p>
      )}
      <p className="boundary-note">
        Only their appearance changes. Their job, conversations and access stay
        the same.
      </p>
    </details>
  );
}
