export interface BrowserServicePresentation {
  service: string;
  label: string;
  connectorState: string;
  browserState: string;
  preferred: string;
}
export interface BrowserAccessPresentation {
  botId: string;
  browserEnabled: boolean;
  runtimeAvailable: boolean | null;
  services: BrowserServicePresentation[];
}
export function browserServiceLabel(
  service: BrowserServicePresentation,
  access: Pick<BrowserAccessPresentation, "browserEnabled" | "runtimeAvailable">
): string;
export function browserAccessMatchesRequest(
  payload: unknown,
  expectedBotId: string
): payload is BrowserAccessPresentation;
