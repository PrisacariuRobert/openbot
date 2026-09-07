import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReactNode } from "react";

export const curve = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
  easing: Easing.bezier(0.65, 0, 0.25, 1),
};
export const open = { ...curve, easing: Easing.bezier(0.2, 0.8, 0.25, 1) };
export const useProgress = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return frame / Math.max(1, durationInFrames - 1);
};
// Each scene receives its narration-sized duration. Composition metadata is the
// full film, so do not use its duration for local normalized choreography.
export const useShot = (duration: number) => {
  const frame = useCurrentFrame();
  return { frame, p: frame / duration };
};
export const Shell = ({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) => (
  <AbsoluteFill
    style={{
      background: dark ? "#121212" : "#fff",
      color: dark ? "#fff" : "#151515",
      fontFamily: "Inter",
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);
export const enter = (p: number, a: number, b: number) =>
  interpolate(p, [a, b], [0, 1], open);
