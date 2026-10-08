// Task F7: a global shortcut opens the small "Ask my Mac" window from anywhere.
// Option+Space first; if another app owns it, Control+Option+Space.
export const ASK_SHORTCUTS = ["Alt+Space", "Control+Alt+Space"];

/** Registers the first free shortcut and returns it (or null). `open` toggles the window. */
export function registerAskShortcut(globalShortcut, open, shortcuts = ASK_SHORTCUTS) {
  for (const accelerator of shortcuts) {
    try {
      if (globalShortcut.register(accelerator, open)) return accelerator;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Shows the ask window, creating it when needed; a second press hides it. */
export function askWindowToggle(createWindow, base) {
  let window = null;
  return () => {
    if (window && !window.isDestroyed()) {
      if (window.isVisible() && window.isFocused()) window.hide();
      else { window.show(); window.focus(); }
      return window;
    }
    window = createWindow({
      width: 640, height: 460, frame: false, resizable: true, alwaysOnTop: true, skipTaskbar: true, show: false,
      title: "Ask my Mac", backgroundColor: "#ffffff",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.on("blur", () => { if (!window.isDestroyed()) window.hide(); });
    window.once("ready-to-show", () => { window.show(); window.focus(); });
    void window.loadURL(new URL("/ask", base).href);
    return window;
  };
}
