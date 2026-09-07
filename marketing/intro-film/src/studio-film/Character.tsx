import { useCurrentFrame } from "remotion";

// Paths and proportions shared with the shipping SwiftUI StudioCharacter.
// Animation is frame-driven for the film; these are not flattened mascot images.
export const people = {
  Nova: { color: "#6757d9", kind: "nova", role: "Research and planning" },
  Milo: { color: "#d86889", kind: "blob", role: "Your personal teammate" },
  Fern: { color: "#299575", kind: "sprout", role: "Your personal teammate" },
  Orbit: { color: "#528ed1", kind: "orbit", role: "Your personal teammate" },
  Pebble: { color: "#687588", kind: "pebble", role: "Your personal teammate" },
  Sunny: { color: "#c28735", kind: "sunny", role: "Your personal teammate" },
} as const;
export type Person = keyof typeof people;
const sunPoints = Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2,
    r = i % 2 === 0 ? 32 : 28;
  return [50 + Math.cos(a) * r, 51 + Math.sin(a) * r];
});
const sunPath =
  sunPoints
    .map((point, i) => {
      const next = sunPoints[(i + 1) % 20],
        previous = sunPoints[19];
      return `${i === 0 ? `M${(previous[0] + point[0]) / 2} ${(previous[1] + point[1]) / 2} ` : ""}Q${point[0]} ${point[1]} ${(point[0] + next[0]) / 2} ${(point[1] + next[1]) / 2}`;
    })
    .join(" ") + " Z";
export function Character({
  name = "Nova",
  size = 44,
  busy = false,
  gaze = 0,
}: {
  name?: Person;
  size?: number;
  busy?: boolean;
  gaze?: number;
}) {
  const frame = useCurrentFrame();
  const { color, kind } = people[name];
  const phase = Object.keys(people).indexOf(name) * 31;
  const blink = (frame + phase) % 227 > 219;
  const floating =
    Math.sin((frame + phase) / (busy ? 18 : 40)) * (busy ? 1.6 : 0.8);
  const rays = Array.from({ length: 10 }, (_, i) => (
    <rect
      key={i}
      x="47.5"
      y="8"
      width="5"
      height="8"
      rx="2.5"
      transform={`rotate(${i * 36} 50 51)`}
      opacity=".8"
    />
  ));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <g fill={color} transform={`translate(0 ${floating})`}>
        {kind === "nova" && (
          <>
            <rect x="13" y="42" width="13" height="19" rx="6" opacity=".85" />
            <rect x="74" y="42" width="13" height="19" rx="6" opacity=".85" />
            <rect x="48" y="13" width="4" height="17" rx="2" />
            <circle cx="50" cy="15" r="6" />
            <circle cx="49" cy="13" r="2" fill="white" opacity=".45" />
            <rect x="20" y="25" width="60" height="58" rx="21" />
          </>
        )}
        {kind === "blob" && <circle cx="50" cy="54" r="32" />}
        {kind === "sprout" && (
          <>
            <path
              d="M50 34 Q24 30 34 10 Q57 9 50 34 M51 33 Q50 8 68 9 Q82 27 51 33"
              opacity=".82"
            />
            <rect x="20" y="31" width="60" height="53" rx="24" />
          </>
        )}
        {kind === "orbit" && (
          <>
            <ellipse
              cx="50"
              cy="56"
              rx="43"
              ry="13"
              transform="rotate(-23 50 56)"
              fill="none"
              stroke={color}
              strokeWidth="7"
              opacity=".65"
            />
            <ellipse cx="50.5" cy="53.5" rx="29.5" ry="30.5" />
          </>
        )}
        {kind === "pebble" && (
          <path d="M24 39 C30 20 51 18 61 23 C81 30 84 46 83 65 C82 81 67 85 51 84 C30 85 19 81 19 68 Q17 49 24 39Z" />
        )}
        {kind === "sunny" && (
          <>
            {rays}
            <path d={sunPath} />
          </>
        )}
        <g fill="#23242e" opacity=".94" transform={`translate(${gaze} 0)`}>
          <rect
            x="40"
            y={blink ? 50 : 47}
            width="5.5"
            height={blink ? 2 : 8}
            rx="2.75"
          />
          <rect
            x="55"
            y={blink ? 50 : 47}
            width="5.5"
            height={blink ? 2 : 8}
            rx="2.75"
          />
          <path
            d="M45 61 Q50 66 55 61"
            fill="none"
            stroke="#23242e"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity=".8"
          />
        </g>
        {kind === "orbit" && (
          <path
            d="M11 66 C28 83 84 65 91 38"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}
