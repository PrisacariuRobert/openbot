import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Stage, Mascot, ease } from "../components";

export const Hello = () => {
  const frame = useCurrentFrame();
  return (
    <Stage dark>
      <Interactive.Div
        name="Hello — mascot wakes"
        style={{
          position: "absolute",
          left: 775,
          top: 176,
          opacity: interpolate(frame, [8, 34], [0, 1], ease),
          scale: interpolate(frame, [8, 95], [0.86, 1], ease),
          translate: `0 ${interpolate(frame, [8, 75], [70, 0], ease)}px`,
        }}
      >
        <Mascot size={370} />
      </Interactive.Div>
      <Interactive.Div
        name="Opening thought"
        style={{
          position: "absolute",
          top: 625,
          left: 0,
          width: 1920,
          textAlign: "center",
          fontSize: 124,
          fontWeight: 600,
          letterSpacing: -6,
          opacity: interpolate(frame, [48, 74], [0, 1], ease),
          translate: `0 ${interpolate(frame, [48, 95], [40, 0], ease)}px`,
        }}
      >
        A little help.
      </Interactive.Div>
    </Stage>
  );
};
