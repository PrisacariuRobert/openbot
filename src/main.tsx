import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const nativeIOS = new URLSearchParams(window.location.search).get("native") === "ios" || navigator.userAgent.includes("OpenBot-iOS/");
document.documentElement.dataset.native = nativeIOS ? "ios" : "web";

if (nativeIOS && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
