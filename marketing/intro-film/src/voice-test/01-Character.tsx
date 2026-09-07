import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Mascot } from "../components";

export const CharacterShot = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#fff", overflow: "hidden" }}>
      <Interactive.Div
        name="Macro to team"
        style={{
          position: "absolute",
          left: 450,
          top: 250,
          scale: interpolate(frame, [0, 40, 95, 126], [7.5, 1, 1, 0.94], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.65, 0, 0.2, 1),
          }),
          translate: interpolate(frame, [0, 40], ["-80px 500px", "0px 0px"], {
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.65, 0, 0.2, 1),
          }),
          transformOrigin: "220px 260px",
          width: 1020,
          height: 560,
        }}
      >
        <Interactive.Div
          name="Nova arrives"
          style={{
            position: "absolute",
            left: 0,
            top: 70,
            rotate: interpolate(
              frame,
              [0, 35, 55],
              ["-12deg", "3deg", "0deg"],
              { extrapolateRight: "clamp" },
            ),
            translate: interpolate(frame, [0, 45], ["0px 28px", "0px 0px"], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Mascot kind={0} size={420} />
        </Interactive.Div>
        <Interactive.Div
          name="Milo leans in"
          style={{
            position: "absolute",
            left: 320,
            top: 70,
            translate: interpolate(
              frame,
              [20, 55, 80],
              ["450px 150px", "0px -12px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.2, 0.8, 0.3, 1),
              },
            ),
            rotate: interpolate(frame, [20, 70], ["18deg", "0deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Mascot kind={1} size={390} phase={34} />
        </Interactive.Div>
        <Interactive.Div
          name="Fern joins"
          style={{
            position: "absolute",
            left: 620,
            top: 70,
            translate: interpolate(
              frame,
              [30, 70, 90],
              ["800px -150px", "0px -8px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.2, 0.8, 0.3, 1),
              },
            ),
            rotate: interpolate(frame, [30, 80], ["-18deg", "0deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Mascot kind={2} size={390} phase={67} />
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
