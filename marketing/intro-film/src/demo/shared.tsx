import React from "react";
import { Interactive, interpolate, useCurrentFrame, Easing } from "remotion";
import {
  ArrowUp,
  Plus,
  MousePointer2,
  FileText,
  Check,
  ChevronRight,
} from "lucide-react";
import { Mascot } from "../components";

export const eased = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
};
export const linear = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const useSeconds = () => useCurrentFrame() / 60;

export const Reveal: React.FC<{
  at?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ at = 0, children, style }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Conversation event"
      style={{
        ...style,
        opacity: interpolate(frame, [at * 60, at * 60 + 16], [0, 1], linear),
        translate: `0 ${interpolate(frame, [at * 60, at * 60 + 28], [25, 0], eased)}px`,
      }}
    >
      {children}
    </Interactive.Div>
  );
};

export const Bubble: React.FC<{
  children: React.ReactNode;
  user?: boolean;
  at?: number;
  kind?: number;
}> = ({ children, user, at = 0, kind = 0 }) => (
  <Reveal
    at={at}
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      justifyContent: user ? "flex-end" : "flex-start",
      marginBottom: 27,
    }}
  >
    {!user && <Mascot size={43} kind={kind} />}
    <div
      style={{
        maxWidth: user ? 570 : 580,
        fontSize: 31,
        lineHeight: 1.36,
        letterSpacing: "-.02em",
        padding: user ? "20px 25px" : "8px 0",
        background: user ? "#151515" : "transparent",
        color: user ? "white" : "#202020",
        borderRadius: 24,
      }}
    >
      {children}
    </div>
  </Reveal>
);

export const Split: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  title: string;
  subtitle?: string;
  dark?: boolean;
}> = ({ left, right, title, subtitle, dark }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "660px 770px",
      height: "100%",
    }}
  >
    <div
      style={{
        position: "relative",
        height: "100%",
        overflow: "hidden",
        padding: "35px 38px 115px",
      }}
    >
      {left}
      <Composer />
    </div>
    <div
      style={{
        height: "100%",
        borderLeft: "1px solid #e4e4e4",
        background: dark ? "#151515" : "#fafafa",
        color: dark ? "white" : "#151515",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 94,
          padding: "24px 32px",
          borderBottom: `1px solid ${dark ? "#333" : "#e2e2e2"}`,
          fontSize: 25,
          fontWeight: 550,
        }}
      >
        {title}
        {subtitle && (
          <div
            style={{
              fontSize: 18,
              fontWeight: 400,
              color: "#888",
              marginTop: 6,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: 32 }}>{right}</div>
    </div>
  </div>
);

export const Composer: React.FC<{ text?: string; focused?: boolean }> = ({
  text = "Message Nova",
  focused,
}) => (
  <div
    style={{
      position: "absolute",
      left: 35,
      right: 35,
      bottom: 28,
      minHeight: 64,
      padding: "17px 19px",
      border: "1px solid #d8d8d8",
      borderRadius: 34,
      display: "flex",
      alignItems: "center",
      gap: 16,
      background: "white",
      fontSize: 24,
      color: text === "Message Nova" ? "#999" : "#222",
    }}
  >
    <Plus size={24} />
    <span style={{ flex: 1 }}>
      {text}
      {focused && "│"}
    </span>
    <div
      style={{
        background: text === "Message Nova" ? "#ddd" : "#171717",
        width: 36,
        height: 36,
        borderRadius: 30,
        color: "white",
        display: "grid",
        placeItems: "center",
      }}
    >
      <ArrowUp size={24} />
    </div>
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode;
  secondary?: boolean;
  style?: React.CSSProperties;
}> = ({ children, secondary, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 11,
      borderRadius: 40,
      padding: "16px 24px",
      background: secondary ? "white" : "#161616",
      color: secondary ? "#222" : "white",
      border: secondary ? "1px solid #ddd" : "1px solid #161616",
      fontSize: 25,
      fontWeight: 510,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Row: React.FC<{
  title: string;
  detail?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, detail, children, icon }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 17,
      padding: "22px 0",
      borderBottom: "1px solid #e3e3e3",
      fontSize: 27,
    }}
  >
    {icon}
    <div style={{ flex: 1 }}>
      {title}
      {detail && (
        <div
          style={{ fontSize: 21, color: "#777", marginTop: 7, lineHeight: 1.3 }}
        >
          {detail}
        </div>
      )}
    </div>
    {children}
  </div>
);
export const File: React.FC<{
  name: string;
  detail: string;
  at?: number;
  active?: boolean;
}> = ({ name, detail, at = 0, active }) => (
  <Reveal at={at}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "22px 20px",
        border: "1px solid #ddd",
        borderRadius: 16,
        marginBottom: 12,
        background: active ? "#ededed" : "#fafafa",
      }}
    >
      <FileText size={34} />
      <div style={{ fontSize: 26, fontWeight: 520 }}>
        {name}
        <div
          style={{ fontSize: 19, fontWeight: 400, color: "#777", marginTop: 6 }}
        >
          {detail}
        </div>
      </div>
      <ChevronRight size={25} style={{ marginLeft: "auto" }} />
    </div>
  </Reveal>
);

export const Pointer: React.FC<{
  from: [number, number];
  to: [number, number];
  at: number;
  click?: number;
}> = ({ from, to, at, click }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Owner interaction"
      style={{
        position: "absolute",
        zIndex: 20,
        left: interpolate(
          frame,
          [at * 60, at * 60 + 34],
          [from[0], to[0]],
          eased,
        ),
        top: interpolate(
          frame,
          [at * 60, at * 60 + 34],
          [from[1], to[1]],
          eased,
        ),
        opacity: interpolate(
          frame,
          [
            at * 60 - 5,
            at * 60 + 5,
            (click ?? at + 1) * 60 + 22,
            (click ?? at + 1) * 60 + 40,
          ],
          [0, 1, 1, 0],
          linear,
        ),
        scale: interpolate(
          frame,
          [
            (click ?? at + 1) * 60 - 3,
            (click ?? at + 1) * 60 + 3,
            (click ?? at + 1) * 60 + 13,
          ],
          [1, 0.8, 1],
          eased,
        ),
      }}
    >
      <MousePointer2 size={39} fill="#111" color="white" strokeWidth={1.8} />
    </Interactive.Div>
  );
};

export const Status: React.FC<{
  children: React.ReactNode;
  done?: boolean;
}> = ({ children, done }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontSize: 22,
      color: "#777",
      marginTop: 20,
    }}
  >
    {done ? (
      <Check size={24} />
    ) : (
      <span
        style={{ width: 8, height: 8, background: "#888", borderRadius: 12 }}
      />
    )}
    {children}
  </div>
);
