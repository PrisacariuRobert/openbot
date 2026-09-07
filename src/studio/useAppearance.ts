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
export function applyAppearance(value: Appearance) {
  if (value === "system") delete document.documentElement.dataset.appearance;
  else document.documentElement.dataset.appearance = value;
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
