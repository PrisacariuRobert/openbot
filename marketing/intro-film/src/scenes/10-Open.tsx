import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Puzzle, Hand, Brain, Code2, Search, Mic } from "lucide-react";
import { Stage, Mascot, ease } from "../components";

export const Open = () => {
  const frame = useCurrentFrame();
  const icons = [Puzzle, Hand, Brain, Code2, Search, Mic];
  const ending = interpolate(frame, [104, 131], [0, 1], ease);
  return (
    <Stage dark>
      <Interactive.Div
        name="Open ecosystem"
        style={{
          position: "absolute",
          top: 168,
          width: 1920,
          textAlign: "center",
          opacity: 1 - ending,
          translate: `0 ${interpolate(frame, [104, 131], [0, -40], ease)}px`,
        }}
      >
        <div
          style={{
            fontSize: 111,
            lineHeight: 1.1,
            fontWeight: 600,
            letterSpacing: -5,
          }}
        >
          Made to make
          <br />
          more possible.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 95,
            marginTop: 95,
          }}
        >
          {[
            "Skills & MCP",
            "Teach by doing",
            "Memory",
            "Code projects",
            "Research",
            "Voice",
          ].map((label, i) => {
            const Icon = icons[i];
            return (
              <div
                key={label}
                style={{
                  width: 170,
                  opacity: interpolate(
                    frame,
                    [8 + 5 * i, 26 + 5 * i],
                    [0, 1],
                    ease,
                  ),
                }}
              >
                <Icon size={53} strokeWidth={1.3} />
                <div
                  style={{
                    fontSize: 22,
                    color: "#b5b5b5",
                    marginTop: 23,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="OpenBot brand signature"
        style={{
          position: "absolute",
          top: 123,
          width: 1920,
          textAlign: "center",
          opacity: ending,
          translate: `0 ${interpolate(frame, [104, 150], [45, 0], ease)}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 28,
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          {[0, 1, 2].map((kind) => (
            <div
              key={kind}
              style={{ translate: `0 ${Math.sin(frame / 34 + kind) * 6}px` }}
            >
              <Mascot kind={kind} size={176} />
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: 174,
            lineHeight: 1.13,
            fontWeight: 650,
            letterSpacing: -10,
          }}
        >
          OpenBot
        </div>
        <div style={{ fontSize: 46, marginTop: 26, letterSpacing: -1.5 }}>
          Your team. On your terms.
        </div>
        <div style={{ fontSize: 29, color: "#aaa", marginTop: 58 }}>
          Open source. Local-first. Yours to build on.
        </div>
        <div style={{ fontSize: 25, color: "#888", marginTop: 35 }}>
          github.com/PrisacariuRobert/openbot
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Cinematic end fade"
        style={{
          position: "absolute",
          inset: 0,
          background: "#111",
          opacity: interpolate(frame, [282, 299], [0, 1], ease),
        }}
      />
    </Stage>
  );
};
