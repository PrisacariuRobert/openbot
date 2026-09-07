import {
  AbsoluteFill,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Mascot } from "../components";

export const VoiceSignature = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: "#fff",
        color: "#151515",
        fontFamily: "Inter",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Interactive.Div
        name="OpenBot signature"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateRight: "clamp",
          }),
        }}
      >
        <Mascot size={230} />
        <div
          style={{
            fontSize: 107,
            fontWeight: 650,
            letterSpacing: "-.055em",
            marginTop: 20,
          }}
        >
          OpenBot
        </div>
        <div
          style={{
            fontSize: 43,
            color: "#717171",
            marginTop: 22,
            letterSpacing: "-.025em",
          }}
        >
          Built around you.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
