import path from "node:path";
import type { DeploymentStatus, RunnerHealth } from "../shared/types.js";

export type DeploymentConfig = {
  mode: "local" | "private_runner";
  appUrl: string;
  callbackBaseUrl: string;
  dataDir: string | null;
  trustProxy: boolean;
};

function canonicalAppUrl(raw: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("OPENBOT_APP_URL must start with http:// or https://.");
  if (url.username || url.password) throw new Error("OPENBOT_APP_URL cannot contain a username or password.");
  if (url.search || url.hash) throw new Error("OPENBOT_APP_URL cannot contain a query or fragment.");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

export function readDeploymentConfig(
  environment: NodeJS.ProcessEnv,
  defaults: { port: number; production: boolean },
): DeploymentConfig {
  const requestedMode = environment.OPENBOT_DEPLOYMENT_MODE?.trim() || "local";
  if (requestedMode !== "local" && requestedMode !== "private_runner") {
    throw new Error("OPENBOT_DEPLOYMENT_MODE must be local or private_runner.");
  }
  const fallback = `http://127.0.0.1:${defaults.production ? defaults.port : 4310}/`;
  const appUrl = canonicalAppUrl(environment.OPENBOT_APP_URL?.trim() || fallback);
  const dataDir = environment.OPENBOT_DATA_DIR?.trim() || null;
  if (requestedMode === "private_runner") {
    const url = new URL(appUrl);
    if (url.protocol !== "https:") throw new Error("Private runner mode requires an HTTPS OPENBOT_APP_URL.");
    if (url.pathname !== "/") throw new Error("Private runner OPENBOT_APP_URL must use the domain root, without an extra path.");
    if (!dataDir || !path.isAbsolute(dataDir)) throw new Error("Private runner mode requires an absolute OPENBOT_DATA_DIR on durable storage.");
  }
  return {
    mode: requestedMode,
    appUrl,
    callbackBaseUrl: requestedMode === "private_runner" ? appUrl : `http://127.0.0.1:${defaults.port}/`,
    dataDir,
    trustProxy: requestedMode === "private_runner",
  };
}

export function callbackUrl(config: DeploymentConfig, route: string): string {
  return new URL(route.replace(/^\//, ""), config.callbackBaseUrl).toString();
}

export function deploymentStatus(config: DeploymentConfig, runner: RunnerHealth): DeploymentStatus {
  if (config.mode === "local") {
    return {
      mode: "local",
      label: "This Mac",
      alwaysOn: false,
      publicUrl: null,
      dataLocation: "this_mac",
      checks: [
        { id: "runner", label: "Studio runner", status: runner.status === "online" ? "ready" : "action", detail: runner.status === "online" ? "Working while this Mac is awake" : "Start OpenBot on this Mac" },
      ],
    };
  }
  return {
    mode: "private_runner",
    label: "Private always-on home",
    alwaysOn: runner.status === "online",
    publicUrl: config.appUrl,
    dataLocation: "private_volume",
    checks: [
      { id: "https", label: "Private HTTPS", status: "ready", detail: "Encrypted connection ready" },
      { id: "storage", label: "Durable storage", status: "ready", detail: "Studio data stays on this host" },
      { id: "access", label: "Private access key", status: "ready", detail: "Required on every new device" },
      { id: "runner", label: "Always-on runner", status: runner.status === "online" ? "ready" : "action", detail: runner.status === "online" ? "Ready when your Mac is closed" : "Restart the private host" },
    ],
  };
}
