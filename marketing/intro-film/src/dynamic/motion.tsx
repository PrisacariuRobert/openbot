import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  ArrowUp,
  Check,
  FileText,
  GitPullRequest,
  Presentation,
  Table2,
} from "lucide-react";
import { Mascot } from "../components";

// Choreography is authored in 30-fps units, rendered at 60 fps for smooth travel.
export function useMotionFrame() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame * 30) / fps;
}
export const curve = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
  easing: Easing.bezier(0.65, 0, 0.25, 1),
};
export const settle = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
};
export const flow = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const Sheet: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({
  children,
  dark,
}) => (
  <AbsoluteFill
    style={{
      background: dark ? "#101010" : "#fff",
      color: dark ? "#fff" : "#141414",
      fontFamily: "Inter",
      overflow: "hidden",
      perspective: 1500,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Portal: React.FC<{
  at: number;
  color: string;
  x?: number;
  y?: number;
  reverse?: boolean;
}> = ({ at, color, x = 960, y = 540, reverse }) => {
  const frame = useMotionFrame();
  return (
    <Interactive.Div
      name="Object-to-scene match cut"
      style={{
        position: "absolute",
        left: x - 60,
        top: y - 60,
        width: 120,
        height: 120,
        borderRadius: 120,
        background: color,
        scale: interpolate(
          frame,
          [at, at + 22],
          reverse ? [32, 0] : [0, 32],
          curve,
        ),
        pointerEvents: "none",
      }}
    />
  );
};

export const MaskWords: React.FC<{
  lines: string[];
  at?: number;
  size?: number;
  style?: React.CSSProperties;
}> = ({ lines, at = 0, size = 150, style }) => {
  const frame = useMotionFrame();
  return (
    <Interactive.Div
      name={`Kinetic type — ${lines.join(" ")}`}
      style={{
        fontSize: size,
        fontWeight: 620,
        lineHeight: 1.08,
        letterSpacing: -size * 0.055,
        ...style,
      }}
    >
      {lines.map((line, i) => (
        <div key={line} style={{ overflow: "hidden", paddingBottom: 7 }}>
          <div
            style={{
              translate: `0 ${interpolate(frame, [at + i * 7, at + i * 7 + 27], [size * 1.25, 0], settle)}px`,
            }}
          >
            {line}
          </div>
        </div>
      ))}
    </Interactive.Div>
  );
};

export const Actor: React.FC<{
  kind?: number;
  size?: number;
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  name?: string;
}> = ({
  kind = 0,
  size = 180,
  x,
  y,
  rotate = 0,
  scale = 1,
  name = "Teammate in motion",
}) => (
  <Interactive.Div
    name={name}
    style={{
      position: "absolute",
      width: size,
      height: size,
      left: x - size / 2,
      top: y - size / 2,
      rotate: `${rotate}deg`,
      scale,
    }}
  >
    <Mascot kind={kind} size={size} />
  </Interactive.Div>
);

export const SendOrb = () => (
  <div
    style={{
      width: 82,
      height: 82,
      borderRadius: 82,
      background: "#141414",
      color: "#fff",
      display: "grid",
      placeItems: "center",
    }}
  >
    <ArrowUp size={44} strokeWidth={2} />
  </div>
);

export const WorkFile: React.FC<{ kind: number; width?: number }> = ({
  kind,
  width = 370,
}) => {
  const frame = useMotionFrame();
  const icons = [FileText, Presentation, Table2, GitPullRequest];
  const Icon = icons[kind % 4];
  return (
    <div
      style={{
        width,
        height: width * 1.16,
        borderRadius: 19,
        background: "#fff",
        color: "#161616",
        border: "1px solid #e2e2e2",
        padding: width * 0.08,
        boxShadow: "0 28px 70px #00000010",
      }}
    >
      <Icon size={width * 0.12} strokeWidth={1.5} />
      <div style={{ height: width * 0.53, paddingTop: 28 }}>
        {kind === 2 ? (
          <div
            style={{ height: 140, display: "flex", alignItems: "end", gap: 12 }}
          >
            {[60, 94, 73, 127, 146].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 37,
                  height: h * Math.min(1, frame / 50),
                  borderRadius: "4px 4px 0 0",
                  background: "#222",
                }}
              />
            ))}
          </div>
        ) : kind === 3 ? (
          <div
            style={{ fontFamily: "monospace", fontSize: 21, lineHeight: 1.85 }}
          >
            ✓ Build
            <br />✓ Tests
            <br />✓ Ready for review
          </div>
        ) : (
          <>
            <div
              style={{
                height: 24,
                width: kind ? "70%" : "57%",
                background: "#191919",
                borderRadius: 3,
                marginBottom: 23,
              }}
            />
            {[95, 80, 90, 65, 85].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 7,
                  width: `${w}%`,
                  background: "#e1e1e1",
                  marginBottom: 14,
                  borderRadius: 2,
                }}
              />
            ))}
          </>
        )}
      </div>
      <div style={{ fontSize: 27, fontWeight: 590, letterSpacing: -0.6 }}>
        {
          ["Launch plan", "Pitch deck", "Project budget", "Tested code"][
            kind % 4
          ]
        }
      </div>
      <div
        style={{
          fontSize: 18,
          color: "#777",
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Check size={18} />
        Ready to review
      </div>
    </div>
  );
};
