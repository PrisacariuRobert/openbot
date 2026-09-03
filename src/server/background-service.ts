import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { BackgroundServiceStatus, RunnerHealth } from "../shared/types.js";

export const BACKGROUND_SERVICE_LABEL = "com.openbot.runner";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function backgroundServicePlist(input: { rootDir: string; dataDir: string; nodePath: string; port: number }): string {
  const launcher = path.join(input.rootDir, "scripts", "background-runner.mjs");
  const logDir = path.join(input.dataDir, "logs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${BACKGROUND_SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(input.nodePath)}</string><string>${xml(launcher)}</string></array>
  <key>WorkingDirectory</key><string>${xml(input.rootDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>OPENBOT_BACKGROUND_SERVICE</key><string>1</string>
    <key>OPENBOT_HOST</key><string>0.0.0.0</string>
    <key>OPENBOT_PORT</key><string>${input.port}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(path.join(logDir, "runner.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDir, "runner-error.log"))}</string>
</dict>
</plist>
`;
}

function launchctl(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/launchctl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", (error) => resolve({ code: 1, output: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output: output.trim() }));
  });
}

export class BackgroundServiceManager {
  readonly plistPath = path.join(homedir(), "Library", "LaunchAgents", `${BACKGROUND_SERVICE_LABEL}.plist`);

  constructor(private readonly input: { rootDir: string; dataDir: string; port: number }) {}

  status(health?: RunnerHealth): { backgroundService: BackgroundServiceStatus; backgroundServiceDetail: string } {
    if (process.platform !== "darwin") return { backgroundService: "unsupported", backgroundServiceDetail: "Automatic background launch is currently available on macOS." };
    if (!existsSync(this.plistPath)) return { backgroundService: "not_installed", backgroundServiceDetail: "OpenBot is awake only while its current server session is running." };
    const active = health?.status === "online";
    return {
      backgroundService: "installed",
      backgroundServiceDetail: active && health?.mode === "background"
        ? "Protected in the background and ready after login or an unexpected stop."
        : "Background protection is installed and will take over if this session stops.",
    };
  }

  async install(): Promise<void> {
    if (process.platform !== "darwin") throw new Error("Background launch is currently available on macOS.");
    const launchAgents = path.dirname(this.plistPath), logDir = path.join(this.input.dataDir, "logs");
    mkdirSync(launchAgents, { recursive: true, mode: 0o700 });
    mkdirSync(logDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.plistPath}.tmp`;
    writeFileSync(temporary, backgroundServicePlist({ ...this.input, nodePath: process.execPath }), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.plistPath);
    chmodSync(this.plistPath, 0o600);
    const domain = `gui/${typeof process.getuid === "function" ? process.getuid() : 501}`;
    await launchctl(["bootout", domain, this.plistPath]);
    const loaded = await launchctl(["bootstrap", domain, this.plistPath]);
    if (loaded.code !== 0) throw new Error(loaded.output || "macOS could not start OpenBot background protection.");
  }

  async uninstall(): Promise<void> {
    if (process.platform !== "darwin") throw new Error("Background launch is currently available on macOS.");
    const domain = `gui/${typeof process.getuid === "function" ? process.getuid() : 501}`;
    if (existsSync(this.plistPath)) await launchctl(["bootout", domain, this.plistPath]);
    rmSync(this.plistPath, { force: true });
  }
}
