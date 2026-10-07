/** What the guided first run remembers in this browser: which teammate it made
 * (its conversation shows the first things to try) and whether the "add a
 * specialist" card was dismissed. Losing it only means the usual starters. */

const TEAMMATE_KEY = "sidemates.firstRunTeammate";
const SPECIALIST_CARD_KEY = "sidemates.specialistCardDismissed";

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Private browsing. */ } };

export const firstRunTeammate = () => read(TEAMMATE_KEY);
export const rememberFirstRunTeammate = (botId: string) => write(TEAMMATE_KEY, botId);
export const specialistCardDismissed = () => read(SPECIALIST_CARD_KEY) === "1";
export const dismissSpecialistCard = () => write(SPECIALIST_CARD_KEY, "1");
