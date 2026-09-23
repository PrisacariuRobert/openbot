import { app, BrowserWindow, dialog, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { installNavigationGuards } from "./navigation.mjs";
import { studioHealth, studioIdentity } from "./studio-identity.mjs";

// One shell, one web client, every platform: the window renders the same
// conversation-first OpenBot UI the browser and relay serve, so the design
// stays identical everywhere. The shell's job is the machine around it:
// start or reuse the owner's local server, then get out of the way.
const PORT = Number(process.env.OPENBOT_PORT || 4311);
const DEV_URL = process.env.OPENBOT_DEV_URL || "";
const BASE = DEV_URL || `http://127.0.0.1:${PORT}`;

// Isolated QA profiles never share cookies, cache, or the owner app lock.
if (process.env.OPENBOT_DESKTOP_USER_DATA) app.setPath("userData", path.resolve(process.env.OPENBOT_DESKTOP_USER_DATA));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  let runner = null;
  let logFd = null;
  let expectedIdentity = "";

  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      if (!DEV_URL) startBundledServer();
      await waitForServer(90_000);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (process.env.OPENBOT_QA_SCREENSHOT) {
        console.error("OpenBot startup failed:", detail);
        app.exit(1);
        return;
      }
      dialog.showMessageBoxSync({
        type: "error",
        title: "OpenBot",
        message: "OpenBot could not start its local studio.",
        detail,
      });
      app.quit();
      return;
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    // The detached runner keeps the studio alive for teammates and routines;
    // reopening the shell reattaches to it.
    app.quit();
  });

  function startBundledServer() {
    const bundle = process.env.OPENBOT_BUNDLE_DIR || path.join(process.resourcesPath || "resources", "openbot");
    const node = path.join(bundle, "bin", process.platform === "win32" ? "node.exe" : "node");
    const flatRunner = path.join(bundle, "scripts", "background-runner.mjs");
    const nestedRunner = path.join(bundle, "app", "scripts", "background-runner.mjs");
    const runnerScript = existsSync(flatRunner) ? flatRunner : nestedRunner;
    if (!existsSync(node) || !existsSync(runnerScript)) {
      throw new Error(`The OpenBot runtime was not found next to the app (looked in ${bundle}). Reinstall the app, or start the studio once from a terminal so the shell can attach to it.`);
    }
    const appRoot = runnerScript === flatRunner ? bundle : path.join(bundle, "app");
    const dataDir = process.env.OPENBOT_DATA_DIR || path.join(os.homedir(), ".openbot");
    expectedIdentity = studioIdentity(dataDir);
    const logDir = path.join(app.getPath("userData"), "logs");
    mkdirSync(logDir, { recursive: true });
    logFd = openSync(path.join(logDir, "runner.log"), "a");
    runner = spawn(node, [runnerScript], {
      cwd: appRoot,
      env: { ...process.env, PATH: [path.join(bundle, "bin"), process.env.PATH || ""].join(path.delimiter), OPENBOT_PORT: String(PORT), OPENBOT_DATA_DIR: dataDir, OPENBOT_DESKTOP_INSTANCE_ID: expectedIdentity, NODE_ENV: "production" },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    runner.unref();
  }

  function waitForServer(timeoutMs) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const healthURL = new URL("/api/healthz", BASE);
        const request = (healthURL.protocol === "https:" ? https : http).get(healthURL, { headers: expectedIdentity ? { "x-openbot-desktop-identity": expectedIdentity } : {} }, (response) => {
          response.resume();
          const state = studioHealth(response.statusCode, response.headers, !DEV_URL);
          if (state === "ready") resolve();
          else if (state === "wrong-studio") reject(new Error(`Another studio or service is using ${BASE}. Close it or choose a free OPENBOT_PORT; OpenBot will not open a different data home.`));
          else retry();
        });
        request.on("error", retry);
        request.setTimeout(2_500, () => { request.destroy(); retry(); });
      };
      const retry = () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`The studio did not answer at ${BASE} within ${Math.round(timeoutMs / 1000)} seconds.`));
        else setTimeout(attempt, 600);
      };
      attempt();
    });
  }

  function createWindow() {
    const window = new BrowserWindow({
      width: Number(process.env.OPENBOT_QA_WIDTH) || 1_280,
      height: Number(process.env.OPENBOT_QA_HEIGHT) || 820,
      useContentSize: true,
      // Borderless QA window measures app content, excluding OS titlebar pixels.
      frame: !process.env.OPENBOT_QA_HEIGHT,
      minWidth: 980,
      minHeight: 640,
      title: "OpenBot",
      backgroundColor: "#f5f5f7",
      autoHideMenuBar: true,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.once("ready-to-show", () => window.show());
    installNavigationGuards(window.webContents, BASE, (url) => shell.openExternal(url), () => {
      // URLs can contain sensitive query parameters; do not log them or errors.
      console.warn("OpenBot could not open that web link.");
    });
    void window.loadURL(BASE);
    if (process.env.OPENBOT_QA_SCREENSHOT) {
      window.webContents.once("did-finish-load", async () => {
        await new Promise((resolve) => setTimeout(resolve, 4_500));
        const image = await window.webContents.capturePage();
        const { writeFileSync } = await import("node:fs");
        writeFileSync(process.env.OPENBOT_QA_SCREENSHOT, image.toPNG());
        app.exit(0);
      });
    }
    return window;
  }

}
