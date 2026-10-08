/** Where the guided first run is, worked out from what has happened, so a
 * reload or a return from a sign-in tab lands in the right place. */

export type GuidedStage = "ai" | "model" | "teammate";

export function guidedStage(input: { connectionId: string | null; model: string | null }): GuidedStage {
  if (!input.connectionId) return "ai";
  return input.model ? "teammate" : "model";
}

/** The installer opens `?welcome=installed` on every install and update; only an empty studio starts the guided run. */
export function startsGuidedRun(search: string, teammates: number): boolean {
  return new URLSearchParams(search).get("welcome") === "installed" && teammates === 0;
}

/** The address without `welcome=installed`, or null when there is nothing to remove. */
export function withoutWelcome(href: string): string | null {
  const url = new URL(href);
  if (url.searchParams.get("welcome") !== "installed") return null;
  url.searchParams.delete("welcome");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A specialist can be offered while the team has no teammate in that role. */
export { missingSpecialists } from "../shared/first-run";
