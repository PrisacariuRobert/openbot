import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
export const move = (f: number, start: number, end: number, from = 0, to = 1) =>
  interpolate(f, [start, end], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
export function Stage({
  children,
  dark = false,
  darkness = dark ? 1 : 0,
}: {
  children: ReactNode;
  dark?: boolean;
  darkness?: number;
}) {
  return (
    <AbsoluteFill
      style={{
        background: `rgb(${250 - 229 * darkness}, ${250 - 229 * darkness}, ${250 - 229 * darkness})`,
        color: dark ? "white" : "#202020",
        fontFamily: "Inter",
        overflow: "hidden",
        perspective: 2200,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
export function Rig({
  children,
  scale = 1,
  x = 0,
  y = 0,
  tilt = 0,
}: {
  children: ReactNode;
  scale?: number;
  x?: number;
  y?: number;
  tilt?: number;
}) {
  return (
    <Interactive.Div
      name="Product / camera rig"
      style={{
        position: "absolute",
        width: 1440,
        height: 890,
        left: 240,
        top: 95,
        scale,
        translate: `${x}px ${y}px`,
        transform: `rotateY(${tilt}deg)`,
        transformOrigin: "50% 50%",
      }}
    >
      {children}
    </Interactive.Div>
  );
}
// Move only the conversation body. Window, sidebar and composer stay anchored.
// The last outgoing frame meets the first incoming frame at exactly the same pose.
export function ContentHandoff({
  previous,
  previousFrame,
  children,
}: {
  previous: ReactNode;
  previousFrame: number;
  children: ReactNode;
}) {
  const f = useCurrentFrame();
  const progress = move(f, 0, 54);
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {f < 54 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            translate: `${-progress * 100}% 0`,
          }}
        >
          <Freeze frame={previousFrame}>{previous}</Freeze>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          translate: `${(1 - progress) * 100}% 0`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Appear({
  children,
  at = 0,
}: {
  children: ReactNode;
  at?: number;
}) {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        opacity: move(f, at, at + 24),
        translate: `0 ${move(f, at, at + 30, 22, 0)}px`,
      }}
    >
      {children}
    </div>
  );
}
export function Caption({
  children,
  from = 0,
  until = 1000,
}: {
  children: ReactNode;
  from?: number;
  until?: number;
}) {
  const f = useCurrentFrame();
  return (
    <Interactive.Div
      name="Editorial / headline"
      style={{
        position: "absolute",
        left: 130,
        right: 130,
        bottom: 70,
        color: "#202020",
        fontSize: 78,
        fontWeight: 570,
        letterSpacing: "-.055em",
        lineHeight: 1.07,
        opacity: move(f, from, from + 28) * move(f, until - 20, until, 1, 0),
        translate: `0 ${move(f, from, from + 35, 30, 0)}px`,
      }}
    >
      {children}
    </Interactive.Div>
  );
}
