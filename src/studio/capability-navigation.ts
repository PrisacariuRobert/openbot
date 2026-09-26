export const capabilityTitles = {
  team: "Your team", usage: "Usage & limits", provider: "Your AI", connectors: "Apps & tools", projects: "Projects", bot: "Teammate settings",
  files: "Files", artifacts: "Files & results", routines: "Automations", control: "Permissions", computer: "Computer",
  teach: "Memory & skills", remote: "Your phone", telegram: "Chat apps", live: "Activity & recovery", search: "Search",
} as const;
export type CapabilityPanel = keyof typeof capabilityTitles;
export function isCapabilityPanel(value: string | null): value is CapabilityPanel {
  return value !== null && Object.hasOwn(capabilityTitles, value);
}
