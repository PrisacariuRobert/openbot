export const capabilityTitles = {
  provider: "Your AI", connectors: "Apps & tools", projects: "Projects", bot: "Teammate settings",
  files: "Files", artifacts: "Artifacts", routines: "Automations", control: "Permissions & usage", computer: "Computer",
  teach: "Skills & recipes", remote: "Your phone", live: "Activity & recovery", search: "Search",
} as const;
export type CapabilityPanel = keyof typeof capabilityTitles;
export function isCapabilityPanel(value: string | null): value is CapabilityPanel {
  return value !== null && Object.hasOwn(capabilityTitles, value);
}
