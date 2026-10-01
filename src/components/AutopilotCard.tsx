import { useState } from "react";
import { AUTOPILOT_WARNING } from "../shared/autopilot";
import { SettingsCard, SettingsGroup, SwitchRow } from "../studio/Settings";

/** One teammate's Autopilot switch. It applies at once (never batched into Save) and always asks before turning on. */
export function AutopilotCard({ name, on, everyone, onChange }: { name: string; on: boolean; everyone: boolean; onChange: (next: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (next: boolean) => {
    if (next && !window.confirm(`Turn on Autopilot for ${name}?\n\n${AUTOPILOT_WARNING}`)) return;
    setBusy(true); setError("");
    onChange(next).catch(() => setError("That could not be changed. Try again.")).finally(() => setBusy(false));
  };
  return (
    <SettingsGroup title="Autopilot">
      <SettingsCard>
        <SwitchRow
          title={`Let ${name} act like a person`}
          description={everyone
            ? "Autopilot is on for every teammate. Turn it off for everyone in Control center → Advanced."
            : on
              ? `${name} sends, posts, buys and books without asking first. Every action shows in the activity feed.`
              : `Off: ${name} asks before it sends, buys, posts or changes anything. On: it does those without asking.`}
          checked={on || everyone}
          disabled={busy || everyone}
          onChange={change}
        />
      </SettingsCard>
      {error && <small role="alert">{error}</small>}
    </SettingsGroup>
  );
}
