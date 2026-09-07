import { Interactive, interpolate } from "remotion";
import {
  Actor,
  MaskWords,
  Sheet,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

export const Signature = () => {
  const frame = useMotionFrame();
  return (
    <Sheet dark>
      <Interactive.Div
        name="Open capability ribbon"
        style={{
          position: "absolute",
          top: 294,
          left: 0,
          display: "flex",
          alignItems: "center",
          gap: 100,
          whiteSpace: "nowrap",
          fontSize: 112,
          fontWeight: 600,
          letterSpacing: -5,
          translate: `${interpolate(frame, [0, 67], [530, -3290], flow)}px 0`,
          opacity: interpolate(frame, [60, 78], [1, 0], curve),
        }}
      >
        {[
          "Skills & MCP",
          "Memory",
          "Research",
          "Voice",
          "Code",
          "Your ideas",
        ].map((word, i) => (
          <span key={word} style={{ color: i % 2 ? "#fff" : "#aaa" }}>
            {word}
          </span>
        ))}
      </Interactive.Div>
      {[0, 1, 2, 3, 4, 5].map((kind) => {
        const angle = (kind * Math.PI) / 3 + frame / 43;
        const contraction = interpolate(
          frame,
          [15, 66, 112],
          [1.2, 1, 0],
          curve,
        );
        const endX = kind < 3 ? 730 + kind * 230 : 960;
        return (
          <Actor
            key={kind}
            kind={kind}
            size={kind < 3 ? 192 : 150}
            x={endX + Math.cos(angle) * 520 * contraction}
            y={300 + (310 + Math.sin(angle) * 190) * contraction}
            rotate={interpolate(
              frame,
              [0, 74, 114],
              [kind * 13 - 30, 15, 0],
              curve,
            )}
            scale={
              kind < 3
                ? interpolate(frame, [0, 30], [0.3, 1], settle)
                : interpolate(frame, [60, 100], [1, 0], curve)
            }
          />
        );
      })}
      <MaskWords
        lines={["OpenBot"]}
        at={90}
        size={188}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 415,
          textAlign: "center",
        }}
      />
      <MaskWords
        lines={["Your team. On your terms."]}
        at={108}
        size={54}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 661,
          textAlign: "center",
          letterSpacing: -2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 792,
          textAlign: "center",
          fontSize: 29,
          color: "#aaa",
          opacity: interpolate(frame, [127, 146], [0, 1], settle),
        }}
      >
        Open source. Local-first. Yours to build on.
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 851,
          textAlign: "center",
          fontSize: 25,
          color: "#888",
          opacity: interpolate(frame, [139, 157], [0, 1], settle),
        }}
      >
        github.com/PrisacariuRobert/openbot
      </div>
      <Interactive.Div
        name="Finish"
        style={{
          position: "absolute",
          inset: 0,
          background: "#101010",
          opacity: interpolate(frame, [195, 210], [0, 1], curve),
        }}
      />
    </Sheet>
  );
};
const flow = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
