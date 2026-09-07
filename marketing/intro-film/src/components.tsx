import React from "react";
import {
  AbsoluteFill,
  Img,
  Interactive,
  interpolate,
  Easing,
  useCurrentFrame,
  staticFile,
} from "remotion";
import {
  ArrowUp,
  Plus,
  Mic,
  Search,
  PanelRight,
  Check,
  FileText,
} from "lucide-react";

export const ease = {
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export const INK = "#151515";
export const LINE = "#e7e7e7";
export const colors = [
  "#6c58de",
  "#e7658c",
  "#29a47d",
  "#5995d5",
  "#dba440",
  "#8997aa",
];

export const Stage: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({
  children,
  dark,
}) => (
  <AbsoluteFill
    style={{
      background: dark ? "#111111" : "#ffffff",
      color: dark ? "#ffffff" : INK,
      fontFamily: "Inter",
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Mascot: React.FC<{
  kind?: number;
  size?: number;
  phase?: number;
}> = ({ kind = 0, size = 120, phase = 0 }) => {
  const frame = useCurrentFrame() + phase;
  const blink = frame % 143;
  const eyeHeight = blink > 133 && blink < 140 ? 1.4 : 9;
  const gaze = Math.sin(frame / 65) * 1.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ overflow: "visible", flexShrink: 0 }}
      aria-label={
        ["Nova", "Milo", "Fern", "Orbit", "Sunny", "Pebble"][kind % 6]
      }
    >
      <g fill={colors[kind % 6]}>
        {kind % 6 === 0 && (
          <>
            <rect x="23" y="31" width="74" height="74" rx="28" />
            <rect x="14" y="50" width="15" height="29" rx="7" opacity="0.82" />
            <rect x="91" y="50" width="15" height="29" rx="7" opacity="0.82" />
            <path d="M60 31V19" stroke={colors[0]} strokeWidth="4" />
            <circle cx="60" cy="15" r="5" />
          </>
        )}
        {kind % 6 === 1 && <ellipse cx="60" cy="67" rx="42" ry="43" />}
        {kind % 6 === 2 && (
          <>
            <rect x="22" y="36" width="76" height="72" rx="32" />
            <path
              d="M60 36C32 40 29 21 32 13C48 10 58 20 60 36Z"
              opacity="0.82"
            />
            <path
              d="M60 36C87 39 91 20 87 12C73 11 62 20 60 36Z"
              opacity="0.9"
            />
          </>
        )}
        {kind % 6 === 3 && (
          <>
            <circle cx="60" cy="64" r="35" />
            <ellipse
              cx="60"
              cy="65"
              rx="52"
              ry="16"
              fill="none"
              stroke={colors[3]}
              strokeWidth="7"
              transform="rotate(-24 60 65)"
            />
          </>
        )}
        {kind % 6 === 4 && (
          <path d="M60 17L70 30L88 26L92 43L108 52L99 67L105 83L87 89L79 105L62 98L47 106L37 91L19 88L23 69L13 55L28 44L31 26L48 29Z" />
        )}
        {kind % 6 === 5 && (
          <path d="M28 38C37 20 83 20 94 45C102 62 108 91 85 102C57 116 17 102 17 79C17 65 22 51 28 38Z" />
        )}
      </g>
      <g fill="#222132" transform={`translate(${gaze} 0)`}>
        <rect
          x="44"
          y={60 - eyeHeight / 2}
          width="6"
          height={eyeHeight}
          rx="3"
        />
        <rect
          x="70"
          y={60 - eyeHeight / 2}
          width="6"
          height={eyeHeight}
          rx="3"
        />
        <path
          d="M54 76Q60 83 66 76"
          fill="none"
          stroke="#222132"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
};

export const Brand: React.FC<{ id: string; size?: number; dark?: boolean }> = ({
  id,
  size = 44,
  dark,
}) => (
  <Img
    src={staticFile(`brands/${id}.svg`)}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      filter: dark ? "invert(1)" : undefined,
    }}
  />
);

export const Pill: React.FC<{
  children: React.ReactNode;
  primary?: boolean;
  style?: React.CSSProperties;
}> = ({ children, primary, style }) => (
  <div
    style={{
      padding: "14px 24px",
      borderRadius: 50,
      border: `1px solid ${primary ? INK : "#dedede"}`,
      background: primary ? INK : "#fff",
      color: primary ? "#fff" : INK,
      fontSize: 23,
      fontWeight: 550,
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

export const AppWindow: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  sidebar?: boolean;
  title?: string;
}> = ({ children, style, sidebar = true, title = "Nova" }) => (
  <div
    style={{
      width: 1450,
      height: 760,
      background: "#fff",
      border: `1px solid #dedede`,
      borderRadius: 26,
      overflow: "hidden",
      display: "flex",
      boxShadow: "0 28px 80px #0000000c",
      ...style,
    }}
  >
    {sidebar && (
      <div
        style={{
          width: 300,
          flexShrink: 0,
          background: "#fafafa",
          borderRight: `1px solid ${LINE}`,
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", gap: 10, marginBottom: 42 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 13,
                height: 13,
                borderRadius: 13,
                background: "#d4d4d4",
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 18,
            color: "#888",
            margin: "0 12px 30px",
          }}
        >
          <Search size={20} />
          Search
        </div>
        {["Nova", "Milo", "Fern"].map((name, i) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderRadius: 12,
              background: name === title ? "#eeeeee" : "transparent",
              padding: "13px 8px",
              marginBottom: 8,
            }}
          >
            <Mascot kind={i} size={43} />
            <div style={{ fontSize: 20, fontWeight: 520 }}>
              {name}
              <div style={{ fontSize: 14, color: "#858585", marginTop: 5 }}>
                {
                  [
                    "Your launch, in good hands.",
                    "Ready when you are.",
                    "Working on the details.",
                  ][i]
                }
              </div>
            </div>
          </div>
        ))}
        <div
          style={{
            marginTop: "auto",
            padding: 12,
            fontSize: 17,
            color: "#777",
          }}
        >
          Your team<span style={{ float: "right" }}>＋</span>
        </div>
      </div>
    )}
    <div
      style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          height: 80,
          flexShrink: 0,
          padding: "0 32px",
          borderBottom: `1px solid ${LINE}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Mascot size={37} />
        <span style={{ fontSize: 23, fontWeight: 600 }}>{title}</span>
        <PanelRight size={24} style={{ marginLeft: "auto", color: "#777" }} />
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {children}
      </div>
    </div>
  </div>
);

export const Composer: React.FC<{ text?: string; voice?: boolean }> = ({
  text = "Message Nova",
  voice,
}) => (
  <div
    style={{
      position: "absolute",
      bottom: 26,
      left: 36,
      right: 36,
      height: 65,
      borderRadius: 34,
      border: `1px solid ${LINE}`,
      display: "flex",
      alignItems: "center",
      gap: 17,
      padding: "0 14px 0 20px",
      background: "#fff",
      fontSize: 22,
      color: "#aaa",
    }}
  >
    <Plus size={24} />
    <span>{text}</span>
    <div
      style={{
        marginLeft: "auto",
        borderRadius: 24,
        background: "#181818",
        color: "#fff",
        height: 40,
        width: 40,
        display: "grid",
        placeItems: "center",
      }}
    >
      {voice ? <Mic size={22} /> : <ArrowUp size={24} />}
    </div>
  </div>
);

export const Bubble: React.FC<{
  children: React.ReactNode;
  user?: boolean;
  style?: React.CSSProperties;
}> = ({ children, user, style }) => (
  <div
    style={{
      background: user ? "#171717" : "#f4f4f4",
      color: user ? "#fff" : INK,
      padding: "23px 28px",
      borderRadius: user ? "26px 26px 7px 26px" : "7px 26px 26px 26px",
      fontSize: 25,
      lineHeight: 1.48,
      ...style,
    }}
  >
    {children}
  </div>
);

export const FileRow: React.FC<{
  title: string;
  detail?: string;
  checked?: boolean;
}> = ({ title, detail, checked = true }) => (
  <div
    style={{
      display: "flex",
      gap: 18,
      alignItems: "center",
      padding: "20px 22px",
      border: `1px solid ${LINE}`,
      borderRadius: 15,
      background: "#fff",
      fontSize: 23,
    }}
  >
    <FileText size={32} />
    <div style={{ flex: 1 }}>
      {title}
      {detail && (
        <div style={{ fontSize: 16, color: "#777", marginTop: 6 }}>
          {detail}
        </div>
      )}
    </div>
    {checked && <Check size={24} />}
  </div>
);

export const Reveal: React.FC<{
  children: React.ReactNode;
  at?: number;
  style?: React.CSSProperties;
  name?: string;
}> = ({ children, at = 0, style, name = "Reveal" }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        opacity: interpolate(frame, [at, at + 18], [0, 1], ease),
        translate: `0 ${interpolate(frame, [at, at + 32], [32, 0], ease)}px`,
        ...style,
      }}
    >
      {children}
    </Interactive.Div>
  );
};
