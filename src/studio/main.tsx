import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Studio } from "./Studio";
import { StudioAccess } from "./StudioAccess";
import "./studio.css";
import "./conversation-shell.css";
import "./design-tokens.css";
import "./settings-shell.css";
import { applyAppearance, savedAppearance } from "./useAppearance";

applyAppearance(savedAppearance());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StudioAccess><Studio /></StudioAccess>
  </StrictMode>,
);

// Preserve push subscriptions while updating old cached application shells.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js").then((registration) => registration.update()).catch(() => {});
  else void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
}
