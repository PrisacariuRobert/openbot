import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/open-sans";
import "@fontsource-variable/jetbrains-mono";
import { Studio } from "./Studio";
import { StudioAccess } from "./StudioAccess";
import "./studio.css";
import "./conversation-shell.css";
import "./design-tokens.css";
import "./settings-shell.css";
import "./apple-polish.css";
import "./apple-pages.css";
import "./apple-capabilities.css";
import "./apple-brand.css";
import "./apple-contract-fixes.css";
import "./apple-review-fixes.css";
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
