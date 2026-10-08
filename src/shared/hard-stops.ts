/** Hard stops (task T1): what always waits for the owner, at every autonomy level,
 * Autopilot included. The server decides them from what it observed (the page,
 * the control, the recipients, the command), never from the teammate's words. */

export const HARD_STOPS = ["money", "new-person", "gone-for-good", "publishing", "credentials"] as const;
export type HardStop = (typeof HARD_STOPS)[number];

export const HARD_STOP_TEXT: Record<HardStop, { label: string; why: string }> = {
  money: { label: "Money", why: "It may spend money: buying, paying, subscribing or a transfer." },
  "new-person": { label: "Someone new", why: "It reaches someone you haven't written to and haven't saved in Contacts, or Sidemates can't tell who it reaches." },
  "gone-for-good": { label: "Can't be undone", why: "It deletes something, or changes account or security settings." },
  publishing: { label: "Public", why: "It publishes: a public post, a push or a deploy." },
  credentials: { label: "Passwords and cards", why: "It uses a password or card details." },
};

export function isHardStop(value: unknown): value is HardStop {
  return typeof value === "string" && (HARD_STOPS as readonly string[]).includes(value);
}

/** The line on an approval card. */
export function hardStopLine(stop: HardStop): string {
  return `Always asks, even on Autopilot. ${HARD_STOP_TEXT[stop].why}`;
}
