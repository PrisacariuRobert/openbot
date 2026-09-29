import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/open-sans";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { Studio } from "./Studio";
import { StudioAccess } from "./StudioAccess";
import { PhonePairing, PhoneWelcome } from "./PhoneWelcome";
import "./studio.css";
import "./conversation-shell.css";
import "./design-tokens.css";
import "./settings-shell.css";
import { applyAppearance, savedAppearance } from "./useAppearance";

applyAppearance(savedAppearance());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname === "/pair" && window.location.hash.length > 1
      ? <PhonePairing />
      : <StudioAccess><Studio /><PhoneWelcome /></StudioAccess>}
  </StrictMode>,
);

// Preserve push subscriptions while updating old cached application shells.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js").then((registration) => registration.update()).catch(() => {});
  else void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
}
