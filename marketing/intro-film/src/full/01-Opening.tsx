import {
  AbsoluteFill,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { CharacterShot } from "../voice-test/01-Character";

export const FullOpening = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <CharacterShot />
      <Interactive.Div
        name="Introduce OpenBot"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 785,
          textAlign: "center",
          fontFamily: "Inter",
          fontSize: 84,
          fontWeight: 620,
          color: "#151515",
          letterSpacing: "-.045em",
          opacity: interpolate(frame, [55, 85], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        OpenBot
      </Interactive.Div>
    </AbsoluteFill>
  );
};
