import { useEffect, useState } from "react";
export type Appearance = "system" | "light" | "dark";
export function savedAppearance(): Appearance {
  try {
    const value = localStorage.getItem("openbot.appearance");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
const BAR = { light: "#ffffff", dark: "#1c1c1e" } as const;
export function applyAppearance(value: Appearance) {
  if (value === "system") delete document.documentElement.dataset.appearance;
  else document.documentElement.dataset.appearance = value;
  // Keep the phone's status bar and browser chrome in the chosen appearance.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = BAR[value === "system" ? scheme : value];
  });
}
export function useAppearance() {
  const [appearance, setAppearance] = useState(savedAppearance);
  useEffect(() => {
    applyAppearance(appearance);
    try {
      localStorage.setItem("openbot.appearance", appearance);
    } catch {
      /* Private browsing can disallow storage. */
    }
  }, [appearance]);
  return { appearance, setAppearance };
}
