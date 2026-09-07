import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ArrowUp, Check, MoreHorizontal, Plus } from "lucide-react";
import { Mascot } from "../components";

export const smooth = {
  easing: Easing.bezier(0.76, 0, 0.24, 1),
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const out = {
  easing: Easing.bezier(0.16, 1, 0.3, 1),
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const linear = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const move = (t: number, start: number, end: number, a = 0, b = 1) =>
  interpolate(t, [start, end], [a, b], smooth);
export const reveal = (t: number, start: number, end: number, a = 0, b = 1) =>
  interpolate(t, [start, end], [a, b], out);
export const useTime = () => useCurrentFrame() / useVideoConfig().fps;

export const World = ({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) => (
  <AbsoluteFill
    style={{
      overflow: "hidden",
      background: dark ? "#0c0c0d" : "#fdfdfd",
      color: dark ? "#fff" : "#111",
      fontFamily: "Inter",
      letterSpacing: "-0.035em",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Character = ({
  kind = 0,
  size = 180,
  shadow = false,
}: {
  kind?: number;
  size?: number;
  shadow?: boolean;
}) => (
  <div style={{ position: "relative", width: size, height: size }}>
    {shadow && (
      <div
        style={{
          position: "absolute",
          width: "62%",
          left: "19%",
          bottom: "-2%",
          height: "7%",
          borderRadius: "50%",
          background: "#00000018",
          filter: "blur(12px)",
        }}
      />
    )}
    <Mascot kind={kind} size={size} phase={kind * 43} />
  </div>
);

export const Message = ({
  children = "Help me launch this.",
  light = false,
  size = 44,
}: {
  children?: React.ReactNode;
  light?: boolean;
  size?: number;
}) => (
  <div
    style={{
      padding: "35px 48px",
      borderRadius: 60,
      background: light ? "white" : "#111",
      color: light ? "#111" : "white",
      display: "flex",
      alignItems: "center",
      gap: 42,
      whiteSpace: "nowrap",
      fontSize: size,
      fontWeight: 520,
      letterSpacing: "-0.035em",
    }}
  >
    {children}
  </div>
);

export const Checkmark = ({ size = 32 }: { size?: number }) => (
  <span
    style={{
      borderRadius: "50%",
      background: "#111",
      color: "white",
      width: size,
      height: size,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Check size={size * 0.56} strokeWidth={2.5} />
  </span>
);

export const RevealLine = ({
  children,
  start = 0,
  size = 132,
  style,
}: {
  children: React.ReactNode;
  start?: number;
  size?: number;
  style?: React.CSSProperties;
}) => {
  const t = useTime();
  return (
    <Interactive.Div
      name="Masked editorial type"
      style={{
        overflow: "hidden",
        fontSize: size,
        fontWeight: 640,
        lineHeight: 1.09,
        letterSpacing: "-0.07em",
        ...style,
      }}
    >
      <div
        style={{ translate: `0 ${reveal(t, start, start + 0.85, 110, 0)}%` }}
      >
        {children}
      </div>
    </Interactive.Div>
  );
};

export const Pack = ({ compact = false }: { compact?: boolean }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: compact ? 16 : 25,
      padding: compact ? "19px 22px" : "28px 32px",
      border: "1px solid #dedede",
      borderRadius: 20,
      background: "white",
      letterSpacing: "-0.025em",
    }}
  >
    <div
      style={{
        width: compact ? 38 : 54,
        height: compact ? 46 : 64,
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "linear-gradient(135deg, #fff, #eee)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: compact ? 16 : 22,
      }}
    >
      ↗
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: compact ? 26 : 36, fontWeight: 570 }}>
        Launch pack
      </div>
      <div style={{ fontSize: compact ? 18 : 24, color: "#777", marginTop: 6 }}>
        Deck, website & project plan
      </div>
    </div>
    <Checkmark size={compact ? 28 : 36} />
  </div>
);

export const ConversationScreen = ({
  phone = false,
  sent = false,
}: {
  phone?: boolean;
  sent?: boolean;
}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      background: "white",
      color: "#111",
      padding: phone ? "48px 22px 28px" : "26px 36px",
      display: "flex",
      flexDirection: "column",
      gap: phone ? 25 : 28,
      letterSpacing: "-0.025em",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderBottom: "1px solid #eee",
        paddingBottom: 18,
      }}
    >
      <Character size={phone ? 48 : 62} />
      <div style={{ fontSize: phone ? 24 : 28, fontWeight: 610 }}>Nova</div>
      <MoreHorizontal size={phone ? 24 : 28} style={{ marginLeft: "auto" }} />
    </div>
    <div
      style={{
        fontSize: phone ? 14 : 19,
        textAlign: "center",
        color: "#929292",
      }}
    >
      Today, 9:41
    </div>
    <div
      style={{
        alignSelf: "flex-end",
        background: "#111",
        color: "white",
        padding: phone ? "17px 20px" : "23px 30px",
        borderRadius: 25,
        fontSize: phone ? 24 : 31,
        maxWidth: "85%",
        lineHeight: 1.3,
      }}
    >
      Help me launch this.
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        color: "#777",
        fontSize: phone ? 17 : 22,
      }}
    >
      <Character kind={1} size={30} />
      <Character kind={2} size={30} /> Consulted your team
    </div>
    <div
      style={{ fontSize: phone ? 27 : 37, fontWeight: 480, lineHeight: 1.26 }}
    >
      The launch pack is ready.
      <br />
      Everything together.
    </div>
    <Pack compact={phone} />
    {sent && (
      <div
        style={{
          alignSelf: "flex-end",
          fontSize: phone ? 24 : 31,
          padding: "17px 25px",
          borderRadius: 25,
          background: "#111",
          color: "white",
        }}
      >
        Looks good. Send it.
      </div>
    )}
    <div style={{ flex: 1 }} />
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        border: "1px solid #ddd",
        padding: phone ? 14 : 19,
        borderRadius: 40,
        color: "#999",
        fontSize: phone ? 21 : 26,
      }}
    >
      <Plus size={phone ? 22 : 30} /> Message Nova{" "}
      <ArrowUp
        size={phone ? 25 : 30}
        style={{ marginLeft: "auto", color: "#444" }}
      />
    </div>
  </div>
);
