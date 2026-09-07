import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Laptop, Check } from "lucide-react";
import { Stage, Brand, Mascot, ease } from "../components";

export const Choice = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Interactive.Div
        name="Provider freedom"
        style={{
          position: "absolute",
          left: 154,
          top: 190,
          fontSize: 143,
          fontWeight: 600,
          letterSpacing: -7,
          lineHeight: 1.06,
          translate: `0 ${interpolate(frame, [0, 38], [60, 0], ease)}px`,
          opacity: interpolate(frame, [0, 20], [0, 1], ease),
        }}
      >
        Your AI.
        <br />
        Your choice.
      </Interactive.Div>
      <Interactive.Div
        name="Connection methods"
        style={{
          position: "absolute",
          left: 160,
          top: 565,
          fontSize: 33,
          color: "#777",
          lineHeight: 1.55,
          opacity: interpolate(frame, [30, 52], [0, 1], ease),
        }}
      >
        Bring a supported subscription.
        <br />
        An API key. Or a local model.
      </Interactive.Div>
      <Interactive.Div
        name="Provider chooser"
        style={{
          position: "absolute",
          left: 1070,
          top: 145,
          width: 670,
          border: "1px solid #e4e4e4",
          borderRadius: 28,
          padding: "28px 32px",
          translate: `0 ${interpolate(frame, [15, 60], [130, 0], ease)}px`,
          opacity: interpolate(frame, [15, 40], [0, 1], ease),
        }}
      >
        <div style={{ fontSize: 27, fontWeight: 600, margin: "4px 0 28px" }}>
          Choose your AI
        </div>
        {["OpenAI", "Claude", "GitHub Copilot", "OpenCode", "Local model"].map(
          (name, i) => (
            <div
              key={name}
              style={{
                display: "flex",
                gap: 25,
                alignItems: "center",
                height: 104,
                borderTop: "1px solid #e9e9e9",
                fontSize: 26,
                opacity: interpolate(
                  frame,
                  [25 + 8 * i, 48 + 8 * i],
                  [0, 1],
                  ease,
                ),
              }}
            >
              {i === 4 ? (
                <Laptop size={42} />
              ) : (
                <Brand
                  id={["openai", "claude", "github", "opencode"][i]}
                  size={42}
                />
              )}
              <span>{name}</span>
              {i === 0 && (
                <div
                  style={{
                    marginLeft: "auto",
                    opacity: interpolate(frame, [120, 140], [0, 1], ease),
                  }}
                >
                  <Check size={28} />
                </div>
              )}
            </div>
          ),
        )}
      </Interactive.Div>
      <Interactive.Div
        name="Choice stays personal"
        style={{
          position: "absolute",
          left: 140,
          top: 770,
          translate: `${interpolate(frame, [65, 150], [-40, 0], ease)}px 0`,
          opacity: interpolate(frame, [65, 90], [0, 1], ease),
        }}
      >
        <Mascot kind={1} size={160} />
      </Interactive.Div>
    </Stage>
  );
};
