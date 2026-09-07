import type { MascotKind } from "../shared/types";

export const mascotShapes: { id: MascotKind; name: string; label: string }[] = [
  { id: "nova", name: "Robot", label: "Robot shape" },
  { id: "blob", name: "Bubble", label: "Round shape" },
  { id: "sprout", name: "Sprout", label: "Sprout shape" },
  { id: "orbit", name: "Orbit", label: "Orbit shape" },
  { id: "pebble", name: "Pebble", label: "Pebble shape" },
  { id: "sunny", name: "Sunny", label: "Sunny shape" },
];
export const mascotColors = [
  ["Violet", "#6757d9"],
  ["Rose", "#d86889"],
  ["Leaf", "#299575"],
  ["Sky", "#528ed1"],
  ["Amber", "#c28735"],
  ["Coral", "#d77560"],
  ["Iris", "#8780bf"],
  ["Slate", "#687588"],
] as const;

export const mascotBodies: Record<MascotKind, string> = {
  nova: "M38 27H62Q82 27 82 48V66Q82 85 61 85H39Q18 85 18 66V48Q18 27 38 27Z",
  blob: "M51 22C73 22 86 38 85 58C84 78 71 88 49 87C27 89 14 74 16 55C16 37 31 24 51 22Z",
  sprout:
    "M50 29C70 29 83 41 83 62C83 80 72 88 50 88C28 88 17 80 17 62C17 41 30 29 50 29Z",
  orbit: "M50 23A32 32 0 1 1 49.99 23Z",
  pebble:
    "M58 29C74 29 85 42 84 61C83 80 71 87 47 87C28 87 14 79 15 64C15 51 27 47 31 38C36 28 46 24 58 29Z",
  sunny: "M50 28A28 28 0 1 1 49.99 28Z",
};
