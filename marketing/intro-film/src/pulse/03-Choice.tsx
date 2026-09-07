import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Brand } from "../components";
import { Actor, Set, smooth, Caption } from "./shared";

export const Choice = () => {
  const frame = useCurrentFrame();
  return (
    <Set>
      <Interactive.Div
        name="Your AI, monumental type"
        style={{
          position: "absolute",
          left: 106,
          top: 95,
          fontSize: 263,
          fontWeight: 650,
          lineHeight: 0.91,
          letterSpacing: "-.05em",
          translate: `${interpolate(frame, [0, 42], [-600, 0], smooth)}px 0`,
        }}
      >
        Your team.
        <br />
        Your AI.
      </Interactive.Div>
      <Actor
        kind={0}
        size={460}
        style={{
          left: 1270,
          top: 150,
          rotate: `${interpolate(frame, [0, 70, 180], [30, -8, 6], smooth)}deg`,
          translate: `0 ${interpolate(frame, [0, 45], [750, 0], smooth)}px`,
        }}
      />
      <Interactive.Div
        name="Provider reel"
        style={{
          position: "absolute",
          left: 120,
          top: 705,
          display: "flex",
          alignItems: "center",
          gap: 72,
          translate: `${interpolate(frame, [0, 55, 145, 180], [500, 0, -30, -115], smooth)}px 0`,
        }}
      >
        {["openai", "claude", "opencode", "github"].map((id, i) => (
          <div
            key={id}
            style={{
              width: 125,
              height: 125,
              display: "grid",
              placeItems: "center",
              scale: interpolate(
                frame,
                [15 + i * 9, 50 + i * 9],
                [0.1, 1],
                smooth,
              ),
            }}
          >
            <Brand id={id} size={88} />
          </div>
        ))}
        <span style={{ fontSize: 46, fontWeight: 500 }}>+ local models</span>
      </Interactive.Div>
      <Caption>Choose your connection. Keep your choice.</Caption>
    </Set>
  );
};
