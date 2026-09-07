import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Brand } from "../components";
import { Set, smooth, clamp } from "./shared";

export const Open = () => {
  const frame = useCurrentFrame();
  return (
    <Set dark>
      <Interactive.Div
        name="The platform opens"
        style={{
          position: "absolute",
          left: 760,
          top: 300,
          width: 400,
          height: 400,
          scale: interpolate(
            frame,
            [0, 75, 160, 240],
            [3.8, 1, 1, 0.8],
            smooth,
          ),
          rotate: `y ${interpolate(frame, [0, 75], [80, 0], smooth)}deg`,
          translate: `${interpolate(frame, [105, 170], [0, -510], smooth)}px 0`,
        }}
      >
        <Brand id="github" size={400} dark />
      </Interactive.Div>
      <Interactive.Div
        name="Open source, not a closed box"
        style={{
          position: "absolute",
          left: 795,
          top: 230,
          fontSize: 122,
          lineHeight: 1.03,
          fontWeight: 570,
          letterSpacing: "-.065em",
          translate: `${interpolate(frame, [112, 165], [450, 0], smooth)}px 0`,
          opacity: interpolate(frame, [110, 135], [0, 1], clamp),
        }}
      >
        Open source.
        <br />
        Local first.
        <br />
        <span style={{ color: "#999" }}>Yours to extend.</span>
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 255,
          bottom: 115,
          fontSize: 32,
          color: "#999",
          opacity: interpolate(frame, [115, 150], [0, 1], clamp),
        }}
      >
        Skills. Community tools. MCP.
      </div>
    </Set>
  );
};
