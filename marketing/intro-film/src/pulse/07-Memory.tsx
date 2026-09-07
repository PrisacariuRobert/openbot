import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Actor, Set, smooth, clamp } from "./shared";

export const Memory = () => {
  const frame = useCurrentFrame();
  return (
    <Set dark>
      <Interactive.Div
        name="Learning becomes a reusable orbit"
        style={{
          position: "absolute",
          inset: 0,
          rotate: `${interpolate(frame, [0, 100], [-10, 0], smooth)}deg`,
          scale: interpolate(frame, [0, 58], [1.35, 1], smooth),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 320,
            fontSize: 165,
            lineHeight: 0.97,
            fontWeight: 590,
            letterSpacing: "-.05em",
          }}
        >
          Learns
          <br />
          your way.
        </div>
        <Interactive.Div
          name="A continuous memory and skill loop"
          style={{
            position: "absolute",
            left: 895,
            top: 180,
            width: 650,
            height: 650,
            rotate: `${interpolate(frame, [0, 180], [-60, 55], clamp)}deg`,
          }}
        >
          <svg width={650} height={650}>
            <circle
              cx={325}
              cy={325}
              r={273}
              stroke="#333"
              strokeWidth={1}
              fill="none"
            />
            <circle
              cx={325}
              cy={325}
              r={273}
              stroke="#aaa"
              strokeWidth={2}
              strokeDasharray="600 1115"
              fill="none"
            />
          </svg>
          {["Remember", "Teach", "Reuse skills"].map((label, i) => {
            const angle = (i * Math.PI * 2) / 3;
            return (
              <div
                key={label}
                style={{
                  position: "absolute",
                  left: 325 + Math.cos(angle) * 273 - 110,
                  top: 325 + Math.sin(angle) * 273 - 45,
                  width: 220,
                  height: 90,
                  background: "#080808",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 31,
                  fontWeight: 500,
                  rotate: `${interpolate(frame, [0, 180], [60, -55], clamp)}deg`,
                  opacity: interpolate(
                    frame,
                    [i * 12, 30 + i * 12],
                    [0, 1],
                    clamp,
                  ),
                }}
              >
                {label}
              </div>
            );
          })}
        </Interactive.Div>
        <Actor
          kind={2}
          size={325}
          style={{
            left: 1060,
            top: 337,
            rotate: `${Math.sin(frame / 45) * 8}deg`,
          }}
        />
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 120,
          bottom: 85,
          fontSize: 30,
          color: "#999",
        }}
      >
        Context becomes a better starting point.
      </div>
    </Set>
  );
};
