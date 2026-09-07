import { useRef, useState } from "react";
import type { Bot } from "../shared/types";
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
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mascot: shape, color }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Couldn’t save this look. Try again.");
      onSaved(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
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
        onShape={setShape}
        onColor={setColor}
      />
      {error && (
        <p className="send-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary full-width"
        disabled={busy || (shape === bot.mascot && color === bot.color)}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save appearance"}
      </button>
      <p className="boundary-note">
        Only their appearance changes. Their job, conversations and access stay
        the same.
      </p>
    </details>
  );
}
