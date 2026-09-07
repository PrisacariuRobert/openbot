import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Mascot } from "../components";

export const smooth = {
  easing: Easing.bezier(0.18, 1, 0.25, 1),
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const Set: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({
  children,
  dark,
}) => (
  <AbsoluteFill
    style={{
      background: dark ? "#080808" : "#fafafa",
      color: dark ? "#fafafa" : "#111",
      fontFamily: "Inter",
      overflow: "hidden",
      perspective: 1500,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Actor: React.FC<{
  kind?: number;
  size?: number;
  style?: React.CSSProperties;
}> = ({ kind = 0, size = 300, style }) => (
  <div style={{ position: "absolute", width: size, height: size, ...style }}>
    <Mascot kind={kind} size={size} />
  </div>
);

export const Title: React.FC<{
  children: React.ReactNode;
  y?: number;
  size?: number;
  at?: number;
  style?: React.CSSProperties;
}> = ({ children, y = 110, size = 134, at = 0, style }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Editorial type"
      style={{
        position: "absolute",
        left: 110,
        right: 110,
        top: y,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: "-0.045em",
        fontWeight: 620,
        ...style,
        translate: `0 ${interpolate(frame, [at, at + 35], [100, 0], smooth)}px`,
        opacity: interpolate(frame, [at, at + 15], [0, 1], clamp),
      }}
    >
      {children}
    </Interactive.Div>
  );
};

export const Caption: React.FC<{
  children: React.ReactNode;
  dark?: boolean;
}> = ({ children, dark }) => (
  <Interactive.Div
    name="Product context"
    style={{
      position: "absolute",
      bottom: 75,
      left: 110,
      fontSize: 31,
      letterSpacing: "-0.025em",
      fontWeight: 480,
      color: dark ? "#ababab" : "#666",
    }}
  >
    {children}
  </Interactive.Div>
);

export const Chrome: React.FC<{
  children: React.ReactNode;
  label?: string;
  dark?: boolean;
  style?: React.CSSProperties;
}> = ({ children, label = "OpenBot", dark, style }) => (
  <div
    style={{
      width: 1300,
      height: 780,
      background: dark ? "#151515" : "white",
      color: dark ? "white" : "#111",
      borderRadius: 24,
      border: `1px solid ${dark ? "#444" : "#dedede"}`,
      overflow: "hidden",
      boxShadow: "0 45px 90px #00000020",
      ...style,
    }}
  >
    <div
      style={{
        height: 68,
        borderBottom: `1px solid ${dark ? "#333" : "#e9e9e9"}`,
        display: "flex",
        alignItems: "center",
        padding: "0 25px",
        gap: 9,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: 20,
            background: dark ? "#444" : "#ddd",
          }}
        />
      ))}
      <span
        style={{ marginLeft: 28, fontSize: 21, color: dark ? "#aaa" : "#777" }}
      >
        {label}
      </span>
    </div>
    {children}
  </div>
);

export const Dot: React.FC<{
  style?: React.CSSProperties;
  light?: boolean;
}> = ({ style, light }) => (
  <div
    style={{
      width: 70,
      height: 70,
      borderRadius: "50%",
      background: light ? "white" : "#111",
      position: "absolute",
      ...style,
    }}
  />
);
