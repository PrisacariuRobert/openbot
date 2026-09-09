/** Only the studio's exact web origin may navigate inside the desktop shell.
 * External web links belong in the system browser; custom schemes and local
 * files must never be dispatched to an OS handler from renderer content.
 * https://www.electronjs.org/docs/latest/tutorial/security */
export function navigationTarget(value, base) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "blocked";
    return url.origin === new URL(base).origin ? "internal" : "external";
  } catch {
    return "blocked";
  }
}

export function installNavigationGuards(webContents, base, openExternal, onFailure = () => {}) {
  const openWebLink = (url) => {
    // Both synchronous throws and rejected OS-handler promises are contained.
    void Promise.resolve().then(() => openExternal(url)).catch(onFailure);
  };
  webContents.setWindowOpenHandler(({ url }) => {
    const target = navigationTarget(url, base);
    if (target === "internal") {
      // Never use the focused window: it may not be the requesting window.
      void Promise.resolve().then(() => webContents.loadURL(url)).catch(onFailure);
    } else if (target === "external") {
      openWebLink(url);
    }
    return { action: "deny" };
  });
  const onNavigate = (event, url) => {
    const target = navigationTarget(url, base);
    if (target === "internal") return;
    event.preventDefault();
    if (target === "external") openWebLink(url);
  };
  webContents.on("will-navigate", onNavigate);
  webContents.on("will-redirect", onNavigate);
}
